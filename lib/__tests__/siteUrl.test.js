/**
 * Tests de URL canónica y resolución de API base.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  CANONICAL_PRODUCTION_ORIGIN,
  isLocalDevOrigin,
  isVercelDeploymentOrigin,
  resolveWebOrigin,
  resolveApiBaseUrl,
  shouldRedirectToCanonical,
  canonicalRedirectUrl,
} = require('../siteUrlCore');

describe('siteUrl — canonical production', () => {
  it('canonical origin is fin-xp-sigma.vercel.app', () => {
    assert.equal(CANONICAL_PRODUCTION_ORIGIN, 'https://fin-xp-sigma.vercel.app');
  });

  it('no deployment-specific hash hardcoded', () => {
    assert.doesNotMatch(CANONICAL_PRODUCTION_ORIGIN, /-[a-f0-9]{8,}-/);
    assert.doesNotMatch(CANONICAL_PRODUCTION_ORIGIN, /ahorra-ya/);
  });
});

describe('siteUrl — deployment detection', () => {
  it('detects Vercel deployment team URL', () => {
    assert.equal(
      isVercelDeploymentOrigin('https://fin-abc123-monoexperiencepe-9704s-projects.vercel.app'),
      true,
    );
  });

  it('does not flag canonical alias', () => {
    assert.equal(isVercelDeploymentOrigin('https://fin-xp-sigma.vercel.app'), false);
  });

  it('flags legacy wrong domain', () => {
    assert.equal(isVercelDeploymentOrigin('https://ahorra-ya.vercel.app'), true);
  });

  it('does not flag localhost', () => {
    assert.equal(isLocalDevOrigin('http://localhost:8081'), true);
    assert.equal(isVercelDeploymentOrigin('http://localhost:8081'), false);
  });

  it('does not flag git preview URLs (safe for QA)', () => {
    assert.equal(
      isVercelDeploymentOrigin('https://fin-xp-git-feature-monoexperiencepe.vercel.app'),
      false,
    );
  });
});

describe('siteUrl — API base resolution', () => {
  it('native falls back to canonical when env missing', () => {
    assert.equal(
      resolveApiBaseUrl({ platformOs: 'ios', webOrigin: null, envSiteUrl: null }),
      'https://fin-xp-sigma.vercel.app',
    );
  });

  it('web on deployment origin uses canonical API base', () => {
    assert.equal(
      resolveApiBaseUrl({
        platformOs: 'web',
        webOrigin: 'https://fin-deadbeef-monoexperiencepe-9704s-projects.vercel.app',
      }),
      'https://fin-xp-sigma.vercel.app',
    );
  });

  it('web on canonical origin stays same-origin', () => {
    assert.equal(
      resolveApiBaseUrl({
        platformOs: 'web',
        webOrigin: 'https://fin-xp-sigma.vercel.app',
      }),
      'https://fin-xp-sigma.vercel.app',
    );
  });

  it('web localhost stays local', () => {
    assert.equal(
      resolveApiBaseUrl({ platformOs: 'web', webOrigin: 'http://localhost:8081' }),
      'http://localhost:8081',
    );
  });
});

describe('siteUrl — canonical redirect policy', () => {
  it('redirects deployment URLs', () => {
    assert.equal(
      shouldRedirectToCanonical('https://fin-deadbeef-monoexperiencepe-9704s-projects.vercel.app'),
      true,
    );
  });

  it('does not redirect localhost or git previews', () => {
    assert.equal(shouldRedirectToCanonical('http://localhost:8081'), false);
    assert.equal(
      shouldRedirectToCanonical('https://fin-xp-git-main-monoexperiencepe.vercel.app'),
      false,
    );
  });

  it('builds redirect preserving path', () => {
    assert.equal(
      canonicalRedirectUrl('/onboarding?x=1'),
      'https://fin-xp-sigma.vercel.app/onboarding?x=1',
    );
  });
});

describe('siteUrl — WhatsApp API endpoint', () => {
  it('whatsapp-link-code uses canonical on deployment web origin', () => {
    const base = resolveApiBaseUrl({
      platformOs: 'web',
      webOrigin: 'https://fin-deadbeef-monoexperiencepe-9704s-projects.vercel.app',
    });
    assert.equal(`${base}/api/whatsapp-link-code`, 'https://fin-xp-sigma.vercel.app/api/whatsapp-link-code');
  });
});
