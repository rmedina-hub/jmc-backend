// Seed idempotente de RBAC + admin inicial. Lee credenciales de ENV (nunca hardcode).
import pg from 'pg';
import { makeDb } from './db.js';
import { seedRbacAndAdmin } from './app.js';
function poolCfg(){ const c={connectionString:process.env.DATABASE_URL}; if(process.env.PGSSL!=='disable' && (process.env.NODE_ENV==='production'||/sslmode=require|neon\.tech|supabase/.test(process.env.DATABASE_URL||''))) c.ssl={rejectUnauthorized:false}; return c; }
const pool = new pg.Pool(poolCfg());
const db = makeDb(pool);
const email = process.env.ADMIN_EMAIL || 'admin@jmc.cl';
const pass = process.env.ADMIN_PASSWORD;
(async () => {
  const exists = await db.one('SELECT 1 FROM usuarios WHERE email=$1', [email]);
  if (exists) { console.log('seed: admin ya existe, no se re-siembra (idempotente).'); return pool.end(); }
  if (!pass) { console.error('ERROR: define ADMIN_PASSWORD en el entorno para el primer seed.'); process.exit(2); }
  const r = await seedRbacAndAdmin(db, { adminEmail: email, adminPass: pass });
  console.log('seed OK: empresas JMC/Trabancura, roles, permisos y admin creados.');
  return pool.end();
})().catch(e => { console.error(e.message); process.exit(1); });
