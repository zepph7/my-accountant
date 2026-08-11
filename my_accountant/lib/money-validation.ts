/**
 * Client-side mirrors of the API's money rules.
 *
 * The regexes are the same ones in `backend/src/validators/common.validator.ts`.
 * They exist to answer on the device instead of after a round trip; the API
 * remains the authority and its rejection is still shown.
 */

const AMOUNT = /^\d+(\.\d{1,2})?$/;
const CEILING = 10_000_000_000;

/**
 * Strips what people type but the API will not take: grouping commas, spaces,
 * and a currency symbol pasted in from somewhere else.
 */
export const normalizeAmount = (value: string): string =>
  value.replace(/[\s,]/g, '').replace(/^[^\d.]+/, '');

/** A transaction amount, which must be greater than zero. */
export const validateAmount = (value: string): string | undefined => {
  const amount = normalizeAmount(value);
  if (!amount) return 'Enter an amount.';
  if (!AMOUNT.test(amount)) return 'Use digits and at most two decimals, like 1500 or 1500.50.';
  if (Number(amount) <= 0) return 'The amount must be more than zero.';
  if (Number(amount) >= CEILING) return 'That amount is too large.';
  return undefined;
};

/** A wallet balance, which unlike a transaction may legitimately be zero. */
export const validateBalance = (value: string): string | undefined => {
  const amount = normalizeAmount(value);
  if (!amount) return 'Enter a balance, or 0 if it is empty.';
  if (!AMOUNT.test(amount)) return 'Use digits and at most two decimals.';
  if (Number(amount) >= CEILING) return 'That balance is too large.';
  return undefined;
};

/** A distribution percentage: 0–100, at most two decimals. */
export const validatePercentage = (value: string): string | undefined => {
  const percent = value.trim();
  if (!percent) return 'Enter a percentage.';
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(percent)) return 'Use a number with at most two decimals.';
  if (Number(percent) < 0 || Number(percent) > 100) return 'Use a value between 0 and 100.';
  return undefined;
};

export const validateLabel = (value: string, noun: string): string | undefined => {
  if (!value.trim()) return `Enter a ${noun}.`;
  if (value.trim().length > 255) return `That ${noun} is too long.`;
  return undefined;
};
