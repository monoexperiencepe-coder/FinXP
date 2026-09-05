/**
 * Matriz de ruteo post-preloader (función pura, sin I/O).
 * @typedef {'onboarding' | 'login' | 'home' | 'stay'} BootstrapRouteTarget
 */

/**
 * @param {{
 *   hasSession: boolean;
 *   onboardingCompleted: boolean;
 *   rootSegment?: string;
 *   postLoginTransitionPending: boolean;
 * }} input
 * @returns {BootstrapRouteTarget}
 */
function resolveBootstrapRouteTarget(input) {
  const root = input.rootSegment;
  const inAuthGroup = root === '(auth)';
  const inOnboarding = root === 'onboarding';

  if (!input.hasSession) {
    if (!input.onboardingCompleted) {
      // Rutas públicas permitidas: onboarding + auth (login/register) sin sesión.
      if (inOnboarding || inAuthGroup) return 'stay';
      return 'onboarding';
    }
    return inAuthGroup || inOnboarding ? 'stay' : 'login';
  }

  if (input.postLoginTransitionPending) return 'stay';
  if (inAuthGroup || inOnboarding) return 'home';
  return 'stay';
}

module.exports = { resolveBootstrapRouteTarget };
