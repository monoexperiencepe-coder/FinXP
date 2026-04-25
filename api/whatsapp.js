/**
 * Webhook WhatsApp (Meta) — GET (VERIFY_TOKEN) + POST: respuesta automática a mensajes de texto (Cloud API v20).
 * Env: VERIFY_TOKEN, WHATSAPP_TOKEN, PHONE_NUMBER_ID. Sin secretos en código. No modifica api/chat.js.
 */

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

const AUTO_REPLY =
  'Hola 👋 Soy tu asistente financiero. Ya recibí tu mensaje.';

/**
 * Envía un mensaje de texto por la Cloud API de Meta (mismo hilo: `to` = remitente entrante).
 */
async function sendWhatsappTextReply(to) {
  const phoneNumberId = process.env.PHONE_NUMBER_ID;
  const accessToken = process.env.WHATSAPP_TOKEN;
  if (!phoneNumberId || !accessToken) {
    console.warn('[whatsapp] falta PHONE_NUMBER_ID o WHATSAPP_TOKEN; no se envía respuesta');
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
      text: { body: AUTO_REPLY },
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    console.error('[whatsapp] Graph API', res.status, raw);
  } else {
    console.log('[whatsapp] enviado OK', raw.length > 500 ? `${raw.slice(0, 500)}…` : raw);
  }
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
        try {
          await sendWhatsappTextReply(String(from));
        } catch (e) {
          console.error('[whatsapp] error al enviar respuesta', e);
        }
      }
    } else {
      console.log('[whatsapp] incoming (sin mensaje en payload)');
    }

    // Meta espera 200 pronto; errores al enviar el reply se loguean pero no bloquean el acuse.
    return res.status(200).json({ ok: true });
  }

  return res.status(405).json({ error: 'Method not allowed' });
};
