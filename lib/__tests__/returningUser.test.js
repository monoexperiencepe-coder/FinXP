/**
 * Tests de UX returning user: routing + login marca onboarding.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { resolveBootstrapRouteTarget } = require('../bootstrapRoutingMatrix');

describe('returning user — routing without local flags', () => {
  it('session valid → home (even if onboarding flag false)', () => {
    assert.equal(
      resolveBootstrapRouteTarget({
        hasSession: true,
        onboardingCompleted: false,
        rootSegment: '(auth)',
        postLoginTransitionPending: false,
      }),
      'home',
    );
  });

  it('session null + onboarding completed → login (not onboarding)', () => {
    assert.equal(
      resolveBootstrapRouteTarget({
        hasSession: false,
        onboardingCompleted: true,
        rootSegment: 'onboarding',
        postLoginTransitionPending: false,
      }),
      'stay',
    );
    assert.equal(
      resolveBootstrapRouteTarget({
        hasSession: false,
        onboardingCompleted: true,
        rootSegment: '(tabs)',
        postLoginTransitionPending: false,
      }),
      'login',
    );
  });

  it('session null + onboarding false → onboarding for new user', () => {
    assert.equal(
      resolveBootstrapRouteTarget({
        hasSession: false,
        onboardingCompleted: false,
        rootSegment: '(tabs)',
        postLoginTransitionPending: false,
      }),
      'onboarding',
    );
  });

  it('signOut path: no session + completed → login (not onboarding)', () => {
    assert.equal(
      resolveBootstrapRouteTarget({
        hasSession: false,
        onboardingCompleted: true,
        rootSegment: '(tabs)',
        postLoginTransitionPending: false,
      }),
      'login',
    );
  });
});

describe('returning user — onboarding screen contract', () => {
  it('onboarding welcome exposes Ya tengo cuenta link', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../app/onboarding.tsx'), 'utf8');
    assert.match(source, /Ya tengo cuenta/);
    assert.match(source, /router\.replace\('\/\(auth\)\/login'/);
  });
});

describe('returning user — login marks onboarding complete', () => {
  it('signIn persists onboardingCompleted local flag', () => {
    const fs = require('node:fs');
    const path = require('node:path');
    const source = fs.readFileSync(path.join(__dirname, '../../store/useAuthStore.ts'), 'utf8');
    assert.match(source, /writeOnboardingCompletedLocal\(true\)/);
  });
});
