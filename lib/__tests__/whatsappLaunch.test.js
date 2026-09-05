/**
 * Tests de launch WhatsApp (URL, mobile web vs desktop, native branch policy).
 * Ejecutar: npm run test:whatsapp
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  detectMobileWebFromUserAgent,
  whatsappWebLinkTargetFromContext,
  normalizeWhatsappLaunchUrl,
  extractVincularCodeFromLaunchUrl,
  whatsappLaunchMeta,
} = require('../whatsappLaunchUrl');

const DESKTOP_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
const ANDROID_UA =
  'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
const IPHONE_UA =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1';

describe('whatsappLaunchUrl — mobile web detection', () => {
  it('desktop Chrome UA is not mobile web', () => {
    assert.equal(detectMobileWebFromUserAgent(DESKTOP_UA), false);
  });

  it('Android mobile UA is mobile web', () => {
    assert.equal(detectMobileWebFromUserAgent(ANDROID_UA), true);
  });

  it('iPhone Safari UA is mobile web', () => {
    assert.equal(detectMobileWebFromUserAgent(IPHONE_UA), true);
  });
});

describe('whatsappLaunchUrl — web link target', () => {
  it('mobile web uses _blank for user gesture CTA', () => {
    assert.equal(whatsappWebLinkTargetFromContext({ isMobileWeb: true }), '_blank');
  });

  it('desktop web uses _self', () => {
    assert.equal(whatsappWebLinkTargetFromContext({ isMobileWeb: false }), '_self');
  });
});

describe('whatsappLaunchUrl — normalize api.whatsapp.com → wa.me', () => {
  const raw =
    'https://api.whatsapp.com/send?phone=5491123456789&text=VINCULAR%20123456&type=phone_number&app_absent=0';

  it('produces wa.me without plus sign', () => {
    const out = normalizeWhatsappLaunchUrl(raw);
    assert.match(out, /^https:\/\/wa\.me\/5491123456789\?text=/);
    assert.doesNotMatch(out, /\+/);
  });

  it('preserves encoded VINCULAR text', () => {
    const out = normalizeWhatsappLaunchUrl(raw);
    assert.match(out, /VINCULAR/);
    assert.equal(extractVincularCodeFromLaunchUrl(out), '123456');
  });

  it('rejects invalid phone', () => {
    assert.throws(
      () => normalizeWhatsappLaunchUrl('https://api.whatsapp.com/send?phone=123&text=hi'),
      /número de WhatsApp válido/,
    );
  });
});

describe('whatsappLaunchUrl — launch meta', () => {
  it('detects vincular prefill', () => {
    const raw = 'https://wa.me/5491123456789?text=VINCULAR%20987654';
    const meta = whatsappLaunchMeta(raw);
    assert.equal(meta.phoneDigits, 13);
    assert.equal(meta.hasVincularText, true);
  });
});

describe('whatsappLaunch — branch policy (documented)', () => {
  it('web must not use whatsapp:// scheme (native-only)', () => {
    const normalized = normalizeWhatsappLaunchUrl(
      'https://api.whatsapp.com/send?phone=5491123456789&text=Hola',
    );
    assert.match(normalized, /^https:\/\/wa\.me\//);
    assert.doesNotMatch(normalized, /^whatsapp:\/\//);
  });
});
