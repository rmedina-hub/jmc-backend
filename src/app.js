import Fastify from 'fastify';
import { uuid } from './db.js';
import { hashPassword, verifyPassword, signToken, verifyToken } from './auth.js';
import { registerEntity } from './entity.js';
import { registerIA } from './ia.js';
import { registerCotizacionItems } from './cotizaciones_items.js';
import { audit } from './audit.js';

export function buildApp({ db, secret = 'dev-secret-change-me', iaFetch, corsOrigins } = {}) {
  const app = Fastify({ logger: false, bodyLimit: 1_000_000 }); // límite de payload 1MB
  app.decorate('db', db);
  app.decorate('secret', secret);

  // Allowlist CORS (nunca '*'). Config por env CORS_ORIGINS o parámetro.
  const origins = corsOrigins || (process.env.CORS_ORIGINS || 'https://cotizaciones.jmcingenieria.cl').split(',').map(s => s.trim());
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    if (origin && origins.includes(origin)) {
      reply.header('Access-Control-Allow-Origin', origin);
      reply.header('Vary', 'Origin');
      reply.header('Access-Control-Allow-Credentials', 'true');
      reply.header('Access-Control-Allow-Headers', 'authorization,content-type');
      reply.header('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
    }
    // Headers de seguridad
    reply.header('X-Content-Type-Options', 'nosniff');
    reply.header('X-Frame-Options', 'DENY');
    reply.header('Referrer-Policy', 'no-referrer');
    if (req.method === 'OPTIONS') { reply.code(204).send(); }
  });

  // Auth hook: identidad SOLO desde el token
  app.addHook('preHandler', async (req) => {
    const h = req.headers['authorization'] || '';
    const token = h.startsWith('Bearer ') ? h.slice(7) : null;
    req.user = token ? verifyToken(token, secret) : null;
  });


  // Observabilidad: request_id + log estructurado (sin secretos). Activar con JMC_ACCESS_LOG=1.
  app.addHook('onRequest', async (req) => { req.reqId = (globalThis.crypto&&crypto.randomUUID)?crypto.randomUUID():String(Date.now()); req.t0 = Date.now(); });
  app.addHook('onResponse', async (req, reply) => {
    if (!process.env.JMC_ACCESS_LOG) return;
    const line = { request_id: req.reqId, user_id: req.user && req.user.sub, empresa_id: req.user && req.user.empresa_id, route: req.method + ' ' + req.url, status: reply.statusCode, ms: Date.now() - (req.t0||Date.now()) };
    try { console.log(JSON.stringify(line)); } catch {} // nunca password/JWT/API key/DATABASE_URL
  });

  app.get('/health', async () => ({ status: 'ok' }));            // proceso vivo
  app.get('/ready', async (req, reply) => {                       // BD disponible
    try { await db.query('SELECT 1', []); return { status: 'ready' }; }
    catch { return reply.code(503).send({ status: 'not_ready' }); }
  });

  // ---- Rate limit login (in-memory, por email+ip) ----
  const loginHits = new Map();
  function rateLimited(key, max = 5, windowMs = 60_000) {
    const now = Date.now(); const e = loginHits.get(key) || { n: 0, t: now };
    if (now - e.t > windowMs) { e.n = 0; e.t = now; }
    e.n++; loginHits.set(key, e); return e.n > max;
  }

  app.post('/auth/login', async (req, reply) => {
    const { email, password } = req.body || {};
    const key = (email || '') + '|' + (req.ip || '');
    if (rateLimited(key)) return reply.code(429).send({ error: 'demasiados_intentos' });
    const u = await db.one('SELECT * FROM usuarios WHERE email=$1 AND activo=true', [email]);
    if (!u || !verifyPassword(password || '', u.password_hash)) return reply.code(401).send({ error: 'credenciales' });
    const roles = await db.many('SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id=ur.rol_id WHERE ur.usuario_id=$1', [u.id]);
    const token = signToken({ sub: u.id, email: u.email, empresa_id: u.empresa_id, roles: roles.map(r => r.nombre) }, secret, '2h');
    const refresh = signToken({ sub: u.id, typ: 'refresh' }, secret, '7d');
    return { token, refresh, user: { id: u.id, email: u.email, nombre: u.nombre, empresa_id: u.empresa_id, roles: roles.map(r => r.nombre) } };
  });
  app.post('/auth/refresh', async (req, reply) => {
    const p = verifyToken((req.body && req.body.refresh) || '', secret);
    if (!p || p.typ !== 'refresh') return reply.code(401).send({ error: 'refresh_invalido' });
    const u = await db.one('SELECT * FROM usuarios WHERE id=$1 AND activo=true', [p.sub]);
    if (!u) return reply.code(401).send({ error: 'usuario_inactivo' });
    const roles = await db.many('SELECT r.nombre FROM usuario_roles ur JOIN roles r ON r.id=ur.rol_id WHERE ur.usuario_id=$1', [u.id]);
    return { token: signToken({ sub: u.id, email: u.email, empresa_id: u.empresa_id, roles: roles.map(r => r.nombre) }, secret, '2h') };
  });
  app.post('/auth/logout', async () => ({ ok: true })); // stateless; el cliente descarta tokens (denylist si se requiere)
  app.get('/me', async (req, reply) => { if (!req.user) return reply.code(401).send({ error: 'no_autenticado' }); return { user: req.user }; });

  registerEntity(app, { name: 'clientes', table: 'clientes', cols: ['empresa_id','nombre','rut','contacto','email','telefono','direccion','legacy_id'] });
  registerEntity(app, { name: 'proveedores', table: 'proveedores', cols: ['empresa_id','nombre','rut','rubro','contacto','email','telefono','condiciones','calificacion','legacy_id'] });
  registerEntity(app, { name: 'materiales', table: 'materiales', cols: ['empresa_id','sku','descripcion','unidad','categoria_id','marca','modelo','activo','legacy_id'] });
  registerEntity(app, { name: 'precios', table: 'precios', cols: ['material_id','proveedor_id','precio','moneda','fecha','fuente','legacy_id'] });
  registerEntity(app, { name: 'cotizaciones', table: 'cotizaciones', cols: ['empresa_id','numero','cliente_id','fecha','validez','obra','estado','pct_gg','pct_utilidad','descuento','observaciones','legacy_id'] });

  app.post('/api/sync', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'no_autenticado' });
    const { operation_id, entidad, accion, record_id, base_version } = req.body || {};
    if (!operation_id) return reply.code(400).send({ error: 'falta_operation_id' });
    const existing = await db.one('SELECT * FROM sync_operations WHERE operation_id=$1', [operation_id]);
    if (existing) return { ok: true, idempotent: true, status: existing.status };
    await db.query('INSERT INTO sync_operations (operation_id, usuario_id, entidad, accion, record_id, base_version, status) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [operation_id, req.user.sub, entidad || null, accion || null, record_id || null, base_version ?? null, 'synced']);
    return { ok: true, idempotent: false, status: 'synced' };
  });

  registerCotizacionItems(app);
  registerIA(app, { fetchImpl: iaFetch });
  return app;
}

