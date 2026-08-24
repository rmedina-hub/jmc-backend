import { uuid } from './db.js';
import { userCan } from './rbac.js';
import { calcularCotizacion } from './calc.js';

export function registerCotizacionItems(app) {
  const db = () => app.db;
  async function guard(req, reply, accion) {
    if (!req.user) { reply.code(401).send({ error: 'no_autenticado' }); return false; }
    const ok = await userCan(db(), req.user.sub, 'cotizaciones', accion);
    if (!ok) { reply.code(403).send({ error: 'sin_permiso' }); return false; }
    return true;
  }
  // Reemplaza los ítems de una cotización (empresa del usuario)
  app.put('/api/cotizaciones/:id/items', async (req, reply) => {
    if (!await guard(req, reply, 'update')) return;
    const cot = await db().one('SELECT * FROM cotizaciones WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL', [req.params.id, req.user.empresa_id]);
    if (!cot) return reply.code(404).send({ error: 'no_encontrado' });
    const items = (req.body && req.body.items) || [];
    await db().query('DELETE FROM cotizacion_items WHERE cotizacion_id=$1', [req.params.id]);
    let orden = 0;
    for (const it of items) {
      await db().query('INSERT INTO cotizacion_items (id,cotizacion_id,tipo,sku,descripcion,unidad,cant,precio,orden) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)',
        [uuid(), req.params.id, it.tipo || 'material', it.sku || null, it.descripcion || null, it.unidad || null, Number(it.cant) || 0, Number(it.precio) || 0, orden++]);
    }
    return { ok: true, items: items.length };
  });
  // Total recalculado SERVER-SIDE desde los ítems + % almacenados
  app.get('/api/cotizaciones/:id/total', async (req, reply) => {
    if (!await guard(req, reply, 'read')) return;
    const cot = await db().one('SELECT * FROM cotizaciones WHERE id=$1 AND empresa_id=$2 AND deleted_at IS NULL', [req.params.id, req.user.empresa_id]);
    if (!cot) return reply.code(404).send({ error: 'no_encontrado' });
    const items = await db().many('SELECT * FROM cotizacion_items WHERE cotizacion_id=$1 ORDER BY orden', [req.params.id]);
    return calcularCotizacion({ items, pct_gg: cot.pct_gg, pct_utilidad: cot.pct_utilidad, descuento: cot.descuento });
  });
}
