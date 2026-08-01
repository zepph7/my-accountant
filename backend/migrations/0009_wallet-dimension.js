/* eslint-disable camelcase */

/**
 * Adds the wallet dimension required to DERIVE balances.
 *
 * Context: `overview` tracks three balances (cash, bank account, M-Pesa), and
 * the decision is that these are derived from transactions rather than typed in
 * by the user. That is impossible against the original schema — an income or
 * expense row records an amount but not which wallet it moved, so there is
 * nothing to sum per balance.
 *
 * So:
 *   - incomes.wallet  — where the money landed
 *   - expenses.wallet — where the money left from
 *
 * and `overview` changes meaning: it is no longer "the current balances", it is
 * the user-entered OPENING/RECONCILIATION snapshot. Current balance for a
 * wallet is then:
 *
 *   latest snapshot value
 *     + SUM(incomes.amount  WHERE wallet = w AND date       > snapshot.created_at)
 *     - SUM(expenses.amount WHERE wallet = w AND occurred_at > snapshot.created_at)
 *
 * Keeping the snapshot rather than deriving from zero matters for two reasons:
 * users start using the app with money already in hand, and real accounts drift
 * from recorded history (bank fees, cash spent without logging). A periodic
 * reconciliation snapshot re-anchors the derivation instead of letting error
 * accumulate forever.
 *
 * DEFAULT 'account' backfills existing rows. That is a guess for historical
 * data, but this table is empty in every environment today, so it costs
 * nothing and keeps the column NOT NULL.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`CREATE TYPE wallet AS ENUM ('cash', 'account', 'mpesa');`);

  pgm.sql(`
    ALTER TABLE incomes  ADD COLUMN wallet wallet NOT NULL DEFAULT 'account';
    ALTER TABLE expenses ADD COLUMN wallet wallet NOT NULL DEFAULT 'account';
  `);

  // Balance derivation always filters by (user, wallet) over a date range.
  pgm.sql(`
    CREATE INDEX incomes_user_wallet_date_idx
      ON incomes (user_id, wallet, date) WHERE deleted_at IS NULL;

    CREATE INDEX expenses_user_wallet_occurred_idx
      ON expenses (user_id, wallet, occurred_at) WHERE deleted_at IS NULL;
  `);

  pgm.sql(`
    COMMENT ON TABLE overview IS
      'User-entered opening/reconciliation balance snapshots. Current balances are derived: latest snapshot plus incomes minus expenses recorded after it, per wallet.';
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP INDEX IF EXISTS expenses_user_wallet_occurred_idx;
    DROP INDEX IF EXISTS incomes_user_wallet_date_idx;
    ALTER TABLE expenses DROP COLUMN IF EXISTS wallet;
    ALTER TABLE incomes  DROP COLUMN IF EXISTS wallet;
    DROP TYPE IF EXISTS wallet;
  `);
};
