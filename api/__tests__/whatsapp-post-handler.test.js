/**
 * Regresión POST handler: firma, msg ordering, eventos sin messages.
 * Ejecutar: npm run test:whatsapp
 */

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Readable } = require('stream');

const { signRawBodyForTest, verifyMetaSignature } = require('../_lib/meta-signature');
const { describeWebhookEventKind, extractFirstIncomingMessage } = require('../_lib/whatsapp-parsers');

const handler = require('../whatsapp');

const SECRET = 'test-webhook-handler-secret';

const TEXT_MESSAGE_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123456789',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15550000000', phone_number_id: '999' },
            messages: [
              {
                from: '15551234567',
                id: 'wamid.HBgLTESTMESSAGE001',
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
};

const STATUS_ONLY_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [
    {
      id: '123456789',
      changes: [
        {
          value: {
            messaging_product: 'whatsapp',
            metadata: { display_phone_number: '15550000000', phone_number_id: '999' },
            statuses: [
              {
                id: 'wamid.HBgLTESTSTATUS001',
                status: 'delivered',
                timestamp: '1700000001',
                recipient_id: '15551234567',
              },
            ],
          },
          field: 'messages',
        },
      ],
    },
  ],
};

const NO_MESSAGES_PAYLOAD = {
  object: 'whatsapp_business_account',
  entry: [{ id: '1', changes: [{ value: { messaging_product: 'whatsapp' }, field: 'messages' }] }],
};

function createMockRes() {
  const state = { statusCode: 200, body: undefined };
  const res = {
    status(code) {
      state.statusCode = code;
      return res;
    },
    json(payload) {
      state.body = payload;
      return res;
    },
    end() {
      return res;
    },
    setHeader() {
      return res;
    },
    send() {
      return res;
    },
    getState: () => state,
  };
  return res;
}

function createPostReq(rawBuffer, signatureHeader) {
  const req = Readable.from([rawBuffer]);
  req.method = 'POST';
  req.headers = { 'x-hub-signature-256': signatureHeader };
  return req;
}

async function invokePost(payload, options = {}) {
  const raw = Buffer.isBuffer(payload) ? payload : Buffer.from(JSON.stringify(payload));
  const sig =
    options.signatureHeader ??
    signRawBodyForTest(raw, options.secret ?? SECRET);
  const req = createPostReq(raw, sig);
  const res = createMockRes();
  await handler(req, res);
  return res.getState();
}

