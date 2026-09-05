/**
 * Meta WhatsApp webhook signature verification (X-Hub-Signature-256).
 *
 * Vercel: exportamos `module.exports.config = { api: { bodyParser: false } }` desde
 * api/whatsapp.js para recibir el cuerpo sin parsear. Sin eso, JSON.parse destruye
 * el raw body y la firma HMAC no coincide con Meta.
 */

const crypto = require('crypto');

const EXPECTED_DIGEST_HEX_LEN = 64;

/**
 * Metadatos estructurales del secret — nunca expone el valor.
 * @param {string|undefined|null} secret
 */
function secretStructuralMeta(secret) {
  if (secret == null || secret === '') {
    return {
      envSecretPresent: false,
      envSecretLen: 0,
      envSecretTrimmedLen: 0,
      envSecretHasOuterWhitespace: false,
      envSecretHasNewline: false,
    };
  }
  const s = String(secret);
  const trimmed = s.trim();
  return {
    envSecretPresent: trimmed.length > 0,
    envSecretLen: s.length,
    envSecretTrimmedLen: trimmed.length,
    envSecretHasOuterWhitespace: s !== trimmed,
    envSecretHasNewline: /[\r\n]/.test(s),
  };
}

/**
 * Lee el cuerpo RAW del request (Buffer) con metadatos de origen.
 * @param {import('http').IncomingMessage & { body?: unknown }} req
 * @returns {Promise<{ raw: Buffer, source: string, preParsedObject: boolean }>}
 */
async function readRawBodyWithMeta(req) {
  if (Buffer.isBuffer(req.body)) {
    return { raw: req.body, source: 'req.body.buffer', preParsedObject: false };
  }
  if (typeof req.body === 'string') {
    return {
      raw: Buffer.from(req.body, 'utf8'),
      source: 'req.body.string',
      preParsedObject: false,
    };
  }

  const preParsedObject = req.body != null && typeof req.body === 'object';

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const raw = Buffer.concat(chunks);

  let source = 'stream';
  if (chunks.length === 0) {
    source = preParsedObject ? 'stream-empty-after-json-parse' : 'stream-empty';
  }

  return { raw, source, preParsedObject };
}

/**
 * @param {import('http').IncomingMessage} req
 * @returns {Promise<Buffer>}
 */
async function readRawBody(req) {
  const { raw } = await readRawBodyWithMeta(req);
  return raw;
}

/**
 * @param {Buffer|string} rawBody
 * @param {string|undefined|null} signatureHeader
 * @returns {{ ok: true } | { ok: false, statusCode: number, error: string }}
 */
function verifyMetaSignature(rawBody, signatureHeader) {
  const secretRaw = process.env.META_APP_SECRET;
  const secret = secretRaw == null ? '' : String(secretRaw).trim();
  if (!secret) {
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

/**
 * Diagnóstico seguro para logs (sin secret, body, teléfonos).
 * @param {Buffer|string} rawBody
 * @param {string|undefined|null} signatureHeader
 * @param {{ source?: string, preParsedObject?: boolean }} [bodyMeta]
 */
function diagnoseMetaSignature(rawBody, signatureHeader, bodyMeta = {}) {
  const secretMeta = secretStructuralMeta(process.env.META_APP_SECRET);
  const headerPresent = !!(signatureHeader && typeof signatureHeader === 'string');

  let signaturePrefixValid = false;
  let receivedDigestLen = 0;
  if (headerPresent) {
    const trimmed = signatureHeader.trim();
    const eq = trimmed.indexOf('=');
    if (eq > 0 && trimmed.slice(0, eq) === 'sha256') {
      signaturePrefixValid = true;
      const hex = trimmed.slice(eq + 1);
      receivedDigestLen = /^[0-9a-f]*$/i.test(hex) ? hex.length : 0;
    }
  }

  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody ?? ''), 'utf8');
  const result = verifyMetaSignature(rawBody, signatureHeader);

  return {
    ...secretMeta,
    signatureHeaderPresent: headerPresent,
    signaturePrefixValid,
    rawBodyLen: raw.length,
    rawBodySource: bodyMeta.source ?? 'unknown',
    rawBodyPreParsedObject: bodyMeta.preParsedObject === true,
    expectedDigestLen: EXPECTED_DIGEST_HEX_LEN,
    receivedDigestLen,
    match: result.ok,
    statusCode: result.ok ? 200 : result.statusCode,
    error: result.ok ? null : result.error,
  };
}

/** Solo para tests: genera header sha256=<hex>. */
function signRawBodyForTest(rawBody, secret) {
  const key = secret == null ? '' : String(secret).trim();
  const raw = Buffer.isBuffer(rawBody) ? rawBody : Buffer.from(String(rawBody), 'utf8');
  const hex = crypto.createHmac('sha256', key).update(raw).digest('hex');
  return `sha256=${hex}`;
}

module.exports = {
  readRawBody,
  readRawBodyWithMeta,
  verifyMetaSignature,
  diagnoseMetaSignature,
  secretStructuralMeta,
  signRawBodyForTest,
};
