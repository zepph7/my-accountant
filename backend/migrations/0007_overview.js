/* eslint-disable camelcase */

/**
 * overview — append-only balance snapshots.
 *
 * The spec calls for balances "kept as history", so this table is never
 * UPDATEd: recording a new balance inserts a new row, and "current balances"
 * means the newest row per user. That is why there is no updated_at and no
 * updated_at trigger here, unlike every other table.
 *
 * The DESC index makes the "latest snapshot for this user" lookup — which
 * GET /api/dashboard performs on every load — a single index hit.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE overview (
      id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id         UUID           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      cash_wallet     NUMERIC(12, 2) NOT NULL DEFAULT 0,
      account_balance NUMERIC(12, 2) NOT NULL DEFAULT 0,
      mpesa_balance   NUMERIC(12, 2) NOT NULL DEFAULT 0,
      created_at      TIMESTAMPTZ    NOT NULL DEFAULT now(),

      CONSTRAINT overview_balances_non_negative
        CHECK (cash_wallet >= 0 AND account_balance >= 0 AND mpesa_balance >= 0)
    );

    CREATE INDEX overview_user_created_idx ON overview (user_id, created_at DESC);
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS overview;`);
};