describe('whatsapp POST handler — signature gate', () => {
  let prevSecret;
  let prevSupabaseUrl;
  let prevSupabaseKey;

  beforeEach(() => {
    prevSecret = process.env.META_APP_SECRET;
    prevSupabaseUrl = process.env.SUPABASE_URL;
    prevSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.META_APP_SECRET = SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env.META_APP_SECRET = prevSecret;
    if (prevSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevSupabaseUrl;
    if (prevSupabaseKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevSupabaseKey;
  });

  it('4: invalid signature → 403, never processes', async () => {
    const raw = Buffer.from(JSON.stringify(TEXT_MESSAGE_PAYLOAD));
    const state = await invokePost(raw, {
      signatureHeader: `sha256=${'ab'.repeat(32)}`,
    });
    assert.equal(state.statusCode, 403);
    assert.equal(state.body?.error, 'Invalid signature');
  });

  it('6: wrong secret → 403', async () => {
    process.env.META_APP_SECRET = 'other-meta-app-secret';
    const raw = Buffer.from(JSON.stringify(TEXT_MESSAGE_PAYLOAD));
    const header = signRawBodyForTest(raw, SECRET);
    const state = await invokePost(raw, { signatureHeader: header });
    assert.equal(state.statusCode, 403);
  });

  it('5: raw body + correct secret → signature pass (not 403)', () => {
    const raw = Buffer.from(JSON.stringify(TEXT_MESSAGE_PAYLOAD));
    const header = signRawBodyForTest(raw, SECRET);
    const result = verifyMetaSignature(raw, header);
    assert.equal(result.ok, true);
  });
});

describe('whatsapp POST handler — post-signature routing', () => {
  let prevSecret;
  let prevSupabaseUrl;
  let prevSupabaseKey;

  beforeEach(() => {
    prevSecret = process.env.META_APP_SECRET;
    prevSupabaseUrl = process.env.SUPABASE_URL;
    prevSupabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    process.env.META_APP_SECRET = SECRET;
    delete process.env.SUPABASE_URL;
    delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  });

  afterEach(() => {
    process.env.META_APP_SECRET = prevSecret;
    if (prevSupabaseUrl === undefined) delete process.env.SUPABASE_URL;
    else process.env.SUPABASE_URL = prevSupabaseUrl;
    if (prevSupabaseKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = prevSupabaseKey;
  });

  it('1: valid signature + text message → past signature (503 without supabase, not 403/500)', async () => {
    const state = await invokePost(TEXT_MESSAGE_PAYLOAD);
    assert.notEqual(state.statusCode, 403);
    assert.notEqual(state.statusCode, 500);
    assert.equal(state.statusCode, 503);
    assert.equal(state.body?.error, 'Server configuration error');
  });

  it('2: valid signature + body without messages → 200 ignored', async () => {
    const state = await invokePost(NO_MESSAGES_PAYLOAD);
    assert.equal(state.statusCode, 200);
    assert.equal(state.body?.ok, true);
    assert.equal(state.body?.ignored, true);
  });

  it('3: valid signature + statuses only → 200 ignored', async () => {
    const state = await invokePost(STATUS_ONLY_PAYLOAD);
    assert.equal(state.statusCode, 200);
    assert.equal(state.body?.ok, true);
    assert.equal(state.body?.ignored, true);
    assert.equal(describeWebhookEventKind(STATUS_ONLY_PAYLOAD).eventKind, 'status');
    assert.equal(extractFirstIncomingMessage(STATUS_ONLY_PAYLOAD), null);
  });
});

describe('whatsapp POST handler — msg before definition regression', () => {
  it('7: extractFirstIncomingMessage precedes safeLogWebhookEvent in source', () => {
    const src = fs.readFileSync(path.join(__dirname, '../whatsapp.js'), 'utf8');
    const postBlock = src.slice(src.indexOf("if (req.method === 'POST')"));
    const extractIdx = postBlock.indexOf('const msg = extractFirstIncomingMessage(body)');
    const logIdx = postBlock.indexOf('safeLogWebhookEvent(body, msg)');
    assert.ok(extractIdx >= 0, 'extractFirstIncomingMessage missing in POST block');
    assert.ok(logIdx >= 0, 'safeLogWebhookEvent missing in POST block');
    assert.ok(extractIdx < logIdx, 'msg must be defined before safeLogWebhookEvent');
    assert.doesNotMatch(
      postBlock,
      /safeLogWebhookEvent\(\s*body\s*,\s*msg\s*\)[\s\S]{0,120}const msg = extractFirstIncomingMessage/,
    );
  });

  it('safeLogWebhookEvent tolerates null msg (non-message events)', () => {
    const src = fs.readFileSync(path.join(__dirname, '../whatsapp.js'), 'utf8');
    assert.match(src, /function safeLogWebhookEvent\(body, msg\)/);
    assert.match(src, /msg\?\./);
    assert.match(src, /describeWebhookEventKind/);
  });
});

describe('whatsapp POST handler — signature diagnostics preserved', () => {
  it('signature reject path logs diagnoseMetaSignature without secrets', () => {
    const sigSrc = fs.readFileSync(path.join(__dirname, '../_lib/meta-signature.js'), 'utf8');
    const handlerSrc = fs.readFileSync(path.join(__dirname, '../whatsapp.js'), 'utf8');

    assert.match(sigSrc, /envSecretPresent/);
    assert.match(sigSrc, /rawBodySource/);
    assert.match(sigSrc, /String\(secretRaw\)\.trim\(\)/);
    assert.match(handlerSrc, /diagnoseMetaSignature\(rawBody, signatureHeader, bodyMeta\)/);
    assert.match(handlerSrc, /\[whatsapp\] signature reject/);
    assert.doesNotMatch(handlerSrc, /console\.(log|warn)\([^)]*META_APP_SECRET/);
    assert.doesNotMatch(handlerSrc, /console\.log\([^)]*rawBody[^)]*\)/);
  });
});

describe('describeWebhookEventKind — non-message events', () => {
  it('classifies status-only payloads', () => {
    const kind = describeWebhookEventKind(STATUS_ONLY_PAYLOAD);
    assert.equal(kind.eventKind, 'status');
    assert.equal(kind.hasStatuses, true);
    assert.equal(kind.hasMessages, false);
    assert.equal(kind.statusCount, 1);
  });

  it('classifies empty value as unknown/field', () => {
    const kind = describeWebhookEventKind(NO_MESSAGES_PAYLOAD);
    assert.equal(kind.hasMessages, false);
    assert.equal(kind.hasStatuses, false);
    assert.equal(kind.field, 'messages');
  });
});
