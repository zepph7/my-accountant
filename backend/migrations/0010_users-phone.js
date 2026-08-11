/* eslint-disable camelcase */

/**
 * Adds `phone` to users — a second login identifier, and the hook for the
 * phone-based features to come (M-Pesa reconciliation, SMS notifications).
 *
 * This is an ALTER, not a drop-and-recreate. Eight tables carry a FK to users,
 * so dropping it would need CASCADE — which strips those constraints and leaves
 * every financial table orphaned — and rolling 0002 back would take 0003–0009
 * with it, destroying the whole schema. The end state is identical either way,
 * so the additive path is the only one worth taking.
 *
 * Three decisions worth stating:
 *
 * 1. **Stored in E.164 only** (`+254712345678`). One canonical form is what
 *    makes the UNIQUE constraint mean anything — "0712345678" and
 *    "+254 712 345 678" are the same person, and without normalisation the
 *    database would happily hold both as separate accounts. Normalisation
 *    happens in the validator; the CHECK here is the backstop that guarantees
 *    nothing else can write a different shape.
 *
 * 2. **Nullable and UNIQUE.** Postgres treats NULLs as distinct, so any number
 *    of users may have no phone while no two can share one. Existing rows and
 *    Google-only accounts keep working untouched.
 *
 * 3. **`users_require_a_credential` is deliberately NOT changed.** A phone
 *    number is an IDENTIFIER, not a credential — it proves nothing on its own.
 *    Until OTP exists, signing in by phone still requires the password, so
 *    letting a phone alone satisfy that CHECK would create accounts that cannot
 *    be authenticated at all.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE users ADD COLUMN phone TEXT;

    ALTER TABLE users ADD CONSTRAINT users_phone_unique UNIQUE (phone);

    -- E.164: a leading +, a non-zero country code, then up to 14 more digits.
    ALTER TABLE users ADD CONSTRAINT users_phone_is_e164
      CHECK (phone IS NULL OR phone ~ '^\\+[1-9]\\d{1,14}$');

    COMMENT ON COLUMN users.phone IS
      'E.164 phone number (+254712345678). Alternative login identifier and the
       key for phone-based features. Never a credential on its own.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_is_e164;
    ALTER TABLE users DROP CONSTRAINT IF EXISTS users_phone_unique;
    ALTER TABLE users DROP COLUMN IF EXISTS phone;
  `);
};
