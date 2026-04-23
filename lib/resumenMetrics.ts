import type { AppTheme } from '@/constants/theme';
import { EXPENSE_CATEGORIES } from '@/constants/expenseCategories';
import { convertAmount } from '@/lib/currency';
import { addMonthsToYearMonth, lastNYearMonths, monthsOfYearUpTo, parseDateKeyLocal, toDateKey } from '@/lib/dates';
import type {
  Budget,
  CreditCard,
  EstadoDeAnimo,
  Expense,
  FixedExpense,
  Income,
  MetodoDePagoItem,
  MonedaCode,
} from '@/types';

export type DisplayRow = {
  categoriaId: string;
  nombre: string;
  emoji: string;
  spent: number;
  budget: number;
};

export function buildDisplayRows(
  expenses: Expense[],
  budgets: Budget[],
  yearMonth: string,
  display: MonedaCode,
  rate: number,
): DisplayRow[] {
  const byCat: Record<string, number> = {};
  for (const e of expenses) {
    if (e.mes !== yearMonth) continue;
    const v = convertAmount(e.importe, e.moneda, display, rate);
    byCat[e.categoria] = (byCat[e.categoria] ?? 0) + v;
  }
  return EXPENSE_CATEGORIES.map((cat) => {
    const b = budgets.find((x) => x.categoria === cat.id);
    const spent = byCat[cat.id] ?? 0;
    const budget = b ? convertAmount(b.limiteMonthly, b.moneda, display, rate) : 0;
    return {
      categoriaId: cat.id,
      nombre: cat.name,
      emoji: cat.emoji,
      spent,
      budget,
    };
  });
}

export function sumMonthExpensesDisplay(
  expenses: Expense[],
  ym: string,
  display: MonedaCode,
  rate: number,
): number {
  let s = 0;
  for (const e of expenses) {
    if (e.mes !== ym) continue;
    s += convertAmount(e.importe, e.moneda, display, rate);
  }
  return s;
}

export function sumMonthIncomesDisplay(
  incomes: Income[],
  ym: string,
  display: MonedaCode,
  rate: number,
): number {
  let s = 0;
  for (const i of incomes) {
    if (i.mes !== ym) continue;
    s += convertAmount(i.importe, i.moneda, display, rate);
  }
  return s;
}

export function sumFixedMonthlyDisplay(
  fixed: FixedExpense[],
  display: MonedaCode,
  rate: number,
): number {
  return fixed.reduce(
    (acc, f) => acc + convertAmount(f.montoMensual, f.moneda, display, rate),
    0,
  );
}

export function incomeByFuente(
  incomes: Income[],
  ym: string,
  display: MonedaCode,
  rate: number,
): { fuente: string; total: number }[] {
  const map: Record<string, number> = {};
  for (const i of incomes) {
    if (i.mes !== ym) continue;
    const v = convertAmount(i.importe, i.moneda, display, rate);
    map[i.fuente] = (map[i.fuente] ?? 0) + v;
  }
  return Object.entries(map)
    .map(([fuente, total]) => ({ fuente, total }))
    .sort((a, b) => b.total - a.total);
}

