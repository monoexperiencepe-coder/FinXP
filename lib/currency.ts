import type { MonedaCode } from '@/types';

/** `tipoDeCambio` = PEN por 1 USD (p. ej. 3.75). */
export function convertAmount(
  amount: number,
  from: MonedaCode,
  to: MonedaCode,
  tipoDeCambioPENperUSD: number,
): number {
  if (from === to) return amount;
  if (from === 'PEN' && to === 'USD') return amount / tipoDeCambioPENperUSD;
  if (from === 'USD' && to === 'PEN') return amount * tipoDeCambioPENperUSD;
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
