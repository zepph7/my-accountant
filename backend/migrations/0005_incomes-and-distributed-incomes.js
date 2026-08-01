/* eslint-disable camelcase */

/**
 * incomes and their derived distributed_incomes rows.
 *
 * `incomes.date` stays a DATE: the spec asks for monthly and yearly income
 * reporting, and a calendar date is the honest granularity for "I was paid on
 * the 25th". Only expenses need sub-day resolution (see 0006).
 *
 * distributed_incomes.percentage_applied is an addition worth calling out.
 * distribution_categories.percentage is mutable — a user who moves Savings from
 * 20% to 30% next year must not retroactively rewrite what last year's payslip
 * was split into. Snapshotting the percentage at distribution time makes the
 * "target vs actual" report in GET /api/reports/distribution truthful, and
 * makes every historical split reproducible from its own row.
 *
 * source_id and distribution_category_id use ON DELETE RESTRICT rather than
 * CASCADE: because those parents are soft-deleted, a hard delete reaching this
 * far means something has gone wrong, and losing financial history silently is
 * the worst possible outcome. RESTRICT turns it into a loud error.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE incomes (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      source_id  UUID           REFERENCES income_sources (id) ON DELETE RESTRICT,
      date       DATE           NOT NULL,
      amount     NUMERIC(12, 2) NOT NULL,
      notes      TEXT,
      created_at TIMESTAMPTZ    NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ    NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ,

      CONSTRAINT incomes_amount_positive CHECK (amount > 0)
    );

    -- Primary list/report access path: "this user's incomes, newest first".
    CREATE INDEX incomes_user_date_idx
      ON incomes (user_id, date DESC) WHERE deleted_at IS NULL;

    CREATE INDEX incomes_user_source_idx
      ON incomes (user_id, source_id) WHERE deleted_at IS NULL;

    CREATE TRIGGER incomes_set_updated_at
      BEFORE UPDATE ON incomes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE distributed_incomes (
      id                       UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id                  UUID           NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      income_id                UUID           NOT NULL REFERENCES incomes (id) ON DELETE CASCADE,
      distribution_category_id UUID           NOT NULL REFERENCES distribution_categories (id) ON DELETE RESTRICT,
      amount                   NUMERIC(12, 2) NOT NULL,
      percentage_applied       NUMERIC(5, 2)  NOT NULL,
      created_at               TIMESTAMPTZ    NOT NULL DEFAULT now(),
      updated_at               TIMESTAMPTZ    NOT NULL DEFAULT now(),
      deleted_at               TIMESTAMPTZ,

      CONSTRAINT distributed_incomes_amount_non_negative CHECK (amount >= 0),
      CONSTRAINT distributed_incomes_percentage_range
        CHECK (percentage_applied >= 0 AND percentage_applied <= 100)
    );

    -- One live split per (income, category). Partial, because re-distributing
    -- after an edit soft-deletes the old rows and inserts fresh ones.
    CREATE UNIQUE INDEX distributed_incomes_income_category_live_idx
      ON distributed_incomes (income_id, distribution_category_id)
      WHERE deleted_at IS NULL;

    CREATE INDEX distributed_incomes_income_idx
      ON distributed_incomes (income_id) WHERE deleted_at IS NULL;

    CREATE INDEX distributed_incomes_user_category_idx
      ON distributed_incomes (user_id, distribution_category_id)
      WHERE deleted_at IS NULL;

    CREATE TRIGGER distributed_incomes_set_updated_at
      BEFORE UPDATE ON distributed_incomes
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS distributed_incomes;
    DROP TABLE IF EXISTS incomes;
  `);
};
