/**
 * Regresión: escape de onboarding → login sin loop del guard.
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const { resolveBootstrapRouteTarget } = require('../bootstrapRoutingMatrix');

describe('login escape loop — routing matrix', () => {
  it('1: session null, onboarding false, root/tabs → onboarding', () => {
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

  it('2: session null, onboarding false, auth/login → STAY (no loop)', () => {
    assert.equal(
      resolveBootstrapRouteTarget({
        hasSession: false,
        onboardingCompleted: false,
        rootSegment: '(auth)',
        postLoginTransitionPending: false,
      }),
      'stay',
    );
  });

  it('3: session null, onboarding true, auth/login → STAY login', () => {
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

  it('4: session null, onboarding true, root/tabs → login', () => {
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

  it('5: session valid, auth/login → home', () => {
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

  it('8: signOut — session null, onboarding true, tabs → login (not onboarding)', () => {
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

describe('login escape loop — onboarding CTA', () => {
  it('6: Ya tengo cuenta navigates to /(auth)/login via replace', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../app/onboarding.tsx'), 'utf8');
    assert.match(source, /Ya tengo cuenta/);
    assert.match(source, /router\.replace\('\/\(auth\)\/login'/);
    assert.doesNotMatch(source, /writeOnboardingCompletedLocal\(true\)[\s\S]{0,200}Ya tengo cuenta/);
  });
});

describe('login escape loop — login success side effects', () => {
  it('7: signIn marks onboarding complete (post-auth only)', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../store/useAuthStore.ts'), 'utf8');
    assert.match(source, /signIn: async[\s\S]*writeOnboardingCompletedLocal\(true\)/);
    assert.match(source, /onAuthStateChange[\s\S]*writeOnboardingCompletedLocal\(true\)/);
  });
});

describe('login escape loop — _layout guard respects stay', () => {
  it('_layout only replaces when target is not stay', () => {
    const source = fs.readFileSync(path.join(__dirname, '../../app/_layout.tsx'), 'utf8');
    assert.match(source, /if \(target === 'onboarding'\)/);
    assert.match(source, /else if \(target === 'login'\)/);
    assert.match(source, /else if \(target === 'home'\)/);
    assert.doesNotMatch(source, /target === 'stay'[\s\S]*router\.replace/);
  });
});
