/* eslint-disable camelcase */

/**
 * expenses.
 *
 * DEVIATION FROM SPEC, flagged for approval: the core spec lists `date`, but
 * the addendum asks for daily AND hourly expense reports. A DATE column cannot
 * answer "what do I spend at 9pm?", and that data is unrecoverable once
 * written — so the column is `occurred_at TIMESTAMPTZ`.
 *
 * Reports bucket it through the owner's timezone:
 *   date_trunc('hour', e.occurred_at AT TIME ZONE u.timezone)
 * which is why users.timezone exists (see 0002).
 *
 * The index is on (user_id, occurred_at DESC) and serves the list endpoint,
 * the from/to range filters, and every cashflow rollup.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE expenses (
      id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id     UUID           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      category_id UUID           REFERENCES expense_categories (id) ON DELETE RESTRICT,
      occurred_at TIMESTAMPTZ    NOT NULL DEFAULT now(),
      amount      NUMERIC(12, 2) NOT NULL,
      description TEXT,
      payee       TEXT,
      created_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
      updated_at  TIMESTAMPTZ    NOT NULL DEFAULT now(),
      deleted_at  TIMESTAMPTZ,

      CONSTRAINT expenses_amount_positive CHECK (amount > 0)
    );

    CREATE INDEX expenses_user_occurred_idx
      ON expenses (user_id, occurred_at DESC) WHERE deleted_at IS NULL;

    CREATE INDEX expenses_user_category_idx
      ON expenses (user_id, category_id) WHERE deleted_at IS NULL;

    CREATE TRIGGER expenses_set_updated_at
      BEFORE UPDATE ON expenses
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`DROP TABLE IF EXISTS expenses;`);
};
