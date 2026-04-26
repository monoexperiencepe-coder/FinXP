/**
 * Preferencias y flags persistidos del usuario.
 *
 * Reglas simples (léase antes de tocar):
 * - `onboarding`: Supabase (`user_profiles.onboarding_done`) es la **fuente de verdad**
 *   cuando hay sesión y red. AsyncStorage solo se usa como **caché** para arranques rápidos.
 * - `darkMode`: Zustand/Supabase (`user_profiles.theme`) mandan. La clave local
 *   `ahorraya_dark_mode` sigue existiendo como caché histórico; se lee/escribe aquí.
 * - `lastLogin`: solo local (se usa para sesión expirada a los 15 días).
 *
 * Cualquier pantalla/hook que lea o escriba estos flags debe hacerlo **solo a través
 * de este módulo**; nunca tocar `AsyncStorage.getItem('ahorraya_*')` directamente.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';

import { supabase } from '@/lib/supabase';

export const STORAGE_KEYS = {
  ONBOARDING_DONE: 'ahorraya_onboarding_done',
  ONBOARDING_COMPLETED: 'ahorraya_onboarding_completed',
  ONBOARDING_DRAFT: 'ahorraya_onboarding_draft',
  LAST_LOGIN: 'ahorraya_last_login',
  DARK_MODE: 'ahorraya_dark_mode',
  WA_PROMO_SHOWN: 'ahorraya_wa_promo_v1',
} as const;

/** Caché local rápido de onboarding. No es la fuente de verdad si hay sesión. */
export async function readOnboardingLocal(): Promise<boolean> {
  const v = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_DONE);
  return v === 'true';
}

export async function writeOnboardingLocal(done: boolean): Promise<void> {
  if (done) await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_DONE, 'true');
  else await AsyncStorage.removeItem(STORAGE_KEYS.ONBOARDING_DONE);
}

/**
 * Fase 1 del nuevo flujo de entrada:
 * flag local desacoplado de Supabase para decidir onboarding/login sin sesión.
 * Incluye fallback al flag legacy `ONBOARDING_DONE` para no romper usuarios existentes.
 */
export async function readOnboardingCompletedLocal(): Promise<boolean> {
  const v = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETED);
  if (v === 'true') return true;
  if (v === 'false') return false;
  // Compatibilidad hacia atrás (usuarios antiguos)
  return readOnboardingLocal();
}

export async function writeOnboardingCompletedLocal(done: boolean): Promise<void> {
  if (done) await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETED, 'true');
  else await AsyncStorage.removeItem(STORAGE_KEYS.ONBOARDING_COMPLETED);
}

/**
 * Borrador temporal del onboarding (Fase 2): se guarda local hasta que el usuario se registre.
 */
export async function writeOnboardingDraftLocal(data: unknown): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_DRAFT, JSON.stringify(data ?? null));
}

export async function readOnboardingDraftLocal<T = unknown>(): Promise<T | null> {
  const raw = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_DRAFT);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function clearOnboardingDraftLocal(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.ONBOARDING_DRAFT);
}

/**
 * Lee el flag desde Supabase (si hay sesión) y sincroniza el caché local.
 * Devuelve null si no hay sesión o si la query falla — el caller decide el fallback.
 */
export async function readOnboardingRemoteAndSync(userId: string): Promise<boolean | null> {
  try {
    const { data, error } = await supabase
      .from('user_profiles')
      .select('onboarding_done')
      .eq('id', userId)
      .single();
    if (error) return null;
    const done = data?.onboarding_done === true;
    if (done) await writeOnboardingLocal(true);
    return done;
  } catch {
    return null;
  }
}

/** Marca en local + Supabase que el onboarding está completo. Idempotente. */
export async function markOnboardingComplete(userId: string | null): Promise<void> {
  await writeOnboardingLocal(true);
  if (!userId) return;
  try {
    await supabase.from('user_profiles').update({ onboarding_done: true }).eq('id', userId);
  } catch {
    /* swallow: el caché local ya está marcado */
  }
}

export async function clearOnboardingLocal(): Promise<void> {
  await writeOnboardingLocal(false);
}

/** Último login exitoso en epoch ms; se usa para expirar sesión local pasados los 15 días. */
export async function readLastLoginMs(): Promise<number | null> {
  const v = await AsyncStorage.getItem(STORAGE_KEYS.LAST_LOGIN);
  if (!v) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export async function writeLastLoginNow(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.LAST_LOGIN, String(Date.now()));
}

export async function clearLastLogin(): Promise<void> {
  await AsyncStorage.removeItem(STORAGE_KEYS.LAST_LOGIN);
}

export async function readDarkModeCache(): Promise<'dark' | 'light' | null> {
  const v = await AsyncStorage.getItem(STORAGE_KEYS.DARK_MODE);
  if (v === 'true') return 'dark';
  if (v === 'false') return 'light';
  return null;
}

export async function writeDarkModeCache(mode: 'dark' | 'light'): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.DARK_MODE, mode === 'dark' ? 'true' : 'false');
}

/** True si el promo del bot de WhatsApp ya fue mostrado al usuario. */
export async function readWaPromoShown(): Promise<boolean> {
  const v = await AsyncStorage.getItem(STORAGE_KEYS.WA_PROMO_SHOWN);
  return v === 'true';
}

/** Marca que el promo ya se mostró (no vuelve a aparecer). */
export async function markWaPromoShown(): Promise<void> {
  await AsyncStorage.setItem(STORAGE_KEYS.WA_PROMO_SHOWN, 'true');
}
