/* eslint-disable camelcase */

/**
 * refresh_tokens — supports rotation, revocation, and reuse detection.
 *
 * Only the SHA-256 hash of the token is stored, so a database leak does not
 * hand an attacker usable sessions (same reasoning as password_hash).
 *
 * `replaced_by` chains each token to its successor. That chain is what makes
 * reuse detection possible: if a token that has already been rotated is
 * presented again, it means someone replayed a stolen token, and the service
 * layer revokes the entire chain rather than just that one row.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE refresh_tokens (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      token_hash  TEXT        NOT NULL UNIQUE,
      expires_at  TIMESTAMPTZ NOT NULL,
      revoked_at  TIMESTAMPTZ,
      replaced_by UUID        REFERENCES refresh_tokens (id) ON DELETE SET NULL,
      user_agent  TEXT,
      ip_address  INET,
      created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    -- Lookup path for "is this presented token live?"
    CREATE INDEX refresh_tokens_user_id_idx ON refresh_tokens (user_id);
    CREATE INDEX refresh_tokens_active_idx
      ON refresh_tokens (user_id, expires_at)
      WHERE revoked_at IS NULL;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS refresh_tokens;`);
};
