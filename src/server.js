import pg from 'pg';
function buildPoolConfig() {
  const cfg = { connectionString: process.env.DATABASE_URL };
  // Neon/administrado exige SSL. PGSSL=disable solo para local sin TLS.
  if (process.env.PGSSL !== 'disable' && (process.env.NODE_ENV === 'production' || /sslmode=require|neon\.tech|supabase/.test(process.env.DATABASE_URL || '')))
    cfg.ssl = { rejectUnauthorized: false };
  return cfg;
}
import { buildApp } from './app.js';
import { makeDb } from './db.js';
const pool = new pg.Pool(buildPoolConfig());
const db = makeDb(pool);
const app = buildApp({ db, secret: process.env.JWT_SECRET || 'dev-secret-change-me' });
const port = Number(process.env.PORT || 3001);
app.listen({ port, host: '0.0.0.0' }).then(() => console.log('JMC backend en :' + port))
  .catch(e => { console.error(e); process.exit(1); });
