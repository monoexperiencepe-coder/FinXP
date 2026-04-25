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

const AUTO_REPLY = 'Hola 👋 Soy tu asistente financiero. Ya recibí tu mensaje.';

const MSG_VINCULO_OK = 'Listo ✅ Tu WhatsApp ya está vinculado a tu cuenta.';
const MSG_VINCULO_BAD = 'Código inválido o vencido.';

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
