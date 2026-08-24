import { uuid } from './db.js';
export async function audit(db, usuarioId, accion, entidad, recordId, antes, despues) {
  await db.query(
    `INSERT INTO auditoria (id, usuario_id, accion, entidad, record_id, antes, despues)
     VALUES ($1,$2,$3,$4,$5,$6,$7)`,
    [uuid(), usuarioId, accion, entidad, recordId,
     antes ? JSON.stringify(antes) : null, despues ? JSON.stringify(despues) : null]
  );
}
