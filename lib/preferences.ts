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
  LAST_LOGIN: 'ahorraya_last_login',
  DARK_MODE: 'ahorraya_dark_mode',
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
