/**
 * Webhook WhatsApp (Meta) — GET (VERIFY_TOKEN) + POST: texto, VINCULAR, respuesta auto.
 * Env: VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID,
 *      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * No secretos en código. No modifica api/chat.js.
 */

const { createClient } = require('@supabase/supabase-js');

function getQueryParam(query, key) {
  if (!query || typeof query !== 'object') return undefined;
  return query[key];
}

function parseJsonBody(req) {
  if (req.body == null) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body || '{}');
    } catch {
      return {};
    }
  }
  if (typeof req.body === 'object') return req.body;
  return {};
}

/**
 * Primer mensaje entrante del payload estándar de WhatsApp Cloud API.
 */
function extractFirstIncomingMessage(body) {
  const entry = Array.isArray(body?.entry) ? body.entry[0] : null;
  const changes = entry && Array.isArray(entry.changes) ? entry.changes[0] : null;
  const value = changes?.value;
  const messages = value && Array.isArray(value.messages) ? value.messages : null;
  const msg = messages && messages.length > 0 ? messages[0] : null;
  return msg || null;
}

/**
 * Log útil sin volcar PII completo ni payloads enormes.
 */
function safeLogWebhookBody(body) {
  const msg = extractFirstIncomingMessage(body);
  const summary = {
    object: body?.object,
    entryLen: Array.isArray(body?.entry) ? body.entry.length : 0,
    message: msg
      ? {
          from: msg.from,
          type: msg.type,
          textBody:
            msg.type === 'text' && msg.text && typeof msg.text.body === 'string'
              ? `${msg.text.body.slice(0, 120)}${msg.text.body.length > 120 ? '…' : ''}`
              : undefined,
        }
      : null,
  };
  console.log('[whatsapp] webhook summary', JSON.stringify(summary));

  try {
    const raw = JSON.stringify(body);
    const max = 4000;
    console.log(
      '[whatsapp] body raw',
      raw.length > max ? `${raw.slice(0, max)}… (${raw.length} chars total)` : raw,
    );
  } catch (e) {
    console.log('[whatsapp] body raw (stringify error)', String(e));
  }
}

const AUTO_REPLY = `Puedo ayudarte a registrar gastos 💸\nprueba algo como: 'taxi 12'`;

const MSG_VINCULO_OK = 'Listo ✅ Tu WhatsApp ya está vinculado a tu cuenta.';
const MSG_VINCULO_BAD = 'Código inválido o vencido.';
const MSG_REQUIERE_VINCULO = 'Para usar este asistente, primero vincula tu cuenta desde la app.';
const MSG_FALTA_MONTO = "No entendí el monto 😅 prueba algo como: 'almuerzo 15'";

let supabaseServiceSingleton = null;

function getServiceSupabase() {
  if (supabaseServiceSingleton) return supabaseServiceSingleton;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  supabaseServiceSingleton = createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
  return supabaseServiceSingleton;
}

/**
 * Envía un mensaje de texto por la Cloud API de Meta.
 * @param {string} to
 * @param {string} text
 */
async function sendWhatsappTextMessage(to, text) {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] falta PHONE_NUMBER_ID o WHATSAPP_TOKEN; no se envía');
    return;
  }

  const url = `https://graph.facebook.com/v20.0/${phoneNumberId}/messages`;
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to,
      type: 'text',
      text: { body: text },
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error('[whatsapp] Graph API', res.status, raw);
  } else {
    console.log('[whatsapp] enviado OK', raw.length > 500 ? `${raw.slice(0, 500)}…` : raw);
  }
}

/**
 * Parsea "VINCULAR {code}" (sin distinguir mayúsculas en el prefijo). Devuelve code o null.
 * @param {string} [text]
 */
function parseVincularCode(text) {
  if (typeof text !== 'string') return null;
  const t = text.trim();
  if (t.length < 10) return null; // mínimo "VINCULAR x"
  const u = t.toUpperCase();
  if (!u.startsWith('VINCULAR ')) return null;
  const code = t.slice('VINCULAR '.length).trim();
  return code || null;
}

