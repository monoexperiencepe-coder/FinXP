import { supabase } from '@/lib/supabase';
import { ESTADOS_DE_ANIMO } from '@/lib/mood';
import type {
  Budget,
  CreditCard,
  EstadoDeAnimo,
  Expense,
  FixedExpense,
  Income,
  IncomeFrecuencia,
  IncomeTipo,
  Mission,
  MissionTipo,
  MonedaCode,
} from '@/types';
import { DEFAULT_BANCOS_DISPONIBLES, DEFAULT_METODOS_DE_PAGO, type MetodoDePagoItem } from '@/types';

export type UserProfileRow = {
  id: string;
  nombre_usuario: string;
  nivel: number;
  xp_actual: number;
  xp_para_siguiente_nivel: number;
  racha_actual: number;
  racha_maxima: number;
  ultimo_registro: string | null;
  moneda_principal: string;
  tipo_de_cambio: number | string;
  misiones_completadas: number;
  theme: string;
  metodos_de_pago: string[] | null;
  bancos_disponibles?: string[] | null;
  onboarding_done?: boolean;
};

export type UserProfileRowPatch = Partial<{
  nombre_usuario: string;
  nivel: number;
  xp_actual: number;
  xp_para_siguiente_nivel: number;
  racha_actual: number;
  racha_maxima: number;
  ultimo_registro: string | null;
  moneda_principal: string;
  tipo_de_cambio: number;
  misiones_completadas: number;
  theme: string;
  metodos_de_pago: string[] | null;
  bancos_disponibles: string[] | null;
  onboarding_done: boolean;
}>;

const INCOME_TIPOS: IncomeTipo[] = [
  'Salario',
  'Freelance',
  'Inversion',
  'Regalo',
  'Otro',
  'Fijo',
  'Variable',
  'Extraordinario',
];

const INCOME_FRECUENCIAS: IncomeFrecuencia[] = [
  'Unico',
  'Diaria',
  'Semanal',
  'Quincenal',
  'Mensual',
  'Trimestral',
  'Semestral',
  'Anual',
];

const MISSION_TIPOS: MissionTipo[] = [
  'dias_sin_categoria',
  'racha_registro',
  'presupuesto_categoria',
  'primer_ingreso',
  'otro',
];

function mapEstadoDeAnimo(v: string | null | undefined): Expense['estadoDeAnimo'] {
  if (!v) return null;
  if (ESTADOS_DE_ANIMO.includes(v as EstadoDeAnimo)) return v as EstadoDeAnimo;
  return null;
}

function mapIncomeTipo(v: string | null | undefined): IncomeTipo {
  if (v && INCOME_TIPOS.includes(v as IncomeTipo)) return v as IncomeTipo;
  return 'Otro';
}

function mapIncomeFrecuencia(v: string | null | undefined): IncomeFrecuencia {
  if (v && INCOME_FRECUENCIAS.includes(v as IncomeFrecuencia)) return v as IncomeFrecuencia;
  return 'Unico';
}

function mapMissionTipo(v: string | null | undefined): MissionTipo {
  if (v && MISSION_TIPOS.includes(v as MissionTipo)) return v as MissionTipo;
  return 'otro';
}

export function mapMoneda(v: string | null | undefined, fallback: MonedaCode): MonedaCode {
  if (v === 'USD' || v === 'PEN') return v;
  return fallback;
}

export function metodosDePagoFromDb(arr: string[] | null | undefined): MetodoDePagoItem[] {
  if (!arr?.length) return DEFAULT_METODOS_DE_PAGO;
  return arr.map((nombre, i) => ({ id: `mdp-db-${i}-${nombre}`, nombre, activo: true }));
}

export function rowToExpense(e: {
  id: string;
  fecha: string;
  cuenta: string | null;
  medio_de_pago: string | null;
  banco: string | null;
  categoria: string;
  comercio: string | null;
  es_esencial: boolean | null;
  estado_de_animo: string | null;
  moneda: string | null;
  descripcion: string | null;
  importe: number | string;
  mes: string;
  xp_ganado: number | null;
}): Expense {
  return {
    id: e.id,
    fecha: e.fecha,
    cuenta: e.cuenta ?? '',
    medioDePago: e.medio_de_pago ?? '',
    banco: e.banco ?? '',
    categoria: e.categoria,
    comercio: e.comercio ?? '',
    esEsencial: Boolean(e.es_esencial),
    estadoDeAnimo: mapEstadoDeAnimo(e.estado_de_animo),
    moneda: mapMoneda(e.moneda, 'PEN'),
    descripcion: e.descripcion ?? '',
    importe: Number(e.importe),
    mes: e.mes,
    xpGanado: e.xp_ganado ?? 10,
  };
}

