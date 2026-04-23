import AsyncStorage from '@react-native-async-storage/async-storage';

import type { Budget, Expense, Income, UserProfile } from '@/types';

export const JARVIS_MISSIONS_SKIPPED_KEY = 'ahorraya_jarvis_skipped_v1';

export type JarvisMissionStepId =
  | 'primer_gasto'
  | 'primer_ingreso'
  | 'establecer_presupuesto'
  | 'definir_meta'
  | 'racha_3_dias';

export type JarvisMissionStep = {
  id: JarvisMissionStepId;
  icon: string;
  titulo: string;
  detalle: string;
  cta: string;
  ctaIcon: string;
  from: string;
  to: string;
};

export const JARVIS_MISSION_STEPS: JarvisMissionStep[] = [
  { id: 'primer_gasto', icon: '💸', titulo: 'Registrá tu primer gasto', detalle: 'Cada registro suma XP y construye tu historial.', cta: 'Registrar gasto', ctaIcon: '⚡', from: '#7C3AED', to: '#5B21B6' },
  { id: 'primer_ingreso', icon: '💼', titulo: 'Anotá tu sueldo o ingreso', detalle: 'Así podemos calcular tu tasa de ahorro y darte alertas útiles.', cta: 'Registrar ingreso', ctaIcon: '📥', from: '#00D4FF', to: '#0099BB' },
  { id: 'establecer_presupuesto', icon: '🎯', titulo: 'Establecé un presupuesto', detalle: 'Define topes por categoría. Te avisamos al acercarte al límite.', cta: 'Ir a presupuestos', ctaIcon: '📊', from: '#FFB84D', to: '#E08000' },
  { id: 'definir_meta', icon: '🏆', titulo: 'Define tu meta de ahorro mensual', detalle: 'Una meta concreta multiplica las chances de cumplirla.', cta: 'Establecer meta', ctaIcon: '🏆', from: '#4DF2B1', to: '#006C4A' },
  { id: 'racha_3_dias', icon: '🔥', titulo: 'Mantené tu racha 3 días', detalle: 'Registrá al menos un movimiento al día. Las rachas suman XP.', cta: 'Registrar ahora', ctaIcon: '🔥', from: '#FF5E7D', to: '#C8003A' },
];

export async function loadJarvisSkipped(): Promise<JarvisMissionStepId[]> {
  try {
    const raw = await AsyncStorage.getItem(JARVIS_MISSIONS_SKIPPED_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as JarvisMissionStepId[]) : [];
  } catch {
    return [];
  }
}

export async function saveJarvisSkipped(ids: JarvisMissionStepId[]): Promise<void> {
  await AsyncStorage.setItem(JARVIS_MISSIONS_SKIPPED_KEY, JSON.stringify(ids));
}

export function getPendingJarvisSteps(params: {
  expenses: Expense[];
  incomes: Income[];
  budgets: Budget[];
  profile: UserProfile;
  skipped: JarvisMissionStepId[];
}): JarvisMissionStep[] {
  const { expenses, incomes, budgets, profile, skipped } = params;
  const hasBudget = budgets.some((b) => b.limiteMonthly > 0);
  const hasMeta = (profile.metaMensual ?? 0) > 0;

  return JARVIS_MISSION_STEPS.filter(({ id }) => {
    if (skipped.includes(id)) return false;
    if (id === 'primer_gasto' && expenses.length > 0) return false;
    if (id === 'primer_ingreso' && incomes.length > 0) return false;
    if (id === 'establecer_presupuesto' && hasBudget) return false;
    if (id === 'definir_meta' && hasMeta) return false;
    if (id === 'racha_3_dias' && profile.rachaActual >= 3) return false;
    return true;
  });
}
