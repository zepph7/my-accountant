/**
 * Display formatting.
 *
 * Everything here takes the API's decimal strings and never converts them to a
 * number for arithmetic — only for rendering, and only at the last step.
 */

/** The reporting currency. Change here and the whole app follows. */
export const CURRENCY = process.env.EXPO_PUBLIC_CURRENCY ?? 'KES';

const groups = (whole: string) => whole.replace(/\B(?=(\d{3})+(?!\d))/g, ',');

/**
 * `1234.5` → `1,234.50`. Cents are always shown: a money column where some rows
 * have decimals and some do not is harder to scan than one where they all do.
 */
export const money = (value: string | number | null | undefined): string => {
  const raw = String(value ?? '0');
  const negative = raw.startsWith('-');
  const [whole = '0', fraction = ''] = raw.replace('-', '').split('.');
  const cents = `${fraction}00`.slice(0, 2);
  return `${negative ? '-' : ''}${groups(whole)}.${cents}`;
};

/** `1,234.50 KES`, for totals that need naming. */
export const currency = (value: string | number | null | undefined): string =>
  `${money(value)} ${CURRENCY}`;

/**
 * Compact form for tiles where the full figure would wrap: `1.2M`, `48.3K`.
 * Only used where the exact number is available elsewhere on the same screen.
 */
export const compactMoney = (value: string | number | null | undefined): string => {
  const n = Math.abs(Number(value ?? 0));
  const sign = Number(value ?? 0) < 0 ? '-' : '';
  if (n >= 1_000_000_000) return `${sign}${(n / 1_000_000_000).toFixed(1)}B`;
  if (n >= 1_000_000) return `${sign}${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 10_000) return `${sign}${(n / 1000).toFixed(1)}K`;
  return money(value);
};

const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/**
 * Parses the API's date values without letting the runtime guess a timezone.
 *
 * A bare `YYYY-MM-DD` is parsed as UTC midnight by `new Date`, which renders as
 * the previous day for anyone west of Greenwich — an income dated the 1st
 * showing as the 30th. Splitting the string avoids the guess entirely.
 */
const parts = (value: string) => {
  const [datePart] = value.split('T');
  const [y, m, d] = (datePart ?? '').split('-').map(Number);
  return { y: y ?? 0, m: m ?? 1, d: d ?? 1 };
};

/** `2026-08-09` → `9 Aug 2026`. */
export const longDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const { y, m, d } = parts(value);
  return `${d} ${MONTHS[m - 1] ?? ''} ${y}`;
};

/** `2026-08-09` → `9 Aug`, for lists where the year is implied. */
export const shortDate = (value: string | null | undefined): string => {
  if (!value) return '—';
  const { y, m, d } = parts(value);
  const thisYear = new Date().getFullYear();
  return y === thisYear ? `${d} ${MONTHS[m - 1] ?? ''}` : `${d} ${MONTHS[m - 1] ?? ''} ${y}`;
};

/** `2026-08-09T14:05:00Z` → `9 Aug, 14:05` in the device's zone. */
export const dateTime = (value: string | null | undefined): string => {
  if (!value) return '—';
  const at = new Date(value);
  if (Number.isNaN(at.getTime())) return longDate(value);
  const time = `${String(at.getHours()).padStart(2, '0')}:${String(at.getMinutes()).padStart(2, '0')}`;
  return `${at.getDate()} ${MONTHS[at.getMonth()]}, ${time}`;
};

/** Today as `YYYY-MM-DD` in the device's zone, for date inputs. */
export const today = (): string => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
    now.getDate()
  ).padStart(2, '0')}`;
};

/**
 * Turns a report bucket label into something readable.
 *
 * The API emits Postgres `to_char` output, which differs per granularity:
 * `2026-08-09 14:00`, `2026-08-09`, `2026-W32`, `2026-08`, `2026`.
 */
export const bucketLabel = (bucket: string): string => {
  if (/^\d{4}$/.test(bucket)) return bucket;
  if (/^\d{4}-W\d{2}$/.test(bucket)) return `Week ${bucket.slice(6)}`;
  if (/^\d{4}-\d{2}$/.test(bucket)) {
    const [y, m] = bucket.split('-').map(Number);
    return `${MONTHS[(m ?? 1) - 1] ?? ''} ${y}`;
  }
  if (/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}$/.test(bucket)) {
    const [date, time] = bucket.split(' ');
    const { d, m } = parts(date ?? '');
    return `${d} ${MONTHS[m - 1] ?? ''} ${time}`;
  }
  return shortDate(bucket);
};

/** `12.5` → `12.5%`, trimming a trailing `.0`. */
export const percent = (value: string | number | null | undefined): string => {
  const n = Number(value ?? 0);
  return `${Number.isInteger(n) ? n : n.toFixed(1)}%`;
};

export const initials = (firstName: string, lastName: string): string =>
  `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase() || '?';