/**
 * Intenta vincular wa_id (from) al user del código. Si aplica, envía WhatsApp y return true.
 * @param {string} from
 * @param {string} textBody
 * @returns {Promise<boolean>} true = ya se respondió por WA (VINCULAR o error de vinculación)
 */
async function tryVinculacionIfApplicable(from, textBody) {
  const code = parseVincularCode(textBody);
  if (code == null) return false;

  const supabase = getServiceSupabase();
  if (!supabase) {
    console.error('[whatsapp] VINCULAR: faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY');
    try {
      await sendWhatsappTextMessage(
        from,
        'Ahora no se puede vincular. Intentá de nuevo en un rato o verificá la app.',
      );
    } catch (e) {
      console.error('[whatsapp] VINCULAR env error', e);
    }
    return true;
  }

  const { data: row, error: selErr } = await supabase
    .from('whatsapp_link_codes')
    .select('id, user_id, used_at, expires_at')
    .eq('code', code)
    .is('used_at', null)
    .maybeSingle();

  if (selErr) {
    console.error('[whatsapp] VINCULAR select', selErr);
    try {
      await sendWhatsappTextMessage(from, MSG_VINCULO_BAD);
    } catch (e) {
      console.error(e);
    }
    return true;
  }

  if (!row) {
    try {
      await sendWhatsappTextMessage(from, MSG_VINCULO_BAD);
    } catch (e) {
      console.error(e);
    }
    return true;
  }

  if (new Date(row.expires_at) <= new Date()) {
    try {
      await sendWhatsappTextMessage(from, MSG_VINCULO_BAD);
    } catch (e) {
      console.error(e);
    }
    return true;
  }

  const nowIso = new Date().toISOString();

  const { error: upsertErr } = await supabase
    .from('whatsapp_links')
    .upsert({ user_id: row.user_id, wa_id: from, verified_at: nowIso }, { onConflict: 'user_id' });

  if (upsertErr) {
    console.error('[whatsapp] VINCULAR upsert whatsapp_links', upsertErr);
    try {
      await sendWhatsappTextMessage(from, MSG_VINCULO_BAD);
    } catch (e) {
      console.error(e);
    }
    return true;
  }

  const { error: useErr } = await supabase
    .from('whatsapp_link_codes')
    .update({ used_at: nowIso })
    .eq('id', row.id)
    .is('used_at', null);

  if (useErr) {
    console.error('[whatsapp] VINCULAR used_at', useErr);
  }

  try {
    await sendWhatsappTextMessage(from, MSG_VINCULO_OK);
  } catch (e) {
    console.error('[whatsapp] VINCULAR ok message', e);
  }
  return true;
}

/**
 * Verifica si el remitente ya está vinculado en whatsapp_links.
 * @param {string} waId
 * @returns {Promise<boolean>}
 */
async function isLinkedWaId(waId) {
  const supabase = getServiceSupabase();
  if (!supabase) return false;
  const { data, error } = await supabase
    .from('whatsapp_links')
    .select('user_id')
    .eq('wa_id', waId)
    .maybeSingle();
  if (error) {
    console.error('[whatsapp] link lookup', error);
    return false;
  }
  return !!data?.user_id;
}

/**
 * Obtiene user_id vinculado desde whatsapp_links.
 * @param {string} waId
 * @returns {Promise<string | null>}
 */
async function getLinkedUserIdByWaId(waId) {
  const supabase = getServiceSupabase();
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('whatsapp_links')
    .select('user_id')
    .eq('wa_id', waId)
    .maybeSingle();
  if (error) {
    console.error('[whatsapp] linked user lookup', error);
    return null;
  }
  return typeof data?.user_id === 'string' ? data.user_id : null;
}