export function rowToIncome(
  i: {
    id: string;
    fecha: string;
    monto: number | string;
    moneda: string | null;
    fuente: string | null;
    tipo: string | null;
    objetivo: string | null;
    frecuencia: string | null;
    banco: string | null;
    categoria: string | null;
    descripcion: string | null;
    mes: string;
  },
  medioDePagoFallback = 'Transferencia',
): Income {
  return {
    id: i.id,
    fecha: i.fecha,
    fuente: i.fuente ?? '',
    tipo: mapIncomeTipo(i.tipo),
    objetivo: i.objetivo ?? '',
    frecuencia: mapIncomeFrecuencia(i.frecuencia),
    medioDePago: medioDePagoFallback,
    banco: i.banco ?? '',
    categoria: i.categoria ?? '',
    moneda: mapMoneda(i.moneda, 'PEN'),
    descripcion: i.descripcion ?? '',
    importe: Number(i.monto),
    mes: i.mes,
  };
}

export function rowToFixedExpense(
  r: {
    id: string;
    nombre: string;
    monto: number | string;
    categoria: string;
  },
  moneda: MonedaCode,
): FixedExpense {
  return {
    id: r.id,
    descripcion: r.nombre,
    responsable: 'Titular',
    moneda,
    categoria: r.categoria,
    montoMensual: Number(r.monto),
  };
}

export function rowToCreditCard(
  r: {
    id: string;
    nombre: string;
    limite: number | string;
    saldo_usado: number | string;
  },
  moneda: MonedaCode,
): CreditCard {
  return {
    id: r.id,
    nombre: r.nombre,
    moneda,
    lineaTotal: Number(r.limite),
    gastosMes: Number(r.saldo_usado),
  };
}

export function rowToBudget(
  r: { categoria: string; limite: number | string },
  moneda: MonedaCode,
  gastadoActual = 0,
): Budget {
  return {
    categoria: r.categoria,
    limiteMonthly: Number(r.limite),
    gastadoActual,
    moneda,
  };
}

export function rowToMission(r: {
  id: string;
  titulo: string;
  descripcion: string | null;
  tipo: string | null;
  meta: number | string | null;
  progreso: number | string | null;
  completada: boolean | null;
  xp_recompensa: number | null;
  fecha_limite: string | null;
}): Mission {
  const exp = r.fecha_limite ?? new Date().toISOString();
  return {
    id: r.id,
    titulo: r.titulo,
    descripcion: r.descripcion ?? '',
    xpRecompensa: r.xp_recompensa ?? 50,
    progreso: Number(r.progreso ?? 0),
    meta: Number(r.meta ?? 0),
    completada: Boolean(r.completada),
    fechaExpiracion: exp,
    tipo: mapMissionTipo(r.tipo),
  };
}

export type ExpenseDbRow = Parameters<typeof rowToExpense>[0];
export type IncomeDbRow = Parameters<typeof rowToIncome>[0];

export async function getProfile(userId: string): Promise<UserProfileRow | null> {
  const { data, error } = await supabase.from('user_profiles').select('*').eq('id', userId).maybeSingle();
  if (error) throw error;
  return data as UserProfileRow | null;
}

export async function updateProfile(userId: string, updates: UserProfileRowPatch) {
  const { error } = await supabase.from('user_profiles').update(updates).eq('id', userId);
  if (error) throw error;
}

/** Añade un banco a `user_profiles.bancos_disponibles` y devuelve la lista resultante. */
export async function addBancoDisponible(userId: string, nombre: string): Promise<string[] | null> {
  const row = await getProfile(userId);
  if (!row) return null;
  const trimmed = nombre.trim();
  if (!trimmed) return null;
  const current = row.bancos_disponibles ?? [];
  if (current.includes(trimmed)) return current;
  const next = [...current, trimmed];
  await updateProfile(userId, { bancos_disponibles: next });
  return next;
}

/** Quita un banco; no permite dejar la lista vacía. Devuelve la nueva lista o null. */
export async function removeBancoDisponible(userId: string, nombre: string): Promise<string[] | null> {
  const row = await getProfile(userId);
  if (!row) return null;
  const current = row.bancos_disponibles ?? [];
  const next = current.filter((b) => b !== nombre);
  if (next.length === 0 || next.length === current.length) return null;
  await updateProfile(userId, { bancos_disponibles: next });
  return next;
}

export async function markOnboardingDone(userId: string) {
  const { error } = await supabase
    .from('user_profiles')
    .update({ onboarding_done: true })
    .eq('id', userId);
  if (error) throw error;
}

