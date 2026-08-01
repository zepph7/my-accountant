/* eslint-disable camelcase */

/**
 * Foundation migration: extensions, shared enums, and the trigger functions
 * reused by every later table.
 *
 * `citext` gives us case-insensitive email uniqueness at the DB level, so
 * "A@b.com" and "a@b.com" cannot both register. `pgcrypto` provides
 * gen_random_uuid() on older Postgres; on PG13+ it is built in but the
 * extension is harmless and keeps this portable off Supabase.
 */

exports.shorthands = undefined;

exports.up = (pgm) => {
  pgm.sql(`
    CREATE EXTENSION IF NOT EXISTS citext;
    CREATE EXTENSION IF NOT EXISTS pgcrypto;
  `);

  pgm.sql(`
    CREATE TYPE auth_provider AS ENUM ('local', 'google');
    CREATE TYPE user_role     AS ENUM ('user', 'admin');
    CREATE TYPE audit_action  AS ENUM ('INSERT', 'UPDATE', 'DELETE');
  `);

  // Keeps updated_at honest without trusting the application layer.
  pgm.sql(`
    CREATE OR REPLACE FUNCTION set_updated_at()
    RETURNS TRIGGER AS $$
    BEGIN
      NEW.updated_at = now();
      RETURN NEW;
    END;
    $$ LANGUAGE plpgsql;
  `);

  /**
   * Generic row-level audit trigger. Writes a full jsonb snapshot of the row
   * before and after the change into <table>_audit.
   *
   * changed_by is read from the `app.current_user_id` GUC, which the
   * repository layer sets with `SET LOCAL app.current_user_id = $1` inside the
   * same transaction. The `true` second argument makes current_setting return
   * NULL instead of raising when the GUC is unset (e.g. during migrations or
   * manual psql edits), so an unattributed change is still recorded.
   */
  pgm.sql(`
    CREATE OR REPLACE FUNCTION audit_row()
    RETURNS TRIGGER AS $$
    DECLARE
      audit_table TEXT := TG_TABLE_NAME || '_audit';
      actor       UUID := NULLIF(current_setting('app.current_user_id', true), '')::uuid;
    BEGIN
      IF (TG_OP = 'DELETE') THEN
        EXECUTE format(
          'INSERT INTO %I (action, row_id, user_id, changed_by, old_data, new_data)
           VALUES ($1, $2, $3, $4, $5, NULL)', audit_table)
        USING TG_OP::audit_action, OLD.id, OLD.user_id, actor, to_jsonb(OLD);
        RETURN OLD;
      ELSIF (TG_OP = 'UPDATE') THEN
        EXECUTE format(
          'INSERT INTO %I (action, row_id, user_id, changed_by, old_data, new_data)
           VALUES ($1, $2, $3, $4, $5, $6)', audit_table)
        USING TG_OP::audit_action, NEW.id, NEW.user_id, actor, to_jsonb(OLD), to_jsonb(NEW);
        RETURN NEW;
      ELSE
        EXECUTE format(
          'INSERT INTO %I (action, row_id, user_id, changed_by, old_data, new_data)
           VALUES ($1, $2, $3, $4, NULL, $5)', audit_table)
        USING TG_OP::audit_action, NEW.id, NEW.user_id, actor, to_jsonb(NEW);
        RETURN NEW;
      END IF;
    END;
    $$ LANGUAGE plpgsql;
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP FUNCTION IF EXISTS audit_row();
    DROP FUNCTION IF EXISTS set_updated_at();
    DROP TYPE IF EXISTS audit_action;
    DROP TYPE IF EXISTS user_role;
    DROP TYPE IF EXISTS auth_provider;
  `);
};
