/* eslint-disable camelcase */

/**
 * Audit trail for incomes and expenses.
 *
 * Per the spec: soft-delete is the primary recovery mechanism on all financial
 * tables, and these two tables additionally carry trigger-backed audit logs.
 * The reasoning for using BOTH rather than picking one:
 *
 *   - deleted_at answers "restore this row" cheaply and is queryable by the
 *     application, but it records only the FINAL state. An edit that changes an
 *     amount from 50,000 to 5,000 leaves no trace of the original.
 *   - The audit tables capture every INSERT/UPDATE/DELETE with full before and
 *     after jsonb snapshots, at the database level, so they cannot be bypassed
 *     by a buggy service, a migration script, or a manual psql session.
 *
 * Money is the one thing in this system that must be reconstructable, so
 * incomes and expenses get both. Category and source tables get soft-delete
 * only — losing the edit history of the string "Groceries" is not a financial
 * integrity problem.
 *
 * changed_by is nullable: a change made outside a request (a migration, an
 * admin psql session) has no authenticated actor, and recording it as NULL is
 * more honest than attributing it to someone.
 */

exports.shorthands = undefined;

const auditTable = (name) => `
  CREATE TABLE ${name}_audit (
    id         BIGSERIAL PRIMARY KEY,
    action     audit_action NOT NULL,
    row_id     UUID         NOT NULL,
    user_id    UUID,
    changed_by UUID,
    changed_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    old_data   JSONB,
    new_data   JSONB
  );

  CREATE INDEX ${name}_audit_row_idx  ON ${name}_audit (row_id, changed_at DESC);
  CREATE INDEX ${name}_audit_user_idx ON ${name}_audit (user_id, changed_at DESC);

  CREATE TRIGGER ${name}_audit_trigger
    AFTER INSERT OR UPDATE OR DELETE ON ${name}
    FOR EACH ROW EXECUTE FUNCTION audit_row();
`;

exports.up = (pgm) => {
  pgm.sql(auditTable('incomes'));
  pgm.sql(auditTable('expenses'));
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE IF EXISTS expenses_audit;
    DROP TABLE IF EXISTS incomes_audit;
  `);
};
