import { uuid } from './db.js';
import { userCan } from './rbac.js';
import { audit } from './audit.js';

// cols: columnas editables. name: entidad (RBAC/auditoría). table: tabla SQL.
// La entidad se aísla por empresa_id si 'empresa_id' está en cols (multiempresa).
export function registerEntity(app, { name, table, cols }) {
  const db = () => app.db;
  const scoped = cols.includes('empresa_id');
  async function guard(req, reply, accion) {
    if (!req.user) { reply.code(401).send({ error: 'no_autenticado' }); return false; }
    const ok = await userCan(db(), req.user.sub, name, accion);
    if (!ok) { reply.code(403).send({ error: 'sin_permiso', entidad: name, accion }); return false; }
    return true;
  }
  // filtro de empresa: sólo registros de la empresa del usuario (aislamiento)
  function empWhere(req, startIdx) { return scoped ? { sql: ` AND empresa_id = $${startIdx}`, params: [req.user.empresa_id] } : { sql: '', params: [] }; }
  const base = `/api/${name}`;

  app.get(base, async (req, reply) => {
    if (!await guard(req, reply, 'read')) return;
    const w = empWhere(req, 1);
    const rows = await db().many(`SELECT * FROM ${table} WHERE deleted_at IS NULL${w.sql} ORDER BY created_at DESC`, w.params);
    return { data: rows, count: rows.length };
  });
  app.get(`${base}/:id`, async (req, reply) => {
    if (!await guard(req, reply, 'read')) return;
    const w = empWhere(req, 2);
    const row = await db().one(`SELECT * FROM ${table} WHERE id=$1 AND deleted_at IS NULL${w.sql}`, [req.params.id, ...w.params]);
    if (!row) return reply.code(404).send({ error: 'no_encontrado' });
    return row;
  });
  app.post(base, async (req, reply) => {
    if (!await guard(req, reply, 'create')) return;
    const body = { ...req.body };
    if (scoped) body.empresa_id = req.user.empresa_id; // fuerza empresa del usuario (no confía en el cliente)
    const id = body.id || uuid();
    const now = new Date().toISOString();
    const values = cols.map(c => body[c] ?? null);
    const colList = ['id', ...cols, 'version', 'created_by', 'updated_by', 'created_at', 'updated_at'];
    const params = [id, ...values, 1, req.user.sub, req.user.sub, now, now];
    const ph = colList.map((_, i) => `$${i + 1}`).join(',');
    try { await db().query(`INSERT INTO ${table} (${colList.join(',')}) VALUES (${ph})`, params); }
    catch (e) { return reply.code(400).send({ error: 'insert_fallo', detalle: String(e.message || e) }); } // p.ej. UNIQUE sku
    const row = await db().one(`SELECT * FROM ${table} WHERE id=$1`, [id]);
    await audit(db(), req.user.sub, 'create', name, id, null, row);
    return reply.code(201).send(row);
  });
  app.put(`${base}/:id`, async (req, reply) => {
    if (!await guard(req, reply, 'update')) return;
    const id = req.params.id;
    const expected = req.body.expected_version;
    const w = empWhere(req, 2);
    const before = await db().one(`SELECT * FROM ${table} WHERE id=$1 AND deleted_at IS NULL${w.sql}`, [id, ...w.params]);
    if (!before) return reply.code(404).send({ error: 'no_encontrado' });
    if (expected !== undefined && Number(expected) !== Number(before.version))
      return reply.code(409).send({ error: 'conflicto_version', server_version: before.version, your_version: expected });
    const sets = cols.map((c, i) => `${c}=$${i + 1}`);
    const params = cols.map(c => (req.body[c] !== undefined ? req.body[c] : before[c]));
    params.push(req.user.sub, before.version, id);
    const sql = `UPDATE ${table} SET ${sets.join(',')}, version=version+1, updated_by=$${cols.length + 1}, updated_at=now()
                 WHERE id=$${cols.length + 3} AND version=$${cols.length + 2} AND deleted_at IS NULL`;
    const r = await db().query(sql, params);
    if (r.rowCount === 0) { const cur = await db().one(`SELECT version FROM ${table} WHERE id=$1`, [id]); return reply.code(409).send({ error: 'conflicto_version', server_version: cur ? cur.version : null }); }
    const after = await db().one(`SELECT * FROM ${table} WHERE id=$1`, [id]);
    await audit(db(), req.user.sub, 'update', name, id, before, after);
    return after;
  });
  app.delete(`${base}/:id`, async (req, reply) => {
    if (!await guard(req, reply, 'delete')) return;
    const w = empWhere(req, 2);
    const before = await db().one(`SELECT * FROM ${table} WHERE id=$1 AND deleted_at IS NULL${w.sql}`, [req.params.id, ...w.params]);
    if (!before) return reply.code(404).send({ error: 'no_encontrado' });
    await db().query(`UPDATE ${table} SET deleted_at=now(), updated_by=$1 WHERE id=$2`, [req.user.sub, req.params.id]);
    await audit(db(), req.user.sub, 'delete', name, req.params.id, before, null);
    return { ok: true, soft_deleted: true };
  });
}
