import { z } from 'zod';

export const uuidParam = (key = 'id') =>
  z.object({ [key]: z.uuid('Not a valid identifier') }).strict();

/**
 * Shared list-query contract: ?page=&limit=&sort=&order=
 *
 * `limit` is capped at 100. Without a ceiling a client can request a million
 * rows and turn one request into an outage — pagination that the caller can
 * opt out of is not pagination.
 *
 * `sort` is deliberately NOT a free string. It is validated against an
 * explicit allowlist per resource, because the value is interpolated into an
 * ORDER BY clause where parameterisation is impossible. An unvalidated sort
 * column is a SQL injection hole.
 */
export const paginationSchema = (sortable: readonly [string, ...string[]], defaultSort: string) =>
  z
    .object({
      page: z.coerce.number().int().min(1).default(1),
      limit: z.coerce.number().int().min(1).max(100).default(20),
      sort: z.enum(sortable).default(defaultSort as (typeof sortable)[number]),
      order: z.enum(['asc', 'desc']).default('desc'),
    })
    .strict();

/** ISO date (YYYY-MM-DD) or full timestamp, used by the from/to range filters. */
export const dateFilter = z.iso.date().or(z.iso.datetime({ offset: true }));

export const money = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Amount must be a positive number with at most 2 decimals')
  .refine((v) => Number(v) > 0, 'Amount must be greater than zero')
  .refine((v) => Number(v) < 10_000_000_000, 'Amount exceeds the maximum supported value');

/**
 * A balance, which unlike a transaction amount may legitimately be zero — an
 * empty wallet is a fact worth recording. The DB CHECK forbids negatives.
 */
export const balance = z
  .string()
  .regex(/^\d+(\.\d{1,2})?$/, 'Balance must be a non-negative number with at most 2 decimals')
  .refine((v) => Number(v) < 10_000_000_000, 'Balance exceeds the maximum supported value');

/**
 * A distribution percentage, kept as a STRING for the same reason money is:
 * NUMERIC(5,2) round-trips exactly, a JS float does not. 100.00 is the ceiling
 * and the database enforces it too.
 */
export const percentage = z
  .union([z.number(), z.string()])
  .transform((v) => String(v))
  .refine((v) => /^\d{1,3}(\.\d{1,2})?$/.test(v), 'Percentage must have at most 2 decimals')
  .refine((v) => Number(v) >= 0 && Number(v) <= 100, 'Percentage must be between 0 and 100');

/**
 * A phone number, normalised to E.164 before validation.
 *
 * Spaces, dashes, dots and parentheses are stripped because people type them
 * and none of them carry meaning. What is deliberately NOT done is guessing a
 * country code for a local-format number like "0712345678" — that requires
 * knowing where the user is, and a wrong guess silently registers someone
 * else's number as theirs. Better to reject it and say what is wanted.
 */
export const phone = z
  // The custom message covers the missing-value case too. Where phone is
  // optional, `.optional()` short-circuits before this schema runs, so the
  // "required" wording never leaks into those endpoints.
  .string({ error: 'A phone number is required, in international format e.g. +254712345678' })
  .trim()
  .transform((v) => v.replaceAll(/[\s\-().]/g, ''))
  .refine(
    (v) => /^\+[1-9]\d{1,14}$/.test(v),
    'Phone must be in international format, e.g. +254712345678'
  );

export const walletEnum = z.enum(['cash', 'account', 'mpesa']);

/**
 * IANA timezone names, checked against the runtime's own tz database.
 *
 * This is not cosmetic validation. The reporting queries bucket expenses with
 * `occurred_at AT TIME ZONE <user timezone>`, and PostgreSQL raises 22023 on an
 * unrecognised zone — so a user who registered with "EAT" or "GMT+3" would get
 * a 500 from every report they ever ran. Rejecting it at the door is the only
 * place the mistake is still cheap to fix.
 */
const IANA_ZONES = new Set(Intl.supportedValuesOf('timeZone'));

export const isKnownTimezone = (value: string): boolean =>
  IANA_ZONES.has(value) || value === 'UTC';

export const timezone = z
  .string()
  .max(64)
  .refine(isKnownTimezone, 'Must be an IANA timezone name, e.g. "Africa/Nairobi"');
