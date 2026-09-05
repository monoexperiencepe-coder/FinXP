import {
  readLastLoginMs,
  readOnboardingCompletedLocal,
  readOnboardingDraftLocal,
  readOnboardingLocal,
  readOnboardingRemoteAndSync,
  writeOnboardingCompletedLocal,
} from '@/lib/preferences';
import { resolveBootstrapRouteTarget as resolveBootstrapRouteTargetPure } from '@/lib/bootstrapRoutingMatrix';

/**
 * Resuelve si el usuario ya pasó el onboarding comercial inicial.
 * Evita repetir onboarding por flags legacy borrados o sesión fantasma limpiada.
 */
export async function resolveOnboardingCompletedForRouting(options?: {
  userId?: string | null;
}): Promise<boolean> {
  const completedFlag = await readOnboardingCompletedLocal();
  if (completedFlag) return true;

  const legacyDone = await readOnboardingLocal();
  if (legacyDone) {
    await writeOnboardingCompletedLocal(true);
    return true;
  }

  const lastLogin = await readLastLoginMs();
  if (lastLogin != null) {
    await writeOnboardingCompletedLocal(true);
    return true;
  }

  const draft = await readOnboardingDraftLocal<Record<string, unknown>>();
  if (draft && typeof draft === 'object' && Object.keys(draft).length > 0) {
    return true;
  }

  const userId = options?.userId?.trim();
  if (userId) {
    const remote = await readOnboardingRemoteAndSync(userId);
    if (remote === true) {
      await writeOnboardingCompletedLocal(true);
      return true;
    }
  }

  return false;
}

export type BootstrapRouteTarget = 'onboarding' | 'login' | 'home' | 'stay';

/**
 * Matriz de ruteo post-preloader (sin sesión vs con sesión).
 */
export function resolveBootstrapRouteTarget(input: {
  hasSession: boolean;
  onboardingCompleted: boolean;
  rootSegment?: string;
  postLoginTransitionPending: boolean;
}): BootstrapRouteTarget {
  return resolveBootstrapRouteTargetPure(input);
}
