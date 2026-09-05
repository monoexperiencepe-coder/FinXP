/**
 * Tests realistas de firma Meta (raw bytes, tampering, secret trim).
 * Ejecutar: npm run test:whatsapp
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('crypto');

const {
  verifyMetaSignature,
  signRawBodyForTest,
  secretStructuralMeta,
  readRawBodyWithMeta,
} = require('../_lib/meta-signature');

const META_WEBHOOK_SAMPLE = Buffer.from(
  JSON.stringify({
    object: 'whatsapp_business_account',
    entry: [
      {
        id: '123456789',
        changes: [
          {
            value: {
              messaging_product: 'whatsapp',
              metadata: { display_phone_number: '15550000000', phone_number_id: '999' },
              contacts: [{ profile: { name: 'Test User' }, wa_id: '15551234567' }],
              messages: [
                {
                  from: '15551234567',
                  id: 'wamid.HBgLMTU1NTEyMzQ1NjcVAgASGBQzQTRB',
                  timestamp: '1700000000',
                  text: { body: 'pollo 15' },
                  type: 'text',
                },
              ],
            },
            field: 'messages',
          },
        ],
      },
    ],
  }),
);

describe('Meta signature — realistic raw payload', () => {
  const secret = 'test-meta-app-secret-ahorraya';
  let prevSecret;

  beforeEach(() => {
    prevSecret = process.env.META_APP_SECRET;
    process.env.META_APP_SECRET = secret;
  });

  afterEach(() => {
    process.env.META_APP_SECRET = prevSecret;
  });

  it('valid HMAC over raw Buffer → PASS', () => {
    const header = signRawBodyForTest(META_WEBHOOK_SAMPLE, secret);
    const result = verifyMetaSignature(META_WEBHOOK_SAMPLE, header);
    assert.equal(result.ok, true);
  });

  it('1-byte payload tamper → FAIL 403', () => {
    const header = signRawBodyForTest(META_WEBHOOK_SAMPLE, secret);
    const tampered = Buffer.from(META_WEBHOOK_SAMPLE);
    tampered[tampered.length - 1] ^= 0xff;
    const result = verifyMetaSignature(tampered, header);
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 403);
    assert.equal(result.error, 'Invalid signature');
  });

  it('invalid signature hex → FAIL 403', () => {
    const result = verifyMetaSignature(META_WEBHOOK_SAMPLE, `sha256=${'ab'.repeat(32)}`);
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 403);
  });

  it('re-serialized JSON bytes differ from signed raw → FAIL (body mutation)', () => {
    const original = Buffer.from('{ "z": 1, "a": 2 }');
    const reserialized = Buffer.from(JSON.stringify(JSON.parse(original.toString('utf8'))));
    assert.notDeepEqual(reserialized, original);
    const header = signRawBodyForTest(original, secret);
    const result = verifyMetaSignature(reserialized, header);
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 403);
  });

  it('env secret with accidental newline trims for HMAC → PASS', () => {
    process.env.META_APP_SECRET = `${secret}\n`;
    const header = signRawBodyForTest(META_WEBHOOK_SAMPLE, secret);
    const result = verifyMetaSignature(META_WEBHOOK_SAMPLE, header);
    assert.equal(result.ok, true);
  });

  it('wrong secret → FAIL 403', () => {
    const header = signRawBodyForTest(META_WEBHOOK_SAMPLE, secret);
    process.env.META_APP_SECRET = 'wrong-app-secret-from-other-meta-app';
    const result = verifyMetaSignature(META_WEBHOOK_SAMPLE, header);
    assert.equal(result.ok, false);
    assert.equal(result.statusCode, 403);
  });
});

describe('Meta signature — secret structural meta (no leak)', () => {
  it('detects outer whitespace without exposing value', () => {
    const meta = secretStructuralMeta('  abc  ');
    assert.equal(meta.envSecretPresent, true);
    assert.equal(meta.envSecretLen, 7);
    assert.equal(meta.envSecretTrimmedLen, 3);
    assert.equal(meta.envSecretHasOuterWhitespace, true);
  });

  it('detects newline in env without exposing value', () => {
    const meta = secretStructuralMeta('abc\n');
    assert.equal(meta.envSecretHasNewline, true);
    assert.equal(meta.envSecretTrimmedLen, 3);
  });
});

describe('Meta signature — readRawBodyWithMeta', () => {
  it('reads from stream when body not pre-set', async () => {
    const payload = Buffer.from('{"object":"whatsapp_business_account"}');
    const { Readable } = require('stream');
    const req = Readable.from([payload]);
    const { raw, source, preParsedObject } = await readRawBodyWithMeta(req);
    assert.equal(source, 'stream');
    assert.equal(preParsedObject, false);
    assert.deepEqual(raw, payload);
  });

  it('flags pre-parsed object with empty stream', async () => {
    const { Readable } = require('stream');
    const req = Readable.from([]);
    req.body = { object: 'whatsapp_business_account' };
    const { raw, source, preParsedObject } = await readRawBodyWithMeta(req);
    assert.equal(preParsedObject, true);
    assert.equal(source, 'stream-empty-after-json-parse');
    assert.equal(raw.length, 0);
  });
});

describe('Meta signature — HMAC reference vector', () => {
  it('matches Node crypto HMAC sha256 hex', () => {
    const secret = 'my-test-secret';
    const raw = Buffer.from('{"hello":"world"}');
    const hex = crypto.createHmac('sha256', secret).update(raw).digest('hex');
    assert.equal(signRawBodyForTest(raw, secret), `sha256=${hex}`);
  });
});
