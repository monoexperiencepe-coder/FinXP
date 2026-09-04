/**
 * Meta WhatsApp webhook signature verification (X-Hub-Signature-256).
 *
 * Vercel: exportamos `module.exports.config = { api: { bodyParser: false } }` desde
 * api/whatsapp.js para recibir el cuerpo sin parsear. Sin eso, JSON.parse destruye
 * el raw body y la firma HMAC no coincide con Meta.
 */

const crypto = require('crypto');

/**
 * Lee el cuerpo RAW del request (Buffer).
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
async function readRawBody(req) {
  if (Buffer.isBuffer(req.body)) {
    return req.body;
  }
  if (typeof req.body === 'string') {
    return Buffer.from(req.body, 'utf8');
  }

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * @param {Buffer|string} rawBody
 * @param {string|undefined|null} signatureHeader
 * @returns {{ ok: true } | { ok: false, statusCode: number, error: string }}
 */
function verifyMetaSignature(rawBody, signatureHeader) {
  const secret = process.env.META_APP_SECRET;
  if (!secret || String(secret).trim() === '') {
    return { ok: false, statusCode: 503, error: 'Webhook not configured' };
  }

  if (!signatureHeader || typeof signatureHeader !== 'string') {
    return { ok: false, statusCode: 401, error: 'Missing signature' };
  }

  const trimmed = signatureHeader.trim();
  const eq = trimmed.indexOf('=');
  if (eq <= 0) {
    return { ok: false, statusCode: 401, error: 'Invalid signature format' };
  }

  const algo = trimmed.slice(0, eq);
  const hex = trimmed.slice(eq + 1);
  if (algo !== 'sha256') {
    return { ok: false, statusCode: 401, error: 'Invalid signature format' };
  }
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    return { ok: false, statusCode: 401, error: 'Invalid signature format' };
  }

  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const computed = crypto.createHmac('sha256', secret).update(raw).digest();
  const received = Buffer.from(hex, 'hex');

  if (computed.length !== received.length || !crypto.timingSafeEqual(computed, received)) {
    return { ok: false, statusCode: 403, error: 'Invalid signature' };
  }

  return { ok: true };
}

/** Solo para tests: genera header sha256=<hex>. */
function signRawBodyForTest(rawBody, secret) {
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const hex = crypto.createHmac('sha256', secret).update(raw).digest('hex');
  return `sha256=${hex}`;
}

module.exports = {
  readRawBody,
  verifyMetaSignature,
  signRawBodyForTest,
};
