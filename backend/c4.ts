import { pool } from './src/config/db';
const main = async () => {
  const d = await pool.query("DELETE FROM users WHERE email LIKE '%prof-%@test.local' OR email LIKE 'other-%@test.local'");
  const l = await pool.query('SELECT email, phone FROM users ORDER BY created_at');
  console.log(`REMOVED ${d.rowCount} | REMAINING ${JSON.stringify(l.rows)}`);
  await pool.end();
};
void main();
