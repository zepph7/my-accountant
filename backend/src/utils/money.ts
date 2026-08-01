/**
 * Money arithmetic in minor units (cents).
 *
 * Every amount crossing the DB boundary is a NUMERIC(12,2) delivered as a
 * string (see config/db.ts). Parsing those into JS numbers for arithmetic would
 * reintroduce binary-float error — 0.1 + 0.2 === 0.30000000000000004 — so all
 * computation happens on integer cents and converts back only at the edges.
 *
 * A NUMERIC(12,2) tops out at 10 digits before the decimal, i.e. 10^10 - 0.01,
 * which is 10^12 cents. Number.MAX_SAFE_INTEGER is ~9.007 * 10^15, so integer
 * cents are exact across the whole representable range.
 */

const CENTS_PATTERN = /^-?\d+(\.\d{1,2})?$/;

/** Parses a decimal money string ("1234.56") into integer cents (123456). */
export const toCents = (value: string | number): number => {
  const raw = typeof value === 'number' ? value.toFixed(2) : value.trim();

  if (!CENTS_PATTERN.test(raw)) {
    throw new Error(`Invalid money value: "${raw}"`);
  }

  const negative = raw.startsWith('-');
  const [whole, fraction = ''] = raw.replace('-', '').split('.');
  const cents = Number(whole) * 100 + Number(fraction.padEnd(2, '0'));

  return negative ? -cents : cents;
};

/** Formats integer cents back into a DB/JSON-safe decimal string. */
export const fromCents = (cents: number): string => {
  if (!Number.isInteger(cents)) {
    throw new Error(`Expected integer cents, received: ${cents}`);
  }

  const negative = cents < 0;
  const abs = Math.abs(cents);
  const formatted = `${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;

  return negative ? `-${formatted}` : formatted;
};

export const sumCents = (values: number[]): number => values.reduce((a, b) => a + b, 0);
