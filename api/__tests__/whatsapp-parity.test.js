/**
 * Tests LOOP B: paridad gastos, categorías, timezone Lima, linking, recovery.
 * Ejecutar: npm run test:whatsapp
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveExpenseCategory,
  toDateKeyLima,
  currentYearMonthLima,
  expenseFechaIsoLima,
  dayBoundsLima,
  bumpRacha,
  applyXpToProfile,
  mapMoneda,
  buildWhatsappExpensePayload,
  XP_REGISTRAR_GASTO,
} = require('../../lib/expense-domain');

const { attemptVincularLink, userMessageForOutcome, MSG_VINCULO_NEUTRAL } = require('../_lib/vincular');
const { checkRateLimit } = require('../_lib/rate-limit');
const { claimWebhookEvent, markWebhookProcessed, STALE_PROCESSING_MS } = require('../_lib/webhook-idempotency');

function createLinkingSupabase(initial = {}) {
  const codes = new Map(Object.entries(initial.codes || {}));
  const links = new Map(Object.entries(initial.links || {}));
  const rateLimits = new Map();

  return {
    from(table) {
      if (table === 'whatsapp_link_codes') {
        return {
          select() {
            return {
              eq(field, value) {
                return {
                  maybeSingle: async () => {
                    if (field !== 'code') return { data: null, error: null };
                    const row = codes.get(value);
                    return { data: row ? { ...row } : null, error: null };
                  },
                };
              },
            };
          },
          update(patch) {
            return {
              eq(field, value) {
                const chain = {
                  is(f, v) {
                    return {
                      select: () => ({
                        maybeSingle: async () => {
                          const row = codes.get(value);
                          if (!row || (f === 'used_at' && row.used_at != null && v === null)) {
                            return { data: null, error: null };
                          }
                          Object.assign(row, patch);
                          codes.set(value, row);
                          return { data: { id: row.id }, error: null };
                        },
                      }),
                    };
                  },
                };
                if (field === 'id') {
                  const row = [...codes.values()].find((r) => r.id === value);
                  if (row && row.used_at == null) {
                    Object.assign(row, patch);
                    return {
                      is: () => ({
                        select: () => ({
                          maybeSingle: async () => ({ data: { id: row.id }, error: null }),
                        }),
                      }),
                    };
                  }
                }
                return chain;
              },
            };
          },
        };
      }

      if (table === 'whatsapp_links') {
        return {
          upsert(row) {
            links.set(row.user_id, row);
            return Promise.resolve({ error: null });
          },
        };
      }

      if (table === 'whatsapp_rate_limits') {
        return {
          select() {
            return {
              eq(f1, v1) {
                return {
                  eq(f2, v2) {
                    return {
                      eq(f3, v3) {
                        return {
                          maybeSingle: async () => {
                            const key = `${v1}|${v2}|${v3}`;
                            const row = rateLimits.get(key);
                            return { data: row ? { attempt_count: row.attempt_count } : null, error: null };
                          },
                        };
                      },
                    };
                  },
                };
              },
            };
          },
          upsert(row) {
            const key = `${row.wa_id}|${row.action}|${row.window_key}`;
            rateLimits.set(key, row);
            return Promise.resolve({ error: null });
          },
        };
      }

      throw new Error(`Unknown table ${table}`);
    },
    _codes: codes,
    _links: links,
  };
}

describe('Category resolution', () => {
  const userCategories = [
    { nombre: 'Alimentación', tipo: 'gasto' },
    { nombre: 'Transporte', tipo: 'gasto' },
    { nombre: 'Gym', tipo: 'gasto' },
    { nombre: 'Otros', tipo: 'gasto' },
  ];

  it('maps pollo 15 to user Alimentación via semantic alias', () => {
    const parsed = { categoryId: 'comida', categoryLabel: 'comida', description: 'pollo' };
    const r = resolveExpenseCategory(userCategories, parsed, 'pollo 15');
    assert.equal(r.categoria, 'Alimentación');
    assert.equal(r.matchKind, 'semantic');
  });

  it('maps gym 70 to custom Gym category', () => {
    const parsed = { categoryId: 'otros', categoryLabel: 'otros', description: 'gym' };
    const r = resolveExpenseCategory(userCategories, parsed, 'gym 70');
    assert.equal(r.categoria, 'Gym');
    assert.equal(r.matchKind, 'direct');
  });
});

describe('Currency parity', () => {
  it('uses profile moneda via mapMoneda', () => {
    assert.equal(mapMoneda('USD'), 'USD');
    assert.equal(mapMoneda('PEN'), 'PEN');
    assert.equal(mapMoneda(null, 'USD'), 'USD');
  });

  it('buildWhatsappExpensePayload uses user moneda', () => {
    const payload = buildWhatsappExpensePayload({
      userId: 'u1',
      parsed: { amount: 15, description: 'pollo', categoryLabel: 'comida', comercio: 'pollo' },
      categoria: 'Alimentación',
      moneda: 'USD',
      messageId: 'wamid.X',
      expenseIndex: 0,
    });
    assert.equal(payload.moneda, 'USD');
    assert.equal(payload.categoria, 'Alimentación');
    assert.equal(payload.xp_ganado, XP_REGISTRAR_GASTO);
    assert.equal(payload.source_message_id, 'wamid.X');
    assert.equal(payload.source_expense_index, 0);
  });
});

describe('Timezone America/Lima', () => {
  it('uses Lima date key near UTC midnight', () => {
    // 2026-04-01 04:30 UTC = 2026-03-31 23:30 Lima
    const d = new Date('2026-04-01T04:30:00.000Z');
    assert.equal(toDateKeyLima(d), '2026-03-31');
    assert.equal(currentYearMonthLima(d), '2026-03');
    assert.equal(expenseFechaIsoLima(d), '2026-03-31T12:00:00.000-05:00');
  });

  it('dayBoundsLima covers Lima calendar day', () => {
    const d = new Date('2026-06-15T18:00:00.000Z');
    const b = dayBoundsLima(d);
    assert.equal(b.dateKey, '2026-06-15');
    assert.equal(b.startIso, '2026-06-15T00:00:00.000-05:00');
    assert.equal(b.endIso, '2026-06-16T00:00:00.000-05:00');
  });
});

describe('XP / racha domain', () => {
  it('bumpRacha first day', () => {
    const r = bumpRacha(undefined, 0, '2026-04-01');
    assert.equal(r.rachaActual, 1);
    assert.equal(r.ultimoRegistro, '2026-04-01');
  });

  it('bumpRacha same day unchanged', () => {
    const r = bumpRacha('2026-04-01', 3, '2026-04-01');
    assert.equal(r.rachaActual, 3);
  });

  it('bumpRacha consecutive day increments', () => {
    const r = bumpRacha('2026-04-01', 2, '2026-04-02');
    assert.equal(r.rachaActual, 3);
  });

  it('applyXpToProfile levels up at threshold', () => {
    const r = applyXpToProfile({ nivel: 1, xpActual: 490, xpParaSiguienteNivel: 500, gain: 20 });
    assert.equal(r.nivel, 2);
    assert.equal(r.xpActual, 10);
    assert.equal(r.xpParaSiguienteNivel, 700);
  });
});

describe('VINCULAR linking', () => {
  it('valid code links and marks used', async () => {
    const supabase = createLinkingSupabase({
      codes: {
        '12345678': {
          id: 'c1',
          code: '12345678',
          user_id: 'user-1',
          used_at: null,
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      },
    });
    const r = await attemptVincularLink(supabase, '51999000000', '12345678');
    assert.equal(r.outcome, 'success');
    assert.equal(userMessageForOutcome('success').includes('vinculado'), true);
    assert.ok(supabase._links.has('user-1'));
    assert.ok(supabase._codes.get('12345678').used_at);
  });

  it('expired code returns neutral', async () => {
    const supabase = createLinkingSupabase({
      codes: {
        '12345678': {
          id: 'c1',
          code: '12345678',
          user_id: 'user-1',
          used_at: null,
          expires_at: new Date(Date.now() - 1000).toISOString(),
        },
      },
    });
    const r = await attemptVincularLink(supabase, '51999000000', '12345678');
    assert.equal(r.outcome, 'neutral');
    assert.equal(userMessageForOutcome(r.outcome), MSG_VINCULO_NEUTRAL);
  });

  it('used code returns neutral', async () => {
    const supabase = createLinkingSupabase({
      codes: {
        '12345678': {
          id: 'c1',
          code: '12345678',
          user_id: 'user-1',
          used_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      },
    });
    const r = await attemptVincularLink(supabase, '51999000000', '12345678');
    assert.equal(r.outcome, 'neutral');
    assert.equal(r.reason, 'code_used');
  });

  it('replay after success returns neutral', async () => {
    const supabase = createLinkingSupabase({
      codes: {
        '12345678': {
          id: 'c1',
          code: '12345678',
          user_id: 'user-1',
          used_at: null,
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      },
    });
    const first = await attemptVincularLink(supabase, '51999000000', '12345678');
    assert.equal(first.outcome, 'success');
    const second = await attemptVincularLink(supabase, '51999111111', '12345678');
    assert.equal(second.outcome, 'neutral');
    assert.equal(second.reason, 'code_used');
  });

  it('rate limit returns neutral outcome', async () => {
    const supabase = createLinkingSupabase({
      codes: {
        '12345678': {
          id: 'c1',
          code: '12345678',
          user_id: 'user-1',
          used_at: null,
          expires_at: new Date(Date.now() + 600000).toISOString(),
        },
      },
    });
    for (let i = 0; i < 5; i += 1) {
      await checkRateLimit(supabase, '51999000000', 'vincular', 5);
    }
    const r = await attemptVincularLink(supabase, '51999000000', '99999999');
    assert.equal(r.outcome, 'rate_limited');
    assert.equal(userMessageForOutcome(r.outcome), MSG_VINCULO_NEUTRAL);
  });
});

describe('Financial idempotency simulation', () => {
  it('multi-gasto partial retry does not duplicate first expense', async () => {
    const expenses = new Map();
    const messageId = 'wamid.PARTIAL1';

    async function saveIndex(index, amount) {
      const key = `${messageId}:${index}`;
      if (expenses.has(key)) return { duplicate: true };
      expenses.set(key, amount);
      return { duplicate: false };
    }

    await saveIndex(0, 15);
    let err;
    try {
      if (1 === 1) throw new Error('fail index 1');
      await saveIndex(1, 8);
    } catch (e) {
      err = e;
    }
    assert.ok(err);

    const retry0 = await saveIndex(0, 15);
    const retry1 = await saveIndex(1, 8);
    assert.equal(retry0.duplicate, true);
    assert.equal(retry1.duplicate, false);
    assert.equal(expenses.size, 2);
    assert.equal(expenses.get(`${messageId}:0`), 15);
    assert.equal(expenses.get(`${messageId}:1`), 8);
  });

  it('processing dedupe allows continue (expenses keyed)', async () => {
    const expenses = new Set();
    const messageId = 'wamid.RECOVER1';

    function saveOnce() {
      if (expenses.has(messageId)) return false;
      expenses.add(messageId);
      return true;
    }

    assert.equal(saveOnce(), true);
    assert.equal(saveOnce(), false);
  });
});

describe('Webhook stale processing constant', () => {
  it('STALE_PROCESSING_MS is 2 minutes', () => {
    assert.equal(STALE_PROCESSING_MS, 120000);
  });
});

describe('Chat IA WIP guard', () => {
  it('chat.js uses Bearer token for RLS queries', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const src = readFileSync(join(__dirname, '..', 'chat.js'), 'utf8');
    assert.match(src, /Authorization:\s*`Bearer \$\{accessToken\}`/);
    assert.match(src, /auth\.getUser\(accessToken\)/);
    assert.doesNotMatch(src, /SERVICE_ROLE/);
  });
});
