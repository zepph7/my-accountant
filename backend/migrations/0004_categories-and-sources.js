/* eslint-disable camelcase */

/**
 * The three user-scoped lookup tables: income_sources, distribution_categories,
 * and expense_categories.
 *
 * All three are soft-deleted. The uniqueness constraint on (user_id, name) is
 * therefore a PARTIAL unique index limited to live rows — otherwise deleting
 * "Salary" would permanently poison that name for the user, since the dead row
 * would keep occupying it.
 *
 * percentage is NUMERIC(5,2) with a 0–100 CHECK. Note the spec's deliberate
 * asymmetry: each individual percentage is constrained by the database, but the
 * per-user SUM is NOT. A user mid-edit will transiently sum to something other
 * than 100, and blocking that at the DB level would make the UI unusable. The
 * service layer surfaces a non-blocking warning instead.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE income_sources (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      name       TEXT        NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ,

      CONSTRAINT income_sources_name_not_blank CHECK (btrim(name) <> '')
    );

    CREATE UNIQUE INDEX income_sources_user_name_live_idx
      ON income_sources (user_id, lower(name)) WHERE deleted_at IS NULL;

    CREATE TRIGGER income_sources_set_updated_at
      BEFORE UPDATE ON income_sources
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE distribution_categories (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID          NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      name       TEXT          NOT NULL,
      percentage NUMERIC(5, 2) NOT NULL,
      created_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ   NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ,

      CONSTRAINT distribution_categories_name_not_blank CHECK (btrim(name) <> ''),
      CONSTRAINT distribution_categories_percentage_range
        CHECK (percentage >= 0 AND percentage <= 100)
    );

    CREATE UNIQUE INDEX distribution_categories_user_name_live_idx
      ON distribution_categories (user_id, lower(name)) WHERE deleted_at IS NULL;

    CREATE INDEX distribution_categories_user_live_idx
      ON distribution_categories (user_id) WHERE deleted_at IS NULL;

    CREATE TRIGGER distribution_categories_set_updated_at
      BEFORE UPDATE ON distribution_categories
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);

  pgm.sql(`
    CREATE TABLE expense_categories (
      id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id    UUID        NOT NULL REFERENCES users (id) ON DELETE CASCADE,
      name       TEXT        NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      deleted_at TIMESTAMPTZ,

      CONSTRAINT expense_categories_name_not_blank CHECK (btrim(name) <> '')
    );

    CREATE UNIQUE INDEX expense_categories_user_name_live_idx
      ON expense_categories (user_id, lower(name)) WHERE deleted_at IS NULL;

    CREATE TRIGGER expense_categories_set_updated_at
      BEFORE UPDATE ON expense_categories
      FOR EACH ROW EXECUTE FUNCTION set_updated_at();
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS expense_categories;
    DROP TABLE IF EXISTS distribution_categories;
    DROP TABLE IF EXISTS income_sources;
  `);
};
