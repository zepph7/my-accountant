/**
 * Migration runner.
 *
 * node-pg-migrate's CLI takes its connection from DATABASE_URL as a bare
 * string, which gives no way to attach an `ssl` object — and Supabase presents
 * a self-signed chain, so the CLI cannot connect. Driving the programmatic
 * runner instead lets migrations reuse exactly the same TLS policy as the app
 * (pinned CA when configured, explicit opt-out otherwise).
 *
 * Usage:
 *   node scripts/migrate.js up
 *   node scripts/migrate.js down [count]
 */

const path = require('node:path');
const { readFileSync } = require('node:fs');

require('dotenv').config({ quiet: true });

const { runner } = require('node-pg-migrate');

const buildSsl = () => {
  if (process.env.DATABASE_SSL === 'false') return undefined;

  if (process.env.DATABASE_CA_CERT) {
    return { ca: readFileSync(process.env.DATABASE_CA_CERT, 'utf8'), rejectUnauthorized: true };
  }

  if (process.env.DATABASE_SSL_REJECT_UNAUTHORIZED === 'false') {
    console.warn('WARNING: running migrations without TLS certificate verification.');
    return { rejectUnauthorized: false };
  }

  return { rejectUnauthorized: true };
};

const direction = process.argv[2] === 'down' ? 'down' : 'up';
const count = process.argv[3] ? Number(process.argv[3]) : direction === 'down' ? 1 : Infinity;

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and fill it in.');
  process.exit(1);
}

runner({
  databaseUrl: { connectionString: process.env.DATABASE_URL, ssl: buildSsl() },
  dir: path.join(__dirname, '..', 'migrations'),
  direction,
  count,
  migrationsTable: 'pgmigrations',
  verbose: true,
})
  .then((applied) => {
    if (applied.length === 0) {
      console.log('No migrations to run — database is up to date.');
    } else {
      console.log(`\n${direction === 'up' ? 'Applied' : 'Reverted'} ${applied.length} migration(s):`);
      for (const m of applied) console.log(`  - ${m.name}`);
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('\nMigration failed:', err.message);
    process.exit(1);
  });