export function monthTitleEs(ym: string): string {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const raw = d.toLocaleDateString('es-PE', { month: 'long', year: 'numeric' });
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

const MES_CORTO = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

export function shortMonthLabel(ym: string): string {
  const m = Number(ym.split('-')[1]);
  return MES_CORTO[(m - 1 + 12) % 12] ?? ym;
}

export function lastSixMonthsSeries(
  expenses: Expense[],
  incomes: Income[],
  endYm: string,
  display: MonedaCode,
  rate: number,
): { ym: string; label: string; ingresos: number; gastos: number }[] {
  const months = lastNYearMonths(endYm, 6);
  return months.map((ym) => ({
    ym,
    label: shortMonthLabel(ym),
    ingresos: sumMonthIncomesDisplay(incomes, ym, display, rate),
    gastos: sumMonthExpensesDisplay(expenses, ym, display, rate),
  }));
}

/** Barras flujo: ingresos, gastos variables, gastos fijos (mismo total fijo por mes). */
export function lastSixMonthsFlowBars(
  expenses: Expense[],
  incomes: Income[],
  fixed: FixedExpense[],
  endYm: string,
  display: MonedaCode,
  rate: number,
): { label: string; ingresos: number; variables: number; fijos: number }[] {
  const fijos = sumFixedMonthlyDisplay(fixed, display, rate);
  const months = lastNYearMonths(endYm, 6);
  return months.map((ym) => ({
    label: shortMonthLabel(ym),
    ingresos: sumMonthIncomesDisplay(incomes, ym, display, rate),
    variables: sumMonthExpensesDisplay(expenses, ym, display, rate),
    fijos,
  }));
}

export function monthNetFlow(
  expenses: Expense[],
  incomes: Income[],
  fixed: FixedExpense[],
  ym: string,
  display: MonedaCode,
  rate: number,
): number {
  const ing = sumMonthIncomesDisplay(incomes, ym, display, rate);
  const varG = sumMonthExpensesDisplay(expenses, ym, display, rate);
  const fij = sumFixedMonthlyDisplay(fixed, display, rate);
  return ing - varG - fij;
}

export function yearAccumulatedFlow(
  expenses: Expense[],
  incomes: Income[],
  fixed: FixedExpense[],
  yearMonth: string,
  display: MonedaCode,
  rate: number,
): number {
  return monthsOfYearUpTo(yearMonth).reduce(
    (acc, ym) => acc + monthNetFlow(expenses, incomes, fixed, ym, display, rate),
    0,
  );
}

export function lastSixMonthsIncomeTotals(
  incomes: Income[],
  endYm: string,
  display: MonedaCode,
  rate: number,
): { x: number; y: number; label: string }[] {
  const months = lastNYearMonths(endYm, 6);
  return months.map((ym, idx) => ({
    x: idx,
    y: sumMonthIncomesDisplay(incomes, ym, display, rate),
    label: shortMonthLabel(ym),
  }));
}

export type MoodAgg = {
  mood: EstadoDeAnimo;
  count: number;
  total: number;
  avg: number;
  topCategoryId: string | null;
  esencial: number;
  noEsencial: number;
};

export function moodAggregates(
  expenses: Expense[],
  ym: string,
  display: MonedaCode,
  rate: number,
): MoodAgg[] {
  const groups: Record<
    string,
    { totals: number; count: number; cats: Record<string, number>; esencial: number; noEsencial: number }
  > = {};
  for (const e of expenses) {
    if (e.mes !== ym) continue;
    const m = e.estadoDeAnimo;
    if (m == null) continue;
    if (!groups[m]) groups[m] = { totals: 0, count: 0, cats: {}, esencial: 0, noEsencial: 0 };
    const v = convertAmount(e.importe, e.moneda, display, rate);
    groups[m].totals += v;
    groups[m].count += 1;
    if (e.esEsencial) groups[m].esencial += v;
    else groups[m].noEsencial += v;
    groups[m].cats[e.categoria] = (groups[m].cats[e.categoria] ?? 0) + 1;
  }
  return (Object.keys(groups) as EstadoDeAnimo[])
    .map((mood) => {
      const g = groups[mood];
      let topCategoryId: string | null = null;
      let mx = 0;
      for (const [cid, c] of Object.entries(g.cats)) {
        if (c > mx) {
          mx = c;
          topCategoryId = cid;
        }
      }
      return {
        mood,
        count: g.count,
        total: g.totals,
        avg: g.count ? g.totals / g.count : 0,
        topCategoryId,
        esencial: g.esencial,
        noEsencial: g.noEsencial,
      };
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.avg - a.avg);
}

export function priciestMood(aggs: MoodAgg[]): MoodAgg | null {
  if (!aggs.length) return null;
  return aggs.reduce((a, b) => (a.avg >= b.avg ? a : b));
}

export function monthSpendChangePct(
  expenses: Expense[],
  ymNow: string,
  display: MonedaCode,
  rate: number,
): { pct: number; prevYm: string } | null {
  const prevYm = addMonthsToYearMonth(ymNow, -1);
  const now = sumMonthExpensesDisplay(expenses, ymNow, display, rate);
  const prev = sumMonthExpensesDisplay(expenses, prevYm, display, rate);
  if (prev <= 0) return null;
  return { pct: ((now - prev) / prev) * 100, prevYm };
}

export function topSpentCategory(rows: DisplayRow[]): DisplayRow | null {
  const withSpend = rows.filter((r) => r.spent > 0);
  if (!withSpend.length) return null;
  return withSpend.reduce((a, b) => (a.spent >= b.spent ? a : b));
}

export function budgetProjection(
  expenses: Expense[],
  ym: string,
  budgetTotal: number,
  display: MonedaCode,
  rate: number,
  refDate = new Date(),
): { projected: number; willExceed: boolean; day: number; daysInMonth: number } | null {
  const [y, m] = ym.split('-').map(Number);
  if (refDate.getFullYear() !== y || refDate.getMonth() !== m - 1) {
    const spent = sumMonthExpensesDisplay(expenses, ym, display, rate);
    const daysInMonth = new Date(y, m, 0).getDate();
    return { projected: spent, willExceed: spent > budgetTotal, day: daysInMonth, daysInMonth };
  }
  const day = refDate.getDate();
  const daysInMonth = new Date(y, m, 0).getDate();
  if (day < 1) return null;
  const spent = sumMonthExpensesDisplay(expenses, ym, display, rate);
  const projected = (spent / day) * daysInMonth;
  return { projected, willExceed: projected > budgetTotal, day, daysInMonth };
}

export function essentialSplitMonth(
  expenses: Expense[],
  ym: string,
  display: MonedaCode,
  rate: number,
): { esencial: number; noEsencial: number } {
  let esencial = 0;
  let noEsencial = 0;
  for (const e of expenses) {
    if (e.mes !== ym) continue;
    const v = convertAmount(e.importe, e.moneda, display, rate);
    if (e.esEsencial) esencial += v;
    else noEsencial += v;
  }
  return { esencial, noEsencial };
}

export function topComercios(
  expenses: Expense[],
  ym: string,
  display: MonedaCode,
  rate: number,
  n = 3,
): { comercio: string; total: number }[] {
  const map: Record<string, number> = {};
  for (const e of expenses) {
    if (e.mes !== ym) continue;
    const key = (e.comercio || 'Sin nombre').trim() || 'Sin nombre';
    const v = convertAmount(e.importe, e.moneda, display, rate);
    map[key] = (map[key] ?? 0) + v;
  }
  return Object.entries(map)
    .map(([comercio, total]) => ({ comercio, total }))
    .sort((a, b) => b.total - a.total)
    .slice(0, n);
}

export type FuenteBucket = 'Empresa' | 'Cliente' | 'Plataformas' | 'Amigos' | 'Familia' | 'Otros';

export function bucketFuente(fuente: string): FuenteBucket {
  const f = fuente.trim();
  if (f === 'Empresa') return 'Empresa';
  if (f === 'Cliente') return 'Cliente';
  if (f === 'Plataformas') return 'Plataformas';
  if (f === 'Amigos') return 'Amigos';
  if (f === 'Familia') return 'Familia';
  return 'Otros';
}

export function incomeByFuenteBucket(
  incomes: Income[],
  ym: string,
  display: MonedaCode,
  rate: number,
): { bucket: FuenteBucket; total: number }[] {
  const map: Record<FuenteBucket, number> = {
    Empresa: 0,
    Cliente: 0,
    Plataformas: 0,
    Amigos: 0,
    Familia: 0,
    Otros: 0,
  };
  for (const i of incomes) {
    if (i.mes !== ym) continue;
    const v = convertAmount(i.importe, i.moneda, display, rate);
    map[bucketFuente(i.fuente)] += v;
  }
  return (Object.keys(map) as FuenteBucket[])
    .map((bucket) => ({ bucket, total: map[bucket] }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
}

export type TipoGrupoIngreso = 'Fijo' | 'Variable' | 'Extraordinario';

export function incomeTipoGrupo(i: Income): TipoGrupoIngreso {
  if (i.tipo === 'Salario' || i.tipo === 'Fijo') return 'Fijo';
  if (i.tipo === 'Inversion' || i.tipo === 'Regalo' || i.tipo === 'Extraordinario') return 'Extraordinario';
  if (i.tipo === 'Variable') return 'Variable';
  return 'Variable';
}

export function incomeByTipoGrupo(
  incomes: Income[],
  ym: string,
  display: MonedaCode,
  rate: number,
): { grupo: TipoGrupoIngreso; total: number }[] {
  const map: Record<TipoGrupoIngreso, number> = { Fijo: 0, Variable: 0, Extraordinario: 0 };
  for (const i of incomes) {
    if (i.mes !== ym) continue;
    const v = convertAmount(i.importe, i.moneda, display, rate);
    map[incomeTipoGrupo(i)] += v;
  }
  return (Object.keys(map) as TipoGrupoIngreso[])
    .map((grupo) => ({ grupo, total: map[grupo] }))
    .filter((x) => x.total > 0)
    .sort((a, b) => b.total - a.total);
}

export function incomeMonthChangePct(
  incomes: Income[],
  ym: string,
  display: MonedaCode,
  rate: number,
): { pct: number } | null {
  const prevYm = addMonthsToYearMonth(ym, -1);
  const now = sumMonthIncomesDisplay(incomes, ym, display, rate);
  const prev = sumMonthIncomesDisplay(incomes, prevYm, display, rate);
  if (prev <= 0) return null;
  return { pct: ((now - prev) / prev) * 100 };
}

export function yearAverageMonthlyIncome(
  incomes: Income[],
  yearMonth: string,
  display: MonedaCode,
  rate: number,
): number {
  const months = monthsOfYearUpTo(yearMonth);
  if (!months.length) return 0;
  const sum = months.reduce((s, ym) => s + sumMonthIncomesDisplay(incomes, ym, display, rate), 0);
  return sum / months.length;
}

export function categoryMaxGrowthVsPrevious(
  expenses: Expense[],
  budgets: Budget[],
  ym: string,
  display: MonedaCode,
  rate: number,
): { categoriaId: string; nombre: string; emoji: string; pct: number; now: number; prev: number } | null {
  const prevYm = addMonthsToYearMonth(ym, -1);
  const nowRows = buildDisplayRows(expenses, budgets, ym, display, rate);
  const prevRows = buildDisplayRows(expenses, budgets, prevYm, display, rate);
  let best: { categoriaId: string; nombre: string; emoji: string; pct: number; now: number; prev: number } | null =
    null;
  for (const r of nowRows) {
    const p = prevRows.find((x) => x.categoriaId === r.categoriaId);
    const prev = p?.spent ?? 0;
    if (prev <= 0) continue;
    const pct = ((r.spent - prev) / prev) * 100;
    if (pct <= 0) continue;
    if (!best || pct > best.pct) {
      best = { categoriaId: r.categoriaId, nombre: r.nombre, emoji: r.emoji, pct, now: r.spent, prev };
    }
  }
  return best;
}

export function bestSavingMonthOfYear(
  expenses: Expense[],
  incomes: Income[],
  fixed: FixedExpense[],
  yearMonth: string,
  display: MonedaCode,
  rate: number,
): { ym: string; saving: number; label: string } | null {
  const months = monthsOfYearUpTo(yearMonth);
  let best: { ym: string; saving: number; label: string } | null = null;
  for (const ym of months) {
    const saving = monthNetFlow(expenses, incomes, fixed, ym, display, rate);
    if (!best || saving > best.saving) {
      best = { ym, saving, label: shortMonthLabel(ym) };
    }
  }
  return best;
}

export function creditCardsInDisplay(
  cards: CreditCard[],
  display: MonedaCode,
  rate: number,
): { id: string; nombre: string; linea: number; gastado: number; disponible: number; pct: number }[] {
  return cards.map((c) => {
    const linea = convertAmount(c.lineaTotal, c.moneda, display, rate);
    const gastado = convertAmount(c.gastosMes, c.moneda, display, rate);
    const disponible = Math.max(0, linea - gastado);
    const pct = linea > 0 ? (gastado / linea) * 100 : 0;
    return { id: c.id, nombre: c.nombre, linea, gastado, disponible, pct };
  });
}

export function totalCreditCardSpentMonth(
  cards: CreditCard[],
  display: MonedaCode,
  rate: number,
): number {
  return cards.reduce((s, c) => s + convertAmount(c.gastosMes, c.moneda, display, rate), 0);
}

export function cardsOverUtilization(
  cards: CreditCard[],
  display: MonedaCode,
  rate: number,
  thresholdPct = 80,
): { nombre: string; pct: number }[] {
  return creditCardsInDisplay(cards, display, rate)
    .filter((c) => c.pct >= thresholdPct)
    .map((c) => ({ nombre: c.nombre, pct: c.pct }));
}

/** Filtro de período en pantalla Resumen. */
export type PeriodFilter = 'hoy' | 'semana' | 'mes' | 'personalizado';

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Semana calendario: lunes a domingo (local). */
export function startOfWeekMonday(d: Date): Date {
  const x = startOfDay(d);
  const dow = x.getDay();
  const offset = dow === 0 ? -6 : 1 - dow;
  x.setDate(x.getDate() + offset);
  return x;
}

export function endOfWeekSunday(d: Date): Date {
  const s = startOfWeekMonday(d);
  const e = new Date(s);
  e.setDate(e.getDate() + 6);
  e.setHours(23, 59, 59, 999);
  return e;
}

/** Mismo número de días calendario que [from, to], inmediatamente anterior a `start`. */
export function customPeriodBounds(fromInput: Date, toInput: Date): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const start = startOfDay(fromInput);
  const end = endOfDay(toInput);
  const days = calendarDaysInclusive(start, end);
  const dayBefore = new Date(start);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const prevEnd = endOfDay(dayBefore);
  const prevStart = startOfDay(dayBefore);
  prevStart.setDate(prevStart.getDate() - (days - 1));
  return { start, end, prevStart, prevEnd };
}

/** Límites válidos desde strings `YYYY-MM-DD`; null si inválido o desde > hasta. */
export function tryCustomBoundsFromKeys(fromYmd: string, toYmd: string): { start: Date; end: Date; prevStart: Date; prevEnd: Date } | null {
  const a = parseDateKeyLocal(fromYmd);
  const b = parseDateKeyLocal(toYmd);
  if (!a || !b) return null;
  if (startOfDay(a).getTime() > startOfDay(b).getTime()) return null;
  if (calendarDaysInclusive(startOfDay(a), endOfDay(b)) > 366) return null;
  return customPeriodBounds(a, b);
}

export function periodBounds(
  filter: Exclude<PeriodFilter, 'personalizado'>,
  ref = new Date(),
): { start: Date; end: Date; prevStart: Date; prevEnd: Date } {
  const refDay = startOfDay(ref);
  if (filter === 'hoy') {
    const end = endOfDay(ref);
    const prev = new Date(refDay);
    prev.setDate(prev.getDate() - 1);
    return { start: refDay, end, prevStart: startOfDay(prev), prevEnd: endOfDay(prev) };
  }
  if (filter === 'semana') {
    const ws = startOfWeekMonday(ref);
    const we = endOfWeekSunday(ref);
    const beforeWeek = new Date(ws);
    beforeWeek.setDate(beforeWeek.getDate() - 1);
    const pws = startOfWeekMonday(beforeWeek);
    const pwe = endOfWeekSunday(beforeWeek);
    return { start: ws, end: we, prevStart: pws, prevEnd: pwe };
  }
  const y = ref.getFullYear();
  const m = ref.getMonth();
  const start = new Date(y, m, 1, 0, 0, 0, 0);
  const end = new Date(y, m + 1, 0, 23, 59, 59, 999);
  const prevStart = new Date(y, m - 1, 1, 0, 0, 0, 0);
  const prevEnd = new Date(y, m, 0, 23, 59, 59, 999);
  return { start, end, prevStart, prevEnd };
}

function inRange(isoFecha: string, start: Date, end: Date): boolean {
  const t = new Date(isoFecha).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export function sumExpensesInRange(
  expenses: Expense[],
  start: Date,
  end: Date,
  display: MonedaCode,
  rate: number,
): number {
  let s = 0;
  for (const e of expenses) {
    if (!inRange(e.fecha, start, end)) continue;
    s += convertAmount(e.importe, e.moneda, display, rate);
  }
  return s;
}

/** Días de calendario inclusivos entre start y end (solo fecha, sin hora). */
function calendarDaysInclusive(start: Date, end: Date): number {
  const sd = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const ed = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.max(1, Math.round((ed.getTime() - sd.getTime()) / 86400000) + 1);
}

/** Gastos fijos mensuales prorrateados a la duración del período (vs días del mes de ref). */
export function proratedFixedExpensesInRange(
  fixed: FixedExpense[],
  start: Date,
  end: Date,
  display: MonedaCode,
  rate: number,
  ref: Date,
): number {
  const monthly = sumFixedMonthlyDisplay(fixed, display, rate);
  const dim = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  const days = calendarDaysInclusive(start, end);
  return monthly * (days / dim);
}

export function fixedVsVariableInRange(
  fixed: FixedExpense[],
  expenses: Expense[],
  start: Date,
  end: Date,
  display: MonedaCode,
  rate: number,
  ref: Date,
): { fijos: number; variables: number; total: number; pctFijos: number; pctVariables: number } {
  const fijos = proratedFixedExpensesInRange(fixed, start, end, display, rate, ref);
  const variables = sumExpensesInRange(expenses, start, end, display, rate);
  const total = fijos + variables;
  return {
    fijos,
    variables,
    total,
    pctFijos: total > 0 ? Math.round((fijos / total) * 100) : 0,
    pctVariables: total > 0 ? Math.round((variables / total) * 100) : 0,
  };
}

export function essentialSplitInRange(
  expenses: Expense[],
  start: Date,
  end: Date,
  display: MonedaCode,
  rate: number,
): { esencial: number; noEsencial: number; pctEsencial: number; pctNoEsencial: number; total: number } {
  let esencial = 0;
  let noEsencial = 0;
  for (const e of expenses) {
    if (!inRange(e.fecha, start, end)) continue;
    const v = convertAmount(e.importe, e.moneda, display, rate);
    if (e.esEsencial) esencial += v;
    else noEsencial += v;
  }
  const total = esencial + noEsencial;
  return {
    esencial,
    noEsencial,
    total,
    pctEsencial: total > 0 ? Math.round((esencial / total) * 100) : 0,
    pctNoEsencial: total > 0 ? Math.round((noEsencial / total) * 100) : 0,
  };
}

export type ComercioSpendRow = { comercio: string; total: number; pct: number };

export function topComerciosInRange(
  expenses: Expense[],
  start: Date,
  end: Date,
  display: MonedaCode,
  rate: number,
  limit = 3,
): ComercioSpendRow[] {
  const map: Record<string, number> = {};
  for (const e of expenses) {
    if (!inRange(e.fecha, start, end)) continue;
    const key = (e.comercio?.trim() || 'Sin comercio') || 'Sin comercio';
    map[key] = (map[key] ?? 0) + convertAmount(e.importe, e.moneda, display, rate);
  }
  const totalPeriod = sumExpensesInRange(expenses, start, end, display, rate);
  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([comercio, total]) => ({
      comercio,
      total,
      pct: totalPeriod > 0 ? Math.round((total / totalPeriod) * 100) : 0,
    }));
}

export function sumIncomesInRange(
  incomes: Income[],
  start: Date,
  end: Date,
  display: MonedaCode,
  rate: number,
): number {
  let s = 0;
  for (const i of incomes) {
    if (!inRange(i.fecha, start, end)) continue;
    s += convertAmount(i.importe, i.moneda, display, rate);
  }
  return s;
}

/** % cambio vs período anterior; null si no hay base. */
export function pctChangeVsPrevious(now: number, prev: number): number | null {
  if (prev <= 0) return now > 0 ? null : 0;
  return ((now - prev) / prev) * 100;
}

export type MedioGrupo = 'Credito' | 'Debito' | 'Efectivo';

function bucketMedio(medioDePago: string): MedioGrupo {
  const m = medioDePago.toLowerCase();
  if (m.includes('efectivo')) return 'Efectivo';
  if (m.includes('débito') || m.includes('debito')) return 'Debito';
  return 'Credito';
}

function normalizeMedioStr(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function assignExpenseToMetodo(medioDePago: string, active: MetodoDePagoItem[]): MetodoDePagoItem | null {
  if (active.length === 0) return null;
  const nm = normalizeMedioStr(medioDePago);
  const sorted = [...active].sort(
    (a, b) => normalizeMedioStr(b.nombre).length - normalizeMedioStr(a.nombre).length,
  );
  for (const m of sorted) {
    const key = normalizeMedioStr(m.nombre);
    if (key.length >= 2 && nm.includes(key)) return m;
  }
  const legacy = bucketMedio(medioDePago);
  for (const m of active) {
    const n = normalizeMedioStr(m.nombre);
    if (legacy === 'Efectivo' && (n.includes('efect') || n === 'cash')) return m;
    if (legacy === 'Debito' && (n.includes('debit') || n.includes('débit'))) return m;
    if (
      legacy === 'Credito' &&
      (n.includes('cred') || n.includes('tarj') || n.includes('visa') || n.includes('master'))
    ) {
      return m;
    }
  }
  if (legacy === 'Efectivo') return active.find((m) => normalizeMedioStr(m.nombre).includes('efect')) ?? null;
  if (legacy === 'Debito') return active.find((m) => normalizeMedioStr(m.nombre).includes('debit')) ?? null;
  return active.find((m) => {
    const n = normalizeMedioStr(m.nombre);
    return n.includes('cred') || n.includes('tarj');
  }) ?? null;
}

const OTROS_MEDIO_ID = '__otros__';

export function paymentMethodSplitInRange(
  expenses: Expense[],
  start: Date,
  end: Date,
  display: MonedaCode,
  rate: number,
  metodosDePago: MetodoDePagoItem[] | null | undefined,
  T: AppTheme,
): { grupo: string; total: number; pct: number; color: string }[] {
  const activeCustom = metodosDePago?.filter((m) => m.activo) ?? [];

  if (activeCustom.length === 0) {
    const colors: Record<MedioGrupo, string> = {
      Credito: T.primary,
      Debito: T.secondary,
      Efectivo: T.tertiary,
    };
    const totals: Record<MedioGrupo, number> = { Credito: 0, Debito: 0, Efectivo: 0 };
    for (const e of expenses) {
      if (!inRange(e.fecha, start, end)) continue;
      const v = convertAmount(e.importe, e.moneda, display, rate);
      totals[bucketMedio(e.medioDePago)] += v;
    }
    const sum = totals.Credito + totals.Debito + totals.Efectivo;
    return (['Credito', 'Debito', 'Efectivo'] as MedioGrupo[]).map((grupo) => ({
      grupo,
      total: totals[grupo],
      pct: sum > 0 ? Math.round((totals[grupo] / sum) * 100) : 0,
      color: colors[grupo],
    }));
  }

  const palette = [T.primary, T.secondary, T.tertiary, T.warning, T.gold];
  const totalsById: Record<string, number> = { [OTROS_MEDIO_ID]: 0 };
  for (const m of activeCustom) totalsById[m.id] = 0;

  for (const e of expenses) {
    if (!inRange(e.fecha, start, end)) continue;
    const v = convertAmount(e.importe, e.moneda, display, rate);
    const hit = assignExpenseToMetodo(e.medioDePago, activeCustom);
    const key = hit?.id ?? OTROS_MEDIO_ID;
    totalsById[key] = (totalsById[key] ?? 0) + v;
  }

  const rows: { grupo: string; total: number; color: string }[] = activeCustom.map((m, i) => ({
    grupo: m.nombre,
    total: totalsById[m.id] ?? 0,
    color: palette[i % palette.length]!,
  }));
  if ((totalsById[OTROS_MEDIO_ID] ?? 0) > 0) {
    rows.push({
      grupo: 'Otros',
      total: totalsById[OTROS_MEDIO_ID]!,
      color: T.textMuted,
    });
  }

  const sum = rows.reduce((s, r) => s + r.total, 0);
  return rows.map((r) => ({
    grupo: r.grupo,
    total: r.total,
    pct: sum > 0 ? Math.round((r.total / sum) * 100) : 0,
    color: r.color,
  }));
}

export type CategorySpendRow = {
  categoriaId: string;
  nombre: string;
  emoji: string;
  total: number;
  count: number;
};

export function categorySpendInRange(
  expenses: Expense[],
  start: Date,
  end: Date,
  display: MonedaCode,
  rate: number,
): CategorySpendRow[] {
  const map: Record<string, { total: number; count: number }> = {};
  for (const e of expenses) {
    if (!inRange(e.fecha, start, end)) continue;
    const v = convertAmount(e.importe, e.moneda, display, rate);
    if (!map[e.categoria]) map[e.categoria] = { total: 0, count: 0 };
    map[e.categoria].total += v;
    map[e.categoria].count += 1;
  }
  return EXPENSE_CATEGORIES.map((cat) => {
    const row = map[cat.id];
    return {
      categoriaId: cat.id,
      nombre: cat.name,
      emoji: cat.emoji,
      total: row?.total ?? 0,
      count: row?.count ?? 0,
    };
  })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total);
}

const MES_ABR = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC'];

export function dayShortLabelEs(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const mon = MES_ABR[d.getMonth()] ?? '';
  return `${day} ${mon}`;
}

export type TrendBarRow = { label: string; real: number; proj: number };

/** Barras gastos reales vs proyección según filtro (eje X acotado). */
export function buildExpenseTrendBars(
  filter: Exclude<PeriodFilter, 'personalizado'>,
  ref: Date,
  expenses: Expense[],
  display: MonedaCode,
  rate: number,
): TrendBarRow[] {
  const { start, end } = periodBounds(filter, ref);

  if (filter === 'hoy') {
    const buckets = 6;
    const rows: TrendBarRow[] = [];
    const dayStart = startOfDay(ref);
    for (let b = 0; b < buckets; b++) {
      const h0 = b * 4;
      const h1 = (b + 1) * 4;
      const segStart = new Date(dayStart);
      segStart.setHours(h0, 0, 0, 0);
      const segEnd =
        h1 >= 24
          ? endOfDay(ref)
          : (() => {
              const x = new Date(dayStart);
              x.setHours(h1, 0, 0, 0);
              return x;
            })();
      let real = 0;
      for (const e of expenses) {
        const t = new Date(e.fecha).getTime();
        if (t >= segStart.getTime() && t < segEnd.getTime()) {
          real += convertAmount(e.importe, e.moneda, display, rate);
        }
      }
      const label = `${String(h0).padStart(2, '0')}h`;
      rows.push({ label, real, proj: 0 });
    }
    const spentDay = sumExpensesInRange(expenses, start, end, display, rate);
    const hour = Math.max(0.5, ref.getHours() + ref.getMinutes() / 60);
    const projectedEod = (spentDay / hour) * 24;
    const extra = Math.max(0, projectedEod - spentDay);
    if (rows.length) {
      const last = rows[rows.length - 1];
      rows[rows.length - 1] = { ...last, proj: extra };
    }
    return rows;
  }

  if (filter === 'semana') {
    const ws = startOfWeekMonday(ref);
    const dayEndRef = endOfDay(ref).getTime();
    const reals: number[] = [];
    const labels: string[] = [];
    for (let i = 0; i < 7; i++) {
      const d0 = new Date(ws);
      d0.setDate(d0.getDate() + i);
      const d1 = startOfDay(d0);
      const d2 = endOfDay(d0);
      const real = sumExpensesInRange(expenses, d1, d2, display, rate);
      reals.push(real);
      labels.push(dayShortLabelEs(d1));
    }
    let sumPast = 0;
    let nPast = 0;
    for (let i = 0; i < 7; i++) {
      const d0 = new Date(ws);
      d0.setDate(d0.getDate() + i);
      const d1 = startOfDay(d0);
      if (d1.getTime() <= dayEndRef) {
        sumPast += reals[i];
        nPast += 1;
      }
    }
    const avg = nPast > 0 ? sumPast / nPast : 0;
    return labels.map((label, i) => {
      const d0 = new Date(ws);
      d0.setDate(d0.getDate() + i);
      const isFuture = startOfDay(d0).getTime() > dayEndRef;
      return {
        label,
        real: isFuture ? 0 : reals[i],
        proj: isFuture ? avg : 0,
      };
    });
  }

  const y = ref.getFullYear();
  const m = ref.getMonth();
  const dim = new Date(y, m + 1, 0).getDate();
  const todayD = ref.getDate();
  const monthStart = new Date(y, m, 1, 0, 0, 0, 0);
  const pastEnd = endOfDay(new Date(y, m, todayD, 0, 0, 0, 0));
  const pastTotal = sumExpensesInRange(expenses, monthStart, pastEnd, display, rate);
  const avgDaily = todayD > 0 ? pastTotal / todayD : 0;
  const rows: TrendBarRow[] = [];
  for (let d = 1; d <= dim; d++) {
    const d0 = new Date(y, m, d, 0, 0, 0, 0);
    const d1 = endOfDay(d0);
    const realDay = sumExpensesInRange(expenses, d0, d1, display, rate);
    const label = dayShortLabelEs(d0);
    const isFuture = d > todayD;
    rows.push({
      label,
      real: isFuture ? 0 : realDay,
      proj: isFuture ? avgDaily : 0,
    });
  }
  return rows;
}

export function trendSubtext(filter: PeriodFilter): string {
  if (filter === 'hoy') return 'Franjas de 4 h (hoy)';
  if (filter === 'semana') return 'Semana actual (lun–dom)';
  if (filter === 'personalizado') return 'Rango de fechas personalizado';
  return 'Mes calendario en curso';
}

/** Copy alineada al eje real del gráfico. */
export function trendSubtextDetailed(filter: PeriodFilter): string {
  if (filter === 'hoy') return 'Franjas de 4 h (hoy)';
  if (filter === 'semana') return 'Días de la semana actual';
  if (filter === 'personalizado') return 'Gastos reales acumulados por intervalo del rango elegido';
  return 'Días del mes en curso · proyección fin de mes';
}

export function trendSubtextCustomRange(start: Date, end: Date): string {
  const a = toDateKey(start);
  const b = toDateKey(end);
  return a === b ? a : `${a} → ${b}`;
}

/** Barras de tendencia para un rango arbitrario (día a día si cabe; si no, por semana). */
export function buildExpenseTrendBarsCustomRange(
  start: Date,
  end: Date,
  expenses: Expense[],
  display: MonedaCode,
  rate: number,
): TrendBarRow[] {
  const s0 = startOfDay(start);
  const e0 = endOfDay(end);
  const days = calendarDaysInclusive(s0, e0);
  if (days <= 31) {
    const rows: TrendBarRow[] = [];
    const cur = new Date(s0);
    while (cur.getTime() <= e0.getTime()) {
      const d0 = startOfDay(cur);
      const d1 = endOfDay(d0);
      const real = sumExpensesInRange(expenses, d0, d1, display, rate);
      rows.push({ label: dayShortLabelEs(d0), real, proj: 0 });
      cur.setDate(cur.getDate() + 1);
    }
    return rows;
  }
  const rows: TrendBarRow[] = [];
  const cur = new Date(s0);
  while (cur.getTime() <= e0.getTime()) {
    const w0 = startOfDay(cur);
    const w1 = new Date(w0);
    w1.setDate(w1.getDate() + 6);
    const segEnd = w1.getTime() > e0.getTime() ? e0 : endOfDay(w1);
    const real = sumExpensesInRange(expenses, w0, segEnd, display, rate);
    rows.push({ label: dayShortLabelEs(w0), real, proj: 0 });
    cur.setDate(cur.getDate() + 7);
  }
  return rows;
}

export function computeResumenInsights(
  ingresos: number,
  gastos: number,
  neto: number,
  topCategory: CategorySpendRow | null,
): string[] {
  const out: string[] = [];
  if (ingresos > 0) {
    const ratio = (gastos / ingresos) * 100;
    if (ratio >= 85) {
      out.push(`Gastaste el ${ratio.toFixed(0)}% de tus ingresos este período: conviene revisar prioridades.`);
    } else if (ratio >= 60) {
      out.push(`Usás alrededor del ${ratio.toFixed(0)}% de tus ingresos en gastos: hay margen, pero vigilá picos.`);
    } else {
      out.push(`Tus gastos representan el ${ratio.toFixed(0)}% de tus ingresos: buen equilibrio relativo.`);
    }
  } else {
    out.push('No registraste ingresos en este período: sumá entradas para ver el panorama completo.');
  }
  if (topCategory && gastos > 0) {
    const p = (topCategory.total / gastos) * 100;
    if (p >= 35) {
      out.push(
        `${topCategory.emoji} ${topCategory.nombre} concentra el ${p.toFixed(0)}% del gasto (${topCategory.count} movimientos).`,
      );
    } else {
      out.push(
        `Categoría líder: ${topCategory.emoji} ${topCategory.nombre} (${p.toFixed(0)}% del total, ${topCategory.count} gastos).`,
      );
    }
  } else {
    out.push('Sin gastos registrados en el período: los insights mejoran con más datos.');
  }
  if (neto >= 0) {
    out.push('Flujo neto positivo o equilibrado: ideal para reforzar ahorro o inversiones.');
  } else {
    out.push('Flujo neto negativo: revisá gastos variables o ingresos puntuales del período.');
  }
  return out.slice(0, 3);
}

function categoryBarPalette(T: AppTheme): string[] {
  return [T.success, T.secondary, T.primary, T.warning, T.gold, T.tertiary, T.error];
}

export function categoryBarColor(index: number, T: AppTheme): string {
  const palette = categoryBarPalette(T);
  return palette[index % palette.length]!;
}
