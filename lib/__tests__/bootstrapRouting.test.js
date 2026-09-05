/**
 * Tests de matriz de bootstrap y resolución de onboarding completado.
 * Ejecutar: npm run test:whatsapp
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { resolveBootstrapRouteTarget } = require('../bootstrapRoutingMatrix');

/**
 * Réplica de la lógica de resolveOnboardingCompletedForRouting con deps inyectados.
 * @param {{
 *   completedFlag?: boolean;
 *   legacyDone?: boolean;
 *   lastLogin?: number | null;
 *   draft?: Record<string, unknown> | null;
 *   remoteDone?: boolean | null;
 * }} deps
 */
async function resolveOnboardingCompletedForRoutingMock(deps) {
  if (deps.completedFlag) return true;
  if (deps.legacyDone) return true;
  if (deps.lastLogin != null) return true;
  if (deps.draft && Object.keys(deps.draft).length > 0) return true;
  if (deps.remoteDone === true) return true;
  return false;
}

describe('bootstrapRouting — routing matrix', () => {
  it('case 1: no session, onboarding not completed → onboarding', () => {
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

  it('case 1b: already on onboarding → stay', () => {
    assert.equal(
      resolveBootstrapRouteTarget({
        hasSession: false,
        onboardingCompleted: false,
        rootSegment: 'onboarding',
        postLoginTransitionPending: false,
      }),
      'stay',
    );
  });

  it('case 2: no session, onboarding completed → login', () => {
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

  it('case 2b: completed but on auth/register → stay', () => {
    assert.equal(
      resolveBootstrapRouteTarget({
        hasSession: false,
        onboardingCompleted: true,
        rootSegment: '(auth)',
        postLoginTransitionPending: false,
      }),
      'stay',
    );
  });

  it('case 3: valid session on auth/onboarding → home', () => {
    assert.equal(
      resolveBootstrapRouteTarget({
        hasSession: true,
        onboardingCompleted: true,
        rootSegment: '(auth)',
        postLoginTransitionPending: false,
      }),
      'home',
    );
  });

  it('case 3b: valid session already on tabs → stay', () => {
    assert.equal(
      resolveBootstrapRouteTarget({
        hasSession: true,
        onboardingCompleted: true,
        rootSegment: '(tabs)',
        postLoginTransitionPending: false,
      }),
      'stay',
    );
  });

  it('post-login transition pending → stay', () => {
    assert.equal(
      resolveBootstrapRouteTarget({
        hasSession: true,
        onboardingCompleted: true,
        rootSegment: '(auth)',
        postLoginTransitionPending: true,
      }),
      'stay',
    );
  });
});

describe('bootstrapRouting — onboarding hydration inference', () => {
  it('first-time user → not completed', async () => {
    const done = await resolveOnboardingCompletedForRoutingMock({
      completedFlag: false,
      legacyDone: false,
      lastLogin: null,
      draft: null,
      remoteDone: null,
    });
    assert.equal(done, false);
  });

  it('ONBOARDING_COMPLETED flag → completed', async () => {
    const done = await resolveOnboardingCompletedForRoutingMock({ completedFlag: true });
    assert.equal(done, true);
  });

  it('legacy ONBOARDING_DONE migrates to completed', async () => {
    const done = await resolveOnboardingCompletedForRoutingMock({
      completedFlag: false,
      legacyDone: true,
    });
    assert.equal(done, true);
  });

  it('prior lastLogin infers completed (returning user)', async () => {
    const done = await resolveOnboardingCompletedForRoutingMock({
      completedFlag: false,
      legacyDone: false,
      lastLogin: Date.now() - 86400000,
    });
    assert.equal(done, true);
  });

  it('remote profile onboarding_done → completed', async () => {
    const done = await resolveOnboardingCompletedForRoutingMock({
      completedFlag: false,
      remoteDone: true,
    });
    assert.equal(done, true);
  });
});