function monthKeyLocal(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

function cleanDescriptionText(text) {
  let s = String(text || '');
  s = s.replace(/\b(gaste|gast[eé]|pague|pagu[eé]|compre|compr[eé]|en)\b/gi, ' ');
  s = s.replace(/s\/\.?/gi, ' ');
  s = s.replace(/\bsol(es)?\b/gi, ' ');
  s = s.replace(/\d+(?:[.,]\d{1,2})?/g, ' ');
  s = s.replace(/\s+/g, ' ').trim();
  return s;
}

function detectCategoryInfo(textLower) {
  const rules = [
    { id: 'comida', label: 'comida', keys: ['comida', 'almuerzo', 'desayuno', 'cena', 'restaurante', 'menu', 'menú', 'pollo', 'cafe', 'café'] },
    { id: 'transporte', label: 'transporte', keys: ['taxi', 'uber', 'bus', 'pasaje', 'transporte', 'gasolina'] },
    { id: 'vivienda', label: 'vivienda', keys: ['alquiler', 'renta', 'departamento', 'vivienda'] },
    { id: 'salud', label: 'salud', keys: ['salud', 'farmacia', 'medicina', 'doctor', 'clinica'] },
    { id: 'servicios', label: 'servicios', keys: ['luz', 'agua', 'internet', 'telefono', 'servicio'] },
    { id: 'suscripciones', label: 'suscripciones', keys: ['netflix', 'spotify', 'suscripcion', 'suscripciones'] },
    { id: 'educacion', label: 'educacion', keys: ['curso', 'colegio', 'universidad', 'educacion'] },
    { id: 'ocio', label: 'ocio', keys: ['cine', 'ocio', 'fiesta', 'salida'] },
  ];
  for (const r of rules) {
    if (r.keys.some((k) => textLower.includes(k))) return { categoryId: r.id, categoryLabel: r.label };
  }
  return { categoryId: 'otros', categoryLabel: 'otros' };
}

function categoryEmoji(categoryId) {
  const map = {
    comida: '🍔',
    transporte: '🚌',
    vivienda: '🏠',
    salud: '💊',
    servicios: '💡',
    suscripciones: '📱',
    educacion: '📚',
    ocio: '🎬',
    otros: '📦',
  };
  return map[categoryId] || '💸';
}

function parseExpenseFromText(text) {
  if (typeof text !== 'string' || !text.trim()) return { kind: 'none' };
  const raw = text.trim();
  const lower = raw.toLowerCase();

  const amountMatch = lower.match(/(\d+(?:[.,]\d{1,2})?)/);
  const hasExpenseVerb = /(gaste|gast[eé]|pague|pagu[eé]|compre|compr[eé])/.test(lower);
  const hasCurrencyHint = /(s\/|sol|soles|pen)/.test(lower);
  const hasCategoryHint =
    /(comida|almuerzo|taxi|uber|transporte|farmacia|internet|luz|agua|cine|alquiler|restaurante)/.test(lower);

  const looksLikeExpense = hasExpenseVerb || (amountMatch && (hasCurrencyHint || hasCategoryHint || lower.split(/\s+/).length >= 2));
  if (!looksLikeExpense) return { kind: 'none' };
  if (!amountMatch) return { kind: 'missing_amount' };

  const amount = Number.parseFloat(amountMatch[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return { kind: 'missing_amount' };

  const { categoryId, categoryLabel } = detectCategoryInfo(lower);
  const desc = cleanDescriptionText(raw);
  const description = desc || categoryLabel;
  return {
    kind: 'expense',
    amount: Math.round(amount * 100) / 100,
    description,
    categoryId,
    categoryLabel,
    comercio: description.slice(0, 80),
  };
}

function formatPen(amount) {
  const rounded = Math.round(amount * 100) / 100;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/\.00$/, '');
}

async function saveExpenseFromWhatsapp(userId, parsed) {
  const supabase = getServiceSupabase();
  if (!supabase) throw new Error('Falta configuración de Supabase');
  const now = new Date();
  const fechaIso = now.toISOString();
  const mes = monthKeyLocal(now);
  const payload = {
    user_id: userId,
    fecha: fechaIso,
    cuenta: 'Principal',
    medio_de_pago: 'WhatsApp',
    banco: 'N/A',
    categoria: parsed.categoryId,
    comercio: parsed.comercio,
    es_esencial: false,
    estado_de_animo: null,
    moneda: 'PEN',
    descripcion: parsed.description,
    importe: parsed.amount,
    mes,
    xp_ganado: 10,
  };
  const { error } = await supabase.from('expenses').insert(payload);
  if (error) throw error;
}

function dayBoundsLocal(refDate = new Date()) {
  const start = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate(), 0, 0, 0, 0);
  const end = new Date(refDate.getFullYear(), refDate.getMonth(), refDate.getDate() + 1, 0, 0, 0, 0);
  return { startIso: start.toISOString(), endIso: end.toISOString() };
}

/**
 * Calcula cuánto va gastado HOY en la categoría, para el usuario.
 * @param {string} userId
 * @param {string} categoryId
 * @returns {Promise<number>}
 */
async function getTodaySpentByCategory(userId, categoryId) {
  const supabase = getServiceSupabase();
  if (!supabase) return 0;
  const { startIso, endIso } = dayBoundsLocal(new Date());
  const { data, error } = await supabase
    .from('expenses')
    .select('importe')
    .eq('user_id', userId)
    .eq('categoria', categoryId)
    .gte('fecha', startIso)
    .lt('fecha', endIso);
  if (error) {
    console.error('[whatsapp] today category sum error', error);
    return 0;
  }
  return (data || []).reduce((s, r) => s + Number(r.importe || 0), 0);
}

module.exports = async function handler(req, res) {
  if (req.method === 'GET') {
    const mode = getQueryParam(req.query, 'hub.mode');
    const verifyToken = getQueryParam(req.query, 'hub.verify_token');
    const challenge = getQueryParam(req.query, 'hub.challenge');

    const expected = process.env.VERIFY_TOKEN;
    if (expected == null || expected === '') {
      console.warn('[whatsapp] GET: falta VERIFY_TOKEN en entorno');
      return res.status(403).end();
    }

    if (verifyToken !== expected) {
      return res.status(403).end();
    }

    console.log('[whatsapp] GET verify ok', { mode, challengeLen: String(challenge ?? '').length });

    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(200).send(challenge != null ? String(challenge) : '');
  }

  if (req.method === 'POST') {
    const body = parseJsonBody(req);
    safeLogWebhookBody(body);

    const msg = extractFirstIncomingMessage(body);
    if (msg) {
      const from = msg.from;
      const type = msg.type;
      const textBody =
        type === 'text' && msg.text && typeof msg.text.body === 'string' ? msg.text.body : undefined;
      console.log('[whatsapp] incoming', JSON.stringify({ from, type, textBody }));

      if (type === 'text' && from != null && from !== '') {
        const waFrom = String(from);
        try {
          const vincularHandled = await tryVinculacionIfApplicable(waFrom, textBody);
          if (!vincularHandled) {
            const linkedUserId = await getLinkedUserIdByWaId(waFrom);
            if (!linkedUserId) {
              await sendWhatsappTextMessage(waFrom, MSG_REQUIERE_VINCULO);
              return res.status(200).json({ ok: true });
            }
            const parsed = parseExpenseFromText(textBody);
            if (parsed.kind === 'missing_amount') {
              await sendWhatsappTextMessage(waFrom, MSG_FALTA_MONTO);
              return res.status(200).json({ ok: true });
            }
            if (parsed.kind === 'expense') {
              try {
                await saveExpenseFromWhatsapp(linkedUserId, parsed);
                const todayByCategory = await getTodaySpentByCategory(linkedUserId, parsed.categoryId);
                await sendWhatsappTextMessage(
                  waFrom,
                  `Listo 👍 guardé S/${formatPen(parsed.amount)} en ${parsed.categoryLabel}\nHoy ya vas S/${formatPen(todayByCategory)} en ${parsed.categoryLabel} ${categoryEmoji(parsed.categoryId)}`,
                );
              } catch (saveErr) {
                console.error('[whatsapp] save expense error', saveErr);
                await sendWhatsappTextMessage(
                  waFrom,
                  'No pude registrar ese gasto ahora. Inténtalo de nuevo en un momento.',
                );
              }
              return res.status(200).json({ ok: true });
            }
            await sendWhatsappTextMessage(waFrom, AUTO_REPLY);
          }
        } catch (e) {
          console.error('[whatsapp] error al procesar / responder', e);
        }
      }
    } else {
      console.log('[whatsapp] incoming (sin mensaje en payload)');
    }

    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
