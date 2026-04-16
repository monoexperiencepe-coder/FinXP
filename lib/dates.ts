export function toDateKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function currentYearMonth(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/** `yearMonth` formato YYYY-MM, `delta` meses (negativo = pasado). */
export function addMonthsToYearMonth(yearMonth: string, delta: number): string {
  const [y, m] = yearMonth.split('-').map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  const ny = d.getFullYear();
  const nm = String(d.getMonth() + 1).padStart(2, '0');
  return `${ny}-${nm}`;
}

/** Últimos `count` meses terminando en `yearMonth` (inclusive), más antiguo primero. */
export function lastNYearMonths(yearMonth: string, count: number): string[] {
  const out: string[] = [];
  for (let i = count - 1; i >= 0; i--) {
    out.push(addMonthsToYearMonth(yearMonth, -i));
  }
  return out;
}

/** Meses del año natural desde enero hasta `yearMonth` (mismo año), inclusive. */
export function monthsOfYearUpTo(yearMonth: string): string[] {
  const [y, m] = yearMonth.split('-').map(Number);
  const out: string[] = [];
  for (let mi = 1; mi <= m; mi++) {
    out.push(`${y}-${String(mi).padStart(2, '0')}`);
  }
  return out;
}

/** ISO week key tipo 2026-W15 */
export function currentWeekKey(d = new Date()): string {
  const target = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  const weekNo = Math.ceil(((target.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${target.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}

export function addDaysToDateKey(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + days);
  return toDateKey(dt);
}