export async function getExpenses(userId: string, mes?: string) {
  let query = supabase.from('expenses').select('*').eq('user_id', userId).order('fecha', { ascending: false });
  if (mes) query = query.eq('mes', mes);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function addExpense(userId: string, expense: Omit<Expense, 'id'>) {
  const { data, error } = await supabase
    .from('expenses')
    .insert({
      user_id: userId,
      fecha: expense.fecha,
      cuenta: expense.cuenta,
      medio_de_pago: expense.medioDePago,
      banco: expense.banco,
      categoria: expense.categoria,
      comercio: expense.comercio,
      es_esencial: expense.esEsencial,
      estado_de_animo: expense.estadoDeAnimo,
      moneda: expense.moneda,
      descripcion: expense.descripcion,
      importe: expense.importe,
      mes: expense.mes,
      xp_ganado: expense.xpGanado ?? 10,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function deleteExpense(expenseId: string) {
  const { error } = await supabase.from('expenses').delete().eq('id', expenseId);
  if (error) throw error;
}

export async function getIncomes(userId: string, mes?: string) {
  let query = supabase.from('incomes').select('*').eq('user_id', userId).order('fecha', { ascending: false });
  if (mes) query = query.eq('mes', mes);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function addIncome(userId: string, income: Omit<Income, 'id'>) {
  const { data, error } = await supabase
    .from('incomes')
    .insert({
      user_id: userId,
      fecha: income.fecha,
      monto: income.importe,
      moneda: income.moneda,
      fuente: income.fuente,
      tipo: income.tipo,
      objetivo: income.objetivo,
      frecuencia: income.frecuencia,
      banco: income.banco,
      categoria: income.categoria,
      descripcion: income.descripcion,
      mes: income.mes,
      xp_ganado: 20,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function getFixedExpenses(userId: string) {
  const { data, error } = await supabase
    .from('fixed_expenses')
    .select('*')
    .eq('user_id', userId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getCreditCards(userId: string) {
  const { data, error } = await supabase.from('credit_cards').select('*').eq('user_id', userId);
  if (error) throw error;
  return data ?? [];
}

export async function getBudgets(userId: string, mes: string) {
  const { data, error } = await supabase.from('budgets').select('*').eq('user_id', userId).eq('mes', mes);
  if (error) throw error;
  return data ?? [];
}

export async function upsertBudget(userId: string, categoria: string, limite: number, mes: string) {
  const { error } = await supabase.from('budgets').upsert(
    {
      user_id: userId,
      categoria,
      limite,
      mes,
    },
    { onConflict: 'user_id,categoria,mes' },
  );
  if (error) throw error;
}

export async function getMissions(userId: string) {
  const { data, error } = await supabase.from('missions').select('*').eq('user_id', userId).order('created_at', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

export async function getCategories(userId: string) {
  const { data, error } = await supabase
    .from('user_categories')
    .select('*')
    .eq('user_id', userId)
    .order('orden', { ascending: true });
  if (error) throw error;
  return data || [];
}

export async function addCategory(userId: string, nombre: string, emoji: string = '📦', orden: number = 0) {
  const { data, error } = await supabase
    .from('user_categories')
    .insert({ user_id: userId, nombre, emoji, orden })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function updateCategory(categoryId: string, nombre: string, emoji: string) {
  const { error } = await supabase
    .from('user_categories')
    .update({ nombre, emoji })
    .eq('id', categoryId);
  if (error) throw error;
}

export async function deleteCategory(categoryId: string) {
  const { error } = await supabase
    .from('user_categories')
    .delete()
    .eq('id', categoryId);
  if (error) throw error;
}

export async function initDefaultCategories(userId: string) {
  const { data: existing } = await supabase
    .from('user_categories')
    .select('id')
    .eq('user_id', userId)
    .limit(1);

  if (existing && existing.length > 0) return;

  const defaults = [
    { nombre: 'Alimentación', emoji: '🍔', orden: 0 },
    { nombre: 'Transporte', emoji: '🚌', orden: 1 },
    { nombre: 'Entretenimiento', emoji: '🎮', orden: 2 },
    { nombre: 'Salud', emoji: '💊', orden: 3 },
    { nombre: 'Ropa', emoji: '👕', orden: 4 },
    { nombre: 'Educación', emoji: '📚', orden: 5 },
    { nombre: 'Hogar', emoji: '🏠', orden: 6 },
    { nombre: 'Servicios', emoji: '💡', orden: 7 },
    { nombre: 'Otros', emoji: '📦', orden: 8 },
  ];
  const { error } = await supabase
    .from('user_categories')
    .insert(defaults.map((c) => ({ ...c, user_id: userId })));
  if (error) throw error;
}
