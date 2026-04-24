import type { MonedaCode } from '@/types';

/** `tipoDeCambio` = PEN por 1 USD (p. ej. 3.75). Fallback seguro si `rate` no es positivo/finito. */
const SAFE_PEN_PER_USD = 3.75;

export function convertAmount(
  amount: number,
  from: MonedaCode,
  to: MonedaCode,
  tipoDeCambioPENperUSD: number,
): number {
  if (!Number.isFinite(amount)) return 0;
  if (from === to) return amount;
  const rate =
    Number.isFinite(tipoDeCambioPENperUSD) && tipoDeCambioPENperUSD > 0
      ? tipoDeCambioPENperUSD
      : SAFE_PEN_PER_USD;
  if (from === 'PEN' && to === 'USD') return amount / rate;
  if (from === 'USD' && to === 'PEN') return amount * rate;
  return amount;
}

const localeByCurrency: Record<MonedaCode, string> = {
  PEN: 'es-PE',
  USD: 'en-US',
};

export function formatMoney(amount: number, currency: MonedaCode = 'PEN'): string {
  const locale = localeByCurrency[currency] ?? 'es-PE';
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${currency} ${Math.round(amount * 100) / 100}`;
  }
}
