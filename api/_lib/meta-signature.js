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

function getMetaAppSecretTrimmed() {
  const secretRaw = process.env.META_APP_SECRET;
  return secretRaw == null ? '' : String(secretRaw).trim();
}

/** @param {Buffer} bytes */
function sha256Fingerprint(bytes) {
  if (!Buffer.isBuffer(bytes) || bytes.length === 0) return null;
  return crypto.createHash('sha256').update(bytes).digest('hex');
}

/**
 * @param {import('http').IncomingMessage & { body?: unknown }} req
 * @returns {string}
 */
function classifyReqBodyType(req) {
  if (req.body === undefined || req.body === null) return 'null';
  if (Buffer.isBuffer(req.body)) return 'buffer';
  if (typeof req.body === 'string') return 'string';
  if (typeof req.body === 'object') return 'object';
  return typeof req.body;
}

/**
 * @param {Buffer} a
 * @param {Buffer} b
 */
function buffersEqual(a, b) {
  if (!Buffer.isBuffer(a) || !Buffer.isBuffer(b)) return false;
  if (a.length !== b.length) return false;
  if (a.length === 0) return true;
  return crypto.timingSafeEqual(a, b);
}

/**
 * Representaciones del body disponibles en runtime (sin loggear contenido).
 * @typedef {{ id: string, bytes: Buffer, available: boolean }} BodyRepresentation
 */

/**
 * Captura req.body ANTES de consumir el stream.
 * @param {import('http').IncomingMessage & { body?: unknown }} req
 * @returns {BodyRepresentation[]}
 */
function captureReqBodyRepresentations(req) {
  /** @type {BodyRepresentation[]} */
  const reps = [];

  if (Buffer.isBuffer(req.body)) {
    reps.push({ id: 'req.body.buffer', bytes: req.body, available: true });
  }
  if (typeof req.body === 'string') {
    reps.push({ id: 'req.body.string', bytes: Buffer.from(req.body, 'utf8'), available: true });
  }
  if (req.body != null && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) {
    reps.push({
      id: 'req.body.json-stringify',
      bytes: Buffer.from(JSON.stringify(req.body), 'utf8'),
      available: true,
    });
  }

  return reps;
}

/**
 * @param {BodyRepresentation[]} representations
 */
function fingerprintBodyRepresentations(representations) {
  return representations.map((rep) => ({
    id: rep.id,
    byteLen: rep.available && rep.bytes.length > 0 ? rep.bytes.length : 0,
    sha256:
      rep.available && rep.bytes.length > 0 ? sha256Fingerprint(rep.bytes) : null,
  }));
}

/**
 * HMAC match por representación — solo diagnóstico, no altera verificación prod.
 * @param {BodyRepresentation[]} representations
 * @param {string|undefined|null} signatureHeader
 */
function diagnoseHmacCandidates(representations, signatureHeader) {
  const secret = getMetaAppSecretTrimmed();
  /** @type {Record<string, boolean|null>} */
  const matches = {
    matchRawStream: null,
    matchReqBodyBuffer: null,
    matchReqBodyString: null,
    matchSerializedObject: null,
  };

  if (!secret || !signatureHeader) {
    return matches;
  }

  for (const rep of representations) {
    if (!rep.available) continue;
    if (rep.bytes.length === 0) {
      if (rep.id === 'stream') matches.matchRawStream = false;
      continue;
    }
    const result = verifyMetaSignature(rep.bytes, signatureHeader);
    const ok = result.ok;
    if (rep.id === 'stream') matches.matchRawStream = ok;
    else if (rep.id === 'req.body.buffer') matches.matchReqBodyBuffer = ok;
    else if (rep.id === 'req.body.string') matches.matchReqBodyString = ok;
    else if (rep.id === 'req.body.json-stringify') matches.matchSerializedObject = ok;
  }

  return matches;
}

/**
 * Lee stream + captura representaciones previas de req.body.
 * @param {import('http').IncomingMessage & { body?: unknown }} req
 */
async function readRawBodyWithMeta(req) {
  const reqBodyType = classifyReqBodyType(req);
  const preParsedObject = reqBodyType === 'object';
  const reqBodyReps = captureReqBodyRepresentations(req);

  const chunks = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  const streamBytes = Buffer.concat(chunks);

  /** @type {BodyRepresentation[]} */
  const representations = [
    ...reqBodyReps,
    {
      id: 'stream',
      bytes: streamBytes,
      available: true,
    },
  ];

  let source = 'stream';
  if (chunks.length === 0) {
    source = preParsedObject ? 'stream-empty-after-json-parse' : 'stream-empty';
  }

  let raw = streamBytes;
  if (chunks.length === 0 && Buffer.isBuffer(req.body)) {
    raw = req.body;
    source = 'req.body.buffer';
  } else if (chunks.length === 0 && typeof req.body === 'string') {
    raw = Buffer.from(req.body, 'utf8');
    source = 'req.body.string';
  }

  const streamRep = representations.find((r) => r.id === 'stream');
  const serializedRep = representations.find((r) => r.id === 'req.body.json-stringify');
  const sameStreamAndSerialized =
    streamRep && serializedRep
      ? buffersEqual(streamRep.bytes, serializedRep.bytes)
      : null;

  return {
    raw,
    source,
    preParsedObject,
    reqBodyType,
    representations,
    sameStreamAndSerialized,
  };
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
  const secret = getMetaAppSecretTrimmed();
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
 * @param {{
 *   source?: string;
 *   preParsedObject?: boolean;
 *   reqBodyType?: string;
 *   representations?: BodyRepresentation[];
 *   sameStreamAndSerialized?: boolean|null;
 * }} [bodyMeta]
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

  const representations = bodyMeta.representations ?? [];
  const fingerprints = fingerprintBodyRepresentations(representations);
  const hmacCandidates = diagnoseHmacCandidates(representations, signatureHeader);

  const streamFp = fingerprints.find((f) => f.id === 'stream');
  const serializedFp = fingerprints.find((f) => f.id === 'req.body.json-stringify');

  return {
    ...secretMeta,
    signatureHeaderPresent: headerPresent,
    signaturePrefixValid,
    rawBodyLen: raw.length,
    rawBodySource: bodyMeta.source ?? 'unknown',
    rawBodyPreParsedObject: bodyMeta.preParsedObject === true,
    reqBodyType: bodyMeta.reqBodyType ?? 'unknown',
    expectedDigestLen: EXPECTED_DIGEST_HEX_LEN,
    receivedDigestLen,
    match: result.ok,
    statusCode: result.ok ? 200 : result.statusCode,
    error: result.ok ? null : result.error,
    bodyFingerprints: fingerprints,
    rawStreamLen: streamFp?.byteLen ?? raw.length,
    rawStreamSha256: streamFp?.sha256 ?? sha256Fingerprint(raw),
    reqBodySerializedLen: serializedFp?.byteLen ?? null,
    reqBodySerializedSha256: serializedFp?.sha256 ?? null,
    sameStreamAndSerialized: bodyMeta.sameStreamAndSerialized ?? null,
    hmacCandidates,
    anyCandidateMatch: Object.values(hmacCandidates).some((v) => v === true),
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
  classifyReqBodyType,
  captureReqBodyRepresentations,
  fingerprintBodyRepresentations,
  diagnoseHmacCandidates,
  sha256Fingerprint,
  buffersEqual,
};
