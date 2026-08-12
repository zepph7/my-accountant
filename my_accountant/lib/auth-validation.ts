/**
 * Client-side mirrors of the rules the API already enforces.
 *
 * These exist to answer the user on the device instead of after a round trip,
 * not to replace the server's checks — the API stays the authority, and a
 * rejection from it is still shown. Every rule here is deliberately the same
 * rule as `backend/src/validators/auth.validator.ts`; if one moves, both move,
 * otherwise the app starts refusing input the server would have accepted.
 */

export type FieldErrors = Record<string, string>;

/**
 * Strips the separators people actually type and requires E.164.
 *
 * No country code is guessed for a local number like `0712345678`. Guessing
 * wrong would silently claim someone else's phone number, and the account it
 * belongs to is the one that receives the money reports — so the app asks for
 * the country code rather than assuming where the user lives.
 */
export const normalizePhone = (value: string): string => value.trim().replace(/[\s\-().]/g, '');

const E164 = /^\+[1-9]\d{1,14}$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export const isPhone = (value: string): boolean => E164.test(normalizePhone(value));
export const isEmail = (value: string): boolean => EMAIL.test(value.trim());

export const validateEmail = (value: string): string | undefined => {
  if (!value.trim()) return 'Enter your email address.';
  if (!isEmail(value)) return 'Enter a complete email address, like you@example.com.';
  if (value.trim().length > 255) return 'That email address is too long.';
  return undefined;
};

export const validatePhone = (value: string): string | undefined => {
  if (!value.trim()) return 'Enter your phone number.';
  if (!isPhone(value)) return 'Start with your country code, like +254 712 345 678.';
  return undefined;
};

/** Matches the server: 10–72 characters, with lower case, upper case and a digit. */
/**
 * Decides whether a sign-in identifier is an email or a phone number.
 *
 * The API takes one or the other and rejects both together, so the client has
 * to commit before it sends. The test is the leading character rather than a
 * full match: anything starting with `+` or a digit can only be an attempt at a
 * phone number, so a half-typed one gets the phone error explaining the country
 * code, not a confusing complaint about a missing `@`.
 */
export const identifierKind = (value: string): 'email' | 'phone' => {
  const trimmed = value.trim();
  return /^[+\d]/.test(trimmed) ? 'phone' : 'email';
};

/** Validates a combined identifier, reporting against whichever kind it looks like. */
export const validateIdentifier = (value: string): string | undefined => {
  if (!value.trim()) return 'Enter your email address or phone number.';
  return identifierKind(value) === 'phone' ? validatePhone(value) : validateEmail(value);
};

/** The credential shape the API expects, keyed by what the user actually typed. */
export const identifierCredential = (value: string): { email: string } | { phone: string } =>
  identifierKind(value) === 'phone'
    ? { phone: normalizePhone(value) }
    : { email: value.trim() };

export const validatePassword = (value: string): string | undefined => {
  if (!value) return 'Enter a password.';
  if (value.length < 10) return 'Use at least 10 characters.';
  // The server caps at 72 because bcrypt ignores anything past 72 bytes — a
  // longer passphrase would be silently shortened into a weaker secret.
  if (value.length > 72) return 'Use at most 72 characters.';
  if (!/[a-z]/.test(value) || !/[A-Z]/.test(value) || !/\d/.test(value)) {
    return 'Include a capital letter, a lower case letter and a number.';
  }
  return undefined;
};

export const validateName = (value: string, label: string): string | undefined => {
  if (!value.trim()) return `Enter your ${label}.`;
  if (value.trim().length > 100) return `That ${label} is too long.`;
  return undefined;
};

