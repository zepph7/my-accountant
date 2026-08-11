import { z } from 'zod';
import { phone, timezone } from './common.validator';

/**
 * `.strict()` everywhere: unknown fields are rejected outright rather than
 * silently dropped. The spec asks for it, and it turns a client sending
 * `role: "admin"` into a loud 400 instead of a quiet no-op that looks like it
 * worked.
 */
const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  // bcrypt truncates input beyond 72 BYTES. Capping here means a long
  // passphrase can never be silently shortened into a weaker secret.
  .max(72, 'Password must be at most 72 characters')
  .refine((v) => /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v), {
    message: 'Password must contain lower case, upper case, and a digit',
  });

/**
 * Registration requires BOTH an email and a phone number.
 *
 * This is about account identity, not form-filling. Google sign-in matches an
 * existing account by email, so an account created without one could never be
 * linked — the same person would end up with a second account owning none of
 * their financial history, and nothing to merge them on. Requiring an email up
 * front keeps that path open; requiring a phone means every account is ready
 * for the phone-based features without a later backfill.
 *
 * Both are still nullable in the database, deliberately: Google returns an
 * email and never a phone, so a NOT NULL on phone would make OAuth sign-in
 * impossible. The requirement belongs to this endpoint, not to the table.
 */
export const registerSchema = z
  .object({
    email: z.email('A valid email is required').max(255),
    phone,
    password,
    firstName: z.string().trim().min(1, 'First name is required').max(100),
    lastName: z.string().trim().min(1, 'Last name is required').max(100),
    // IANA zone; used to bucket the daily/hourly expense reports.
    timezone: timezone.optional(),
  })
  .strict();

/**
 * Sign in with EITHER an email or a phone number, plus the password.
 *
 * Exactly one identifier is required. Accepting both would leave the server
 * deciding which one wins when they point at different accounts, and "whichever
 * the code happens to check first" is not an authentication rule anyone should
 * have to reason about.
 */
export const loginSchema = z
  .object({
    email: z.email('A valid email is required').optional(),
    phone: phone.optional(),
    password: z.string().min(1, 'Password is required'),
  })
  .strict()
  .refine((v) => Boolean(v.email) !== Boolean(v.phone), {
    message: 'Provide either an email or a phone number, but not both',
    path: ['email'],
  });

/**
 * Profile update. Every field optional, at least one required.
 *
 * `email` is not updatable here on purpose: it is what Google sign-in matches
 * on and a login identifier by itself, so changing it needs proof the new
 * address belongs to the user. That is a verification flow, not a PATCH.
 */
export const updateProfileSchema = z
  .object({
    phone: phone.optional(),
    firstName: z.string().trim().min(1).max(100).optional(),
    lastName: z.string().trim().min(1).max(100).optional(),
    timezone: timezone.optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
