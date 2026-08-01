import { z } from 'zod';
import { timezone } from './common.validator';

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

export const registerSchema = z
  .object({
    email: z.email('A valid email is required').max(255),
    password,
    firstName: z.string().trim().min(1, 'First name is required').max(100),
    lastName: z.string().trim().min(1, 'Last name is required').max(100),
    // IANA zone; used to bucket the daily/hourly expense reports.
    timezone: timezone.optional(),
  })
  .strict();

export const loginSchema = z
  .object({
    email: z.email('A valid email is required'),
    password: z.string().min(1, 'Password is required'),
  })
  .strict();

export const refreshSchema = z
  .object({
    refreshToken: z.string().min(1).optional(),
  })
  .strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
