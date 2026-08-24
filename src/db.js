// Abstracción de BD. En producción recibe un pg.Pool; en tests un pool de pg-mem.
import crypto from 'node:crypto';
export function uuid() { return crypto.randomUUID(); }
export function makeDb(pool) {
  return {
    pool,
    async query(text, params) { return pool.query(text, params); },
    async one(text, params) { const r = await pool.query(text, params); return r.rows[0] || null; },
    async many(text, params) { const r = await pool.query(text, params); return r.rows; },
    async tx(fn) {
      const client = await pool.connect();
      try { await client.query('BEGIN'); const out = await fn(client); await client.query('COMMIT'); return out; }
      catch (e) { try { await client.query('ROLLBACK'); } catch {} throw e; }
      finally { client.release && client.release(); }
    }
  };
}
