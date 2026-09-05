/**
 * Forensic: Vercel req.body pre-parse + stream + HMAC multi-candidate.
 * Ejecutar: npm run test:whatsapp
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('stream');
const crypto = require('crypto');

const {
  readRawBodyWithMeta,
  verifyMetaSignature,
  signRawBodyForTest,
  diagnoseMetaSignature,
  diagnoseHmacCandidates,
  captureReqBodyRepresentations,
  sha256Fingerprint,
  buffersEqual,
  classifyReqBodyType,
} = require('../_lib/meta-signature');

const SECRET = 'forensic-test-meta-app-secret32';

describe('Vercel forensic — body fingerprints differ when re-serialized', () => {
  let prevSecret;

  beforeEach(() => {
    prevSecret = process.env.META_APP_SECRET;
    process.env.META_APP_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.META_APP_SECRET = prevSecret;
  });

  it('2: JSON original with spaces vs JSON.stringify(object) → distinct hashes', () => {
    const original = Buffer.from('{ "z": 1, "a": 2 }');
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(original.toString('utf8'))));
    assert.notDeepEqual(reserialized, original);
    assert.notEqual(sha256Fingerprint(original), sha256Fingerprint(reserialized));
  });

  it('3: HMAC on raw original → PASS', () => {
    const original = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
    const header = signRawBodyForTest(original, SECRET);
    assert.equal(verifyMetaSignature(original, header).ok, true);
  });

  it('4: HMAC on re-serialized object → FAIL when bytes differ', () => {
    const original = Buffer.from('{ "z": 1, "a": 2 }');
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(original.toString('utf8'))));
    const header = signRawBodyForTest(original, SECRET);
    assert.equal(verifyMetaSignature(reserialized, header).ok, false);
    assert.equal(verifyMetaSignature(reserialized, header).statusCode, 403);
  });
});

describe('Vercel forensic — req.body object + stream (dual representation)', () => {
  let prevSecret;

  beforeEach(() => {
    prevSecret = process.env.META_APP_SECRET;
    process.env.META_APP_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.META_APP_SECRET = prevSecret;
  });

  it('1: req.body object + stream with original JSON → stream verifies', async () => {
    const wireJson = '{"object":"whatsapp_business_account","entry":[{"id":"1"}]}';
    const wireBuffer = Buffer.from(wireJson, 'utf8');
    const parsed = JSON.parse(wireJson);

    const req = Readable.from([wireBuffer]);
    req.body = parsed;

    const meta = await readRawBodyWithMeta(req);
    assert.equal(classifyReqBodyType(req), 'object');
    assert.equal(meta.preParsedObject, true);
    assert.equal(meta.source, 'stream');
    assert.equal(meta.raw.length, wireBuffer.length);
    assert.equal(buffersEqual(meta.raw, wireBuffer), true);
    // Compact wire JSON may match JSON.stringify(parsed) byte-for-byte.
    assert.equal(typeof meta.sameStreamAndSerialized, 'boolean');

    const header = signRawBodyForTest(wireBuffer, SECRET);
    const diag = diagnoseMetaSignature(meta.raw, header, meta);
    assert.equal(diag.match, true);
    assert.equal(diag.hmacCandidates.matchRawStream, true);
    if (meta.sameStreamAndSerialized) {
      assert.equal(diag.hmacCandidates.matchSerializedObject, true);
    } else {
      assert.equal(diag.hmacCandidates.matchSerializedObject, false);
    }
  });

  it('5: pre-parsed object + empty stream → empty raw, no false PASS on stringify alone', async () => {
    const parsed = { object: 'whatsapp_business_account', entry: [] };
    const req = Readable.from([]);
    req.body = parsed;

    const meta = await readRawBodyWithMeta(req);
    assert.equal(meta.source, 'stream-empty-after-json-parse');
    assert.equal(meta.raw.length, 0);
    assert.equal(meta.preParsedObject, true);

    const serialized = Buffer.from(JSON.stringify(parsed), 'utf8');
    const header = signRawBodyForTest(serialized, SECRET);
    const candidates = diagnoseHmacCandidates(meta.representations, header);
    assert.notEqual(candidates.matchRawStream, true);
    assert.equal(candidates.matchSerializedObject, true);
    assert.equal(verifyMetaSignature(meta.raw, header).ok, false);
  });

  it('stream bytes differ from wire signed by Meta → all candidates false', async () => {
    const wireSigned = Buffer.from('{"object":"whatsapp_business_account","entry":[]}');
    const mutatedStream = Buffer.from('{"object":"whatsapp_business_account","entry":[],"x":1}');
    const header = signRawBodyForTest(wireSigned, SECRET);

    const req = Readable.from([mutatedStream]);
    req.body = JSON.parse(mutatedStream.toString('utf8'));

    const meta = await readRawBodyWithMeta(req);
    const diag = diagnoseMetaSignature(meta.raw, header, meta);
    assert.equal(diag.match, false);
    assert.equal(diag.anyCandidateMatch, false);
    assert.equal(diag.hmacCandidates.matchRawStream, false);
  });
});

describe('Vercel forensic — HMAC multi-candidate diagnostic', () => {
  let prevSecret;

  beforeEach(() => {
    prevSecret = process.env.META_APP_SECRET;
    process.env.META_APP_SECRET = SECRET;
  });

  afterEach(() => {
    process.env.META_APP_SECRET = prevSecret;
  });

  it('reports which representation matches without logging payload', async () => {
    const wireJson = '{"a":1,"b":2}';
    const wireBuffer = Buffer.from(wireJson, 'utf8');
    const header = signRawBodyForTest(wireBuffer, SECRET);

    const req = Readable.from([wireBuffer]);
    req.body = JSON.parse(wireJson);

    const meta = await readRawBodyWithMeta(req);
    const diag = diagnoseMetaSignature(wireBuffer, header, meta);

    assert.equal(diag.rawStreamSha256, sha256Fingerprint(wireBuffer));
    assert.ok(Array.isArray(diag.bodyFingerprints));
    assert.equal(diag.hmacCandidates.matchRawStream, true);
    assert.equal(diag.anyCandidateMatch, true);
    assert.equal(JSON.stringify(diag).includes(wireJson), false);
    assert.equal(JSON.stringify(diag).includes(SECRET), false);
  });

  it('captureReqBodyRepresentations lists buffer/string/object variants', () => {
    const buf = Buffer.from('{"x":1}');
    const reqString = { body: '{"x":1}' };
    const reqBuf = { body: buf };
    const reqObj = { body: { x: 1 } };

    assert.equal(captureReqBodyRepresentations(reqString).length, 1);
    assert.equal(captureReqBodyRepresentations(reqBuf)[0].id, 'req.body.buffer');
    assert.equal(captureReqBodyRepresentations(reqObj)[0].id, 'req.body.json-stringify');
  });
});

describe('Vercel forensic — bodyParser config export', () => {
  it('whatsapp handler exports config.api.bodyParser=false on module.exports', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const handler = require('../whatsapp');
    const src = fs.readFileSync(path.join(__dirname, '../whatsapp.js'), 'utf8');

    assert.equal(handler.config?.api?.bodyParser, false);
    assert.equal(require('../whatsapp').config?.api?.bodyParser, false);
    assert.match(src, /whatsappWebhookHandler\.config\s*=\s*\{/);
    assert.match(src, /bodyParser:\s*false/);
    assert.doesNotMatch(src, /@vercel\/node/);
  });

  it('vercel.json does not rewrite api away from serverless handler', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const vercel = JSON.parse(fs.readFileSync(path.join(__dirname, '../../vercel.json'), 'utf8'));
    const apiRewrite = vercel.rewrites?.find((r) => r.source?.includes('/api/'));
    assert.ok(apiRewrite);
    assert.match(apiRewrite.destination, /\/api\//);
  });
});

describe('Vercel forensic — wrong secret all candidates false', () => {
  it('6: rotated secret mismatch → SUSPECT pattern (no candidate match)', async () => {
    process.env.META_APP_SECRET = 'production-secret-from-vercel-32chars';
    const wireBuffer = Buffer.from('{"object":"whatsapp_business_account"}');
    const header = signRawBodyForTest(wireBuffer, 'actual-meta-app-secret-different');

    const req = Readable.from([wireBuffer]);
    req.body = JSON.parse(wireBuffer.toString('utf8'));
    const meta = await readRawBodyWithMeta(req);
    const diag = diagnoseMetaSignature(meta.raw, header, meta);

    assert.equal(diag.match, false);
    assert.equal(diag.anyCandidateMatch, false);
    assert.equal(diag.envSecretPresent, true);
  });
});
