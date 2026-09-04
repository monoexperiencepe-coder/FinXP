/**
 * Tests de hardening WhatsApp (firma, idempotencia, parsers, rate limit).
 * Ejecutar: npm run test:whatsapp
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const { verifyMetaSignature, signRawBodyForTest } = require('../_lib/meta-signature');
const {
  claimWebhookEvent,
  markWebhookProcessed,
  markWebhookFailed,
} = require('../_lib/webhook-idempotency');
const { checkRateLimit, windowKey } = require('../_lib/rate-limit');
const {
  parseExpenseFromText,
  parseMultipleExpensesFromText,
  parseTodayExpenseQuery,
  parseMonthExpenseQuery,
  parseVincularCode,
} = require('../_lib/whatsapp-parsers');

function createMemorySupabase() {
  const webhookEvents = new Map();
  const rateLimits = new Map();

  return {
    from(table) {
      if (table === 'whatsapp_webhook_events') {
        return {
          insert(row) {
            const self = this;
            if (webhookEvents.has(row.message_id)) {
              return {
                select: () => ({
                  maybeSingle: async () => ({ data: null, error: { code: '23505' } }),
                }),
              };
            }
            const id = crypto.randomUUID();
            webhookEvents.set(row.message_id, { ...row, id });
            return {
              select: () => ({
                maybeSingle: async () => ({ data: { id }, error: null }),
              }),
            };
          },
          select(cols) {
            return {
              eq(field, value) {
                const chain = {
                  maybeSingle: async () => {
                    if (field !== 'message_id') return { data: null, error: null };
                    const row = webhookEvents.get(value);
                    if (!row) return { data: null, error: null };
                    if (cols === 'id, status') {
                      return { data: { id: row.id, status: row.status }, error: null };
                    }
                    return { data: row, error: null };
                  },
                };
                if (cols === 'id, status') {
                  chain.eq = (f2, v2) => ({
                    maybeSingle: async () => {
                      const row = webhookEvents.get(value);
                      if (!row || row[f2] !== v2) return { data: null, error: null };
                      return { data: { id: row.id, status: row.status }, error: null };
                    },
                  });
                }
                return chain;
              },
            };
          },
          update(patch) {
            const state = { patch, filters: [] };
            const apply = () => {
              for (const [msgId, row] of webhookEvents.entries()) {
                const ok = state.filters.every(([f, v]) => row[f] === v || (f === 'message_id' && msgId === v));
                if (ok) {
                  Object.assign(row, state.patch);
                  if (state.filters.some(([f]) => f === 'message_id')) {
                    const idFilter = state.filters.find(([f]) => f === 'message_id');
                    if (idFilter) webhookEvents.set(idFilter[1], row);
                  }
                  return row;
                }
              }
              return null;
            };
            const chain = {
              eq(field, value) {
                state.filters.push([field, value]);
                return chain;
              },
              select() {
                return {
                  maybeSingle: async () => {
                    const row = apply();
                    return { data: row ? { id: row.id } : null, error: null };
                  },
                };
              },
              then(resolve) {
                apply();
                resolve({ error: null });
              },
            };
            return chain;
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
    _webhookEvents: webhookEvents,
  };
}

describe('Meta signature', () => {
  const secret = 'test-meta-app-secret';
  let prevSecret;

  beforeEach(() => {
    prevSecret = process.env.META_APP_SECRET;
    process.env.META_APP_SECRET = secret;
  });

  afterEach(() => {
    process.env.META_APP_SECRET = prevSecret;
  });

  it('accepts valid signature', () => {
    const raw = Buffer.from(JSON.stringify({ object: 'whatsapp_business_account' }));
    const header = signRawBodyForTest(raw, secret);
    const result = verifyMetaSignature(raw, header);
    assert.equal(result.ok, true);
  });

  it('rejects incorrect signature', () => {
    const raw = Buffer.from('{"test":true}');
    const result = verifyMetaSignature(raw, 'sha256=' + 'a'.repeat(64));
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 403);
  });

  it('rejects missing header', () => {
    const result = verifyMetaSignature(Buffer.from('{}'), undefined);
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 401);
  });

  it('fails closed when secret missing', () => {
    delete process.env.META_APP_SECRET;
    const raw = Buffer.from('{}');
    const header = signRawBodyForTest(raw, 'x');
    const result = verifyMetaSignature(raw, header);
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 503);
  });
});

describe('Idempotency by message.id', () => {
  it('deduplicates retry of same message.id', async () => {
    const supabase = createMemorySupabase();
    const messageId = 'wamid.TEST123';

    const first = await claimWebhookEvent(supabase, { messageId, waId: '51999' });
    assert.equal(first.action, 'claim');

    let expenseInserts = 0;
    if (first.action === 'claim') {
      expenseInserts += 1;
      await markWebhookProcessed(supabase, messageId);
    }

    const second = await claimWebhookEvent(supabase, { messageId, waId: '51999' });
    assert.equal(second.action, 'deduplicated');
    if (second.action === 'claim') {
      expenseInserts += 1;
    }

    assert.equal(expenseInserts, 1);
  });

  it('allows retry after failed claim', async () => {
    const supabase = createMemorySupabase();
    const messageId = 'wamid.RETRY1';

    const first = await claimWebhookEvent(supabase, { messageId, waId: '1' });
    assert.equal(first.action, 'claim');

    await markWebhookFailed(supabase, messageId);

    const second = await claimWebhookEvent(supabase, { messageId, waId: '1' });
    assert.equal(second.action, 'claim');
    assert.equal(second.retry, true);
  });
});

describe('Multi-gasto idempotency', () => {
  it('parses 2 expenses but retry adds 0', async () => {
    const batch = parseMultipleExpensesFromText('pollo 15, taxi 8');
    assert.equal(batch.valid.length, 2);

    const supabase = createMemorySupabase();
    const messageId = 'wamid.MULTI1';
    let totalExpenses = 0;

    async function processOnce() {
      const claim = await claimWebhookEvent(supabase, { messageId, waId: '1' });
      if (claim.action === 'deduplicated') return;
      if (claim.action !== 'claim') throw new Error('claim failed');
      totalExpenses += batch.valid.length;
      await markWebhookProcessed(supabase, messageId);
    }

    await processOnce();
    await processOnce();

    assert.equal(totalExpenses, 2);
  });
});

describe('VINCULAR rate limit', () => {
  it('limits after 5 attempts in window', async () => {
    const supabase = createMemorySupabase();
    const waId = '51911111111';
    const results = [];
    for (let i = 0; i < 6; i += 1) {
      results.push(await checkRateLimit(supabase, waId, 'vincular', 5));
    }
    assert.equal(results.filter((r) => r.limited).length, 1);
    assert.equal(results[5].limited, true);
    assert.ok(windowKey());
  });
});

describe('Parser regression', () => {
  it('pollo 15', () => {
    assert.equal(parseExpenseFromText('pollo 15').kind, 'expense');
  });

  it('gasté 25 soles en comida', () => {
    const p = parseExpenseFromText('gasté 25 soles en comida');
    assert.equal(p.kind, 'expense');
    assert.equal(p.amount, 25);
  });

  it('cuanto gasté hoy', () => {
    assert.equal(parseTodayExpenseQuery('cuanto gasté hoy')?.kind, 'total_hoy');
  });

  it('resumen del mes', () => {
    assert.equal(parseMonthExpenseQuery('resumen del mes')?.kind, 'resumen_mes');
  });

  it('VINCULAR code', () => {
    assert.equal(parseVincularCode('VINCULAR 12345678'), '12345678');
  });
});

describe('Link code entropy', () => {
  it('8-digit link codes from generator range', () => {
    const { readFileSync } = require('node:fs');
    const { join } = require('node:path');
    const src = readFileSync(join(__dirname, '..', 'whatsapp-link-code.js'), 'utf8');
    assert.match(src, /10000000 \+ Math\.floor\(Math\.random\(\) \* 90000000\)/);
  });
});