export async function seedRbacAndAdmin(db, { adminEmail = 'admin@jmc.cl', adminPass = 'jmc-admin' } = {}) {
  const empJMC = uuid(), empTrab = uuid();
  await db.query('INSERT INTO empresas (id, nombre, rut) VALUES ($1,$2,$3)', [empJMC, 'JMC', '76.219.291-8']);
  await db.query('INSERT INTO empresas (id, nombre, rut) VALUES ($1,$2,$3)', [empTrab, 'Trabancura', '76.885.529-3']);
  const entidades = ['clientes','proveedores','materiales','precios','cotizaciones'];
  const acciones = ['read','create','update','delete'];
  const rolAdmin = uuid(), rolLector = uuid();
  await db.query('INSERT INTO roles (id,nombre) VALUES ($1,$2)', [rolAdmin, 'Administrador']);
  await db.query('INSERT INTO roles (id,nombre) VALUES ($1,$2)', [rolLector, 'Lector']);
  for (const e of entidades) for (const a of acciones) await db.query('INSERT INTO permisos (id,rol_id,entidad,accion) VALUES ($1,$2,$3,$4)', [uuid(), rolAdmin, e, a]);
  for (const e of entidades) await db.query('INSERT INTO permisos (id,rol_id,entidad,accion) VALUES ($1,$2,$3,$4)', [uuid(), rolLector, e, 'read']);

  // Roles JMC reales (además de Administrador/Lector)
  const rolesJMC = {
    'Cotizador':   { clientes:['read','create','update'], proveedores:['read'], materiales:['read'], precios:['read'], cotizaciones:['read','create','update'] },
    'Compras':     { clientes:['read'], proveedores:['read','create','update'], materiales:['read','create','update'], precios:['read','create','update'], cotizaciones:['read'] },
    'Bodega':      { clientes:['read'], proveedores:['read'], materiales:['read','update'], precios:['read'], cotizaciones:['read'] },
    'Jefe Proyecto':{ clientes:['read'], proveedores:['read'], materiales:['read'], precios:['read'], cotizaciones:['read','update','delete'] }
  };
  const rolIds = {};
  for (const [nombre, perms] of Object.entries(rolesJMC)) {
    const rid = uuid(); rolIds[nombre]=rid;
    await db.query('INSERT INTO roles (id,nombre) VALUES ($1,$2)', [rid, nombre]);
    for (const [ent, acs] of Object.entries(perms)) for (const a of acs)
      await db.query('INSERT INTO permisos (id,rol_id,entidad,accion) VALUES ($1,$2,$3,$4)', [uuid(), rid, ent, a]);
  }
  const admin = uuid();
  await db.query('INSERT INTO usuarios (id,empresa_id,email,nombre,password_hash,activo) VALUES ($1,$2,$3,$4,$5,true)', [admin, empJMC, adminEmail, 'Admin JMC', hashPassword(adminPass)]);
  await db.query('INSERT INTO usuario_roles (usuario_id,rol_id) VALUES ($1,$2)', [admin, rolAdmin]);
  return { empresaJMC: empJMC, empresaTrab: empTrab, empresaId: empJMC, rolAdmin, rolLector, rolIds, adminId: admin };
}
