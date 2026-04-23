import AsyncStorage from '@react-native-async-storage/async-storage';

/** JSON v1 — reemplaza el flag legado `ahorraya_premium_teaser_shown_v2` */
export const PREMIUM_TEASER_SCHEDULE_KEY = 'ahorraya_premium_teaser_schedule_v1';
export const PREMIUM_TEASER_LEGACY_KEY = 'ahorraya_premium_teaser_shown_v2';

const MIN_HOURS_BETWEEN = 4;
const SAME_HOUR_ESCAPE_HOURS = 6;

export type PremiumTeaserScheduleV1 = {
  v: 1;
  /** Usuario terminó onboarding (perfil guardado). */
  onboardingComplete: boolean;
  /** Primera presentación post-registro (modal desde Perfil + 10s) ya realizada. */
  firstLaunchDone: boolean;
  lastClosedAt: number | null;
  /** Día local (YYYY-MM-DD) al que corresponde `showsToday`. */
  dayKey: string | null;
  /** Veces que cerró el modal ese día (máx. 2). */
  showsToday: number;
  /** Hora local 0–23 del último cierre ese día. */
  lastShowHour: number | null;
};

function defaultSchedule(): PremiumTeaserScheduleV1 {
  return {
    v: 1,
    onboardingComplete: false,
    firstLaunchDone: false,
    lastClosedAt: null,
    dayKey: null,
    showsToday: 0,
    lastShowHour: null,
  };
}

export function dayKeyLocal(ms: number = Date.now()): string {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export async function loadPremiumTeaserSchedule(): Promise<PremiumTeaserScheduleV1> {
  try {
    const raw = await AsyncStorage.getItem(PREMIUM_TEASER_SCHEDULE_KEY);
    if (!raw) return defaultSchedule();
    const parsed = JSON.parse(raw) as Partial<PremiumTeaserScheduleV1>;
    if (parsed?.v !== 1) return defaultSchedule();
    return {
      v: 1,
      onboardingComplete: !!parsed.onboardingComplete,
      firstLaunchDone: !!parsed.firstLaunchDone,
      lastClosedAt: typeof parsed.lastClosedAt === 'number' ? parsed.lastClosedAt : null,
      dayKey: typeof parsed.dayKey === 'string' ? parsed.dayKey : null,
      showsToday: typeof parsed.showsToday === 'number' ? Math.min(2, Math.max(0, parsed.showsToday)) : 0,
      lastShowHour: typeof parsed.lastShowHour === 'number' ? parsed.lastShowHour : null,
    };
  } catch {
    return defaultSchedule();
  }
}

export async function savePremiumTeaserSchedule(s: PremiumTeaserScheduleV1): Promise<void> {
  await AsyncStorage.setItem(PREMIUM_TEASER_SCHEDULE_KEY, JSON.stringify(s));
}

/** Si existía el flag antiguo “ya visto para siempre”, migrar a calendario (no volver a mostrar hoy). */
export async function migrateLegacyPremiumTeaserFlag(): Promise<void> {
  const legacy = await AsyncStorage.getItem(PREMIUM_TEASER_LEGACY_KEY);
  if (legacy !== 'true') return;
  const now = Date.now();
  const dk = dayKeyLocal(now);
  const s = await loadPremiumTeaserSchedule();
  await savePremiumTeaserSchedule({
    ...s,
    onboardingComplete: true,
    firstLaunchDone: true,
    lastClosedAt: now,
    dayKey: dk,
    showsToday: 2,
    lastShowHour: new Date(now).getHours(),
  });
  await AsyncStorage.removeItem(PREMIUM_TEASER_LEGACY_KEY);
}

/** Llamar al terminar onboarding (perfil inicial guardado). */
export async function markPremiumTeaserOnboardingComplete(): Promise<void> {
  const s = await loadPremiumTeaserSchedule();
  if (s.onboardingComplete) return;
  await savePremiumTeaserSchedule({ ...s, onboardingComplete: true });
}

/** Si `ahorraya_onboarding_done` ya está en true pero el schedule no, sincronizar. */
export async function syncPremiumTeaserFromOnboardingFlag(): Promise<void> {
  const done = await AsyncStorage.getItem('ahorraya_onboarding_done');
  if (done !== 'true') return;
  const s = await loadPremiumTeaserSchedule();
  if (s.onboardingComplete) return;
  await savePremiumTeaserSchedule({ ...s, onboardingComplete: true });
}

/** ¿Mostrar la primera vez solo desde Perfil tras 10s? */
export async function shouldScheduleFirstLaunchFromPerfil(): Promise<boolean> {
  const s = await loadPremiumTeaserSchedule();
  return s.onboardingComplete && !s.firstLaunchDone;
}

/** Tras cerrar el modal (Entendido / Omitir). */
export async function recordPremiumTeaserDismissed(): Promise<void> {
  const now = Date.now();
  const dk = dayKeyLocal(now);
  const s = await loadPremiumTeaserSchedule();
  const sameDay = s.dayKey === dk;
  const showsToday = sameDay ? Math.min(2, s.showsToday + 1) : 1;
  await savePremiumTeaserSchedule({
    ...s,
    firstLaunchDone: true,
    lastClosedAt: now,
    dayKey: dk,
    showsToday,
    lastShowHour: new Date(now).getHours(),
  });
}

function effectiveShowsToday(s: PremiumTeaserScheduleV1, now = Date.now()): number {
  const dk = dayKeyLocal(now);
  if (s.dayKey !== dk) return 0;
  return Math.min(2, s.showsToday);
}

/**
 * Mostrar al volver a Inicio (u otras pestañas): máx. 2 veces por día calendario,
 * con al menos 4h desde el último cierre y distinto horario (o 6h si coincide la hora).
 */
export async function canShowPremiumTeaserFromNavigation(): Promise<boolean> {
  const s = await loadPremiumTeaserSchedule();
  if (!s.onboardingComplete || !s.firstLaunchDone) return false;

  const now = Date.now();
  if (effectiveShowsToday(s, now) >= 2) return false;
  if (s.lastClosedAt == null) return false;

  const hours = (now - s.lastClosedAt) / 3600000;
  if (hours < MIN_HOURS_BETWEEN) return false;

  const h = new Date(now).getHours();
  if (s.lastShowHour !== null && h === s.lastShowHour && hours < SAME_HOUR_ESCAPE_HOURS) return false;

  return true;
}
