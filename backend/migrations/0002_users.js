/* eslint-disable camelcase */

/**
 * users — the tenancy root. Every financial table hangs off this by user_id.
 *
 * Two deliberate decisions, both documented in the step-1 proposal:
 *
 * 1. `auth_provider` records how the account was ORIGINALLY created, but the
 *    table permits a row to carry both password_hash and google_id. That is
 *    what makes account linking possible: a local user who later signs in with
 *    Google keeps their password and gains a google_id, rather than being
 *    forked into a second account that owns none of their financial history.
 *    The CHECK below only insists that at least one credential exists.
 *
 * 2. `timezone` exists because the spec asks for daily and hourly expense
 *    reports. Bucketing a TIMESTAMPTZ into "days" or "hours" is undefined
 *    without knowing whose local midnight to use; reports resolve it as
 *    `occurred_at AT TIME ZONE users.timezone`.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE users (
      id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      email         CITEXT      NOT NULL UNIQUE,
      first_name    TEXT        NOT NULL,
      last_name     TEXT        NOT NULL,
      password_hash TEXT,
      auth_provider auth_provider NOT NULL DEFAULT 'local',
      google_id     TEXT UNIQUE,
      avatar_url    TEXT,
      is_verified   BOOLEAN     NOT NULL DEFAULT false,
      role          user_role   NOT NULL DEFAULT 'user',
      timezone      TEXT        NOT NULL DEFAULT 'UTC',
      created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

      CONSTRAINT users_require_a_credential
        CHECK (password_hash IS NOT NULL OR google_id IS NOT NULL),

      CONSTRAINT users_email_is_sane
        CHECK (position('@' IN email) > 1)
    );

    CREATE TRIGGER users_set_updated_at
      BEFORE UPDATE ON users
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS users;`);
};
