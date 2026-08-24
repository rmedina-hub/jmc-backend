import pg from 'pg';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const __dirname = path.dirname(fileURLToPath(import.meta.url));
export async function runMigrations(pool) {
  await pool.query('CREATE TABLE IF NOT EXISTS schema_migrations (filename TEXT PRIMARY KEY, applied_at TIMESTAMPTZ DEFAULT now())');
  const dir = path.join(__dirname, '..', 'migrations');
  const files = fs.readdirSync(dir).filter(f => f.endsWith('.sql')).sort();
  const applied = [];
  for (const f of files) {
    const done = await pool.query('SELECT 1 FROM schema_migrations WHERE filename=$1', [f]);
    if (done.rowCount) continue;                       // ya aplicada -> idempotente
    const sql = fs.readFileSync(path.join(dir, f), 'utf8');
    await pool.query(sql);
    await pool.query('INSERT INTO schema_migrations (filename) VALUES ($1)', [f]);
    applied.push(f);
  }
  return applied;
}
if (import.meta.url === `file://${process.argv[1]}`) {
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, ssl: (process.env.PGSSL==='disable'?false:(process.env.NODE_ENV==='production'||/sslmode=require|neon\.tech|supabase/.test(process.env.DATABASE_URL||''))?{rejectUnauthorized:false}:undefined) });
  runMigrations(pool).then(f => { console.log('migraciones aplicadas:', f.length ? f.join(',') : '(ninguna nueva)'); return pool.end(); })
    .catch(e => { console.error(e); process.exit(1); });
}
