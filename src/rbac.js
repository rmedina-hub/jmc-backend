// Autorización SERVER-SIDE. Nunca confía en el rol enviado por el cliente:
// resuelve permisos desde la BD según el usuario del token.
export async function userCan(db, usuarioId, entidad, accion) {
  const row = await db.one(
    `SELECT 1 FROM usuario_roles ur
       JOIN permisos p ON p.rol_id = ur.rol_id
      WHERE ur.usuario_id = $1 AND p.entidad = $2 AND p.accion = $3
      LIMIT 1`,
    [usuarioId, entidad, accion]
  );
  return !!row;
}
export function requirePermission(entidad, accion) {
  return async function (req, reply) {
    const u = req.user;
    if (!u) return reply.code(401).send({ error: 'no_autenticado' });
    const ok = await req.server.db && await userCan(req.server.db, u.sub, entidad, accion);
    if (!ok) return reply.code(403).send({ error: 'sin_permiso', entidad, accion });
  };
}
