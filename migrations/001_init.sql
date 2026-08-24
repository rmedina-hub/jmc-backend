-- JMC Fase 4 — esquema inicial (portátil PostgreSQL / pg-mem). IDs generados en app (UUID).
CREATE TABLE IF NOT EXISTS empresas (
  id TEXT PRIMARY KEY, nombre TEXT NOT NULL, rut TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY, empresa_id TEXT REFERENCES empresas(id), email TEXT UNIQUE NOT NULL,
  nombre TEXT, password_hash TEXT NOT NULL, activo BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE TABLE IF NOT EXISTS roles ( id TEXT PRIMARY KEY, nombre TEXT UNIQUE NOT NULL );
CREATE TABLE IF NOT EXISTS permisos ( id TEXT PRIMARY KEY, rol_id TEXT REFERENCES roles(id),
  entidad TEXT NOT NULL, accion TEXT NOT NULL );
CREATE TABLE IF NOT EXISTS usuario_roles ( usuario_id TEXT REFERENCES usuarios(id),
  rol_id TEXT REFERENCES roles(id), PRIMARY KEY (usuario_id, rol_id) );

-- Entidades de negocio (prioridad) con auditoría + soft delete + versión
CREATE TABLE IF NOT EXISTS clientes (
  id TEXT PRIMARY KEY, empresa_id TEXT, nombre TEXT NOT NULL, rut TEXT, contacto TEXT,
  email TEXT, telefono TEXT, direccion TEXT, legacy_id TEXT,
  version INTEGER NOT NULL DEFAULT 1, deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), created_by TEXT, updated_at TIMESTAMPTZ DEFAULT now(), updated_by TEXT
);
CREATE TABLE IF NOT EXISTS proveedores (
  id TEXT PRIMARY KEY, empresa_id TEXT, nombre TEXT NOT NULL, rut TEXT, rubro TEXT,
  contacto TEXT, email TEXT, telefono TEXT, condiciones TEXT, calificacion INTEGER, legacy_id TEXT,
  version INTEGER NOT NULL DEFAULT 1, deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), created_by TEXT, updated_at TIMESTAMPTZ DEFAULT now(), updated_by TEXT
);
CREATE TABLE IF NOT EXISTS categorias ( id TEXT PRIMARY KEY, empresa_id TEXT, nombre TEXT NOT NULL, padre_id TEXT );
-- MAESTRO ÚNICO DE SKU
CREATE TABLE IF NOT EXISTS materiales (
  id TEXT PRIMARY KEY, empresa_id TEXT NOT NULL, sku TEXT NOT NULL, descripcion TEXT NOT NULL,
  unidad TEXT, categoria_id TEXT, marca TEXT, modelo TEXT, activo BOOLEAN DEFAULT true, legacy_id TEXT,
  version INTEGER NOT NULL DEFAULT 1, deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), created_by TEXT, updated_at TIMESTAMPTZ DEFAULT now(), updated_by TEXT,
  UNIQUE (empresa_id, sku)
);
CREATE TABLE IF NOT EXISTS precios (
  id TEXT PRIMARY KEY, material_id TEXT REFERENCES materiales(id), proveedor_id TEXT REFERENCES proveedores(id),
  precio NUMERIC NOT NULL, moneda TEXT DEFAULT 'CLP', fecha DATE, fuente TEXT, legacy_id TEXT,
  version INTEGER NOT NULL DEFAULT 1, deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), created_by TEXT, updated_at TIMESTAMPTZ DEFAULT now(), updated_by TEXT
);
CREATE TABLE IF NOT EXISTS cotizaciones (
  id TEXT PRIMARY KEY, empresa_id TEXT, numero TEXT, cliente_id TEXT, fecha DATE, validez INTEGER,
  obra TEXT, estado TEXT, pct_gg NUMERIC DEFAULT 0, pct_utilidad NUMERIC DEFAULT 0, descuento NUMERIC DEFAULT 0,
  observaciones TEXT, legacy_id TEXT,
  version INTEGER NOT NULL DEFAULT 1, deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(), created_by TEXT, updated_at TIMESTAMPTZ DEFAULT now(), updated_by TEXT
);
CREATE TABLE IF NOT EXISTS cotizacion_items (
  id TEXT PRIMARY KEY, cotizacion_id TEXT REFERENCES cotizaciones(id), tipo TEXT, sku TEXT, descripcion TEXT,
  unidad TEXT, cant NUMERIC, precio NUMERIC, orden INTEGER
);

-- Sincronización idempotente (cola offline)
CREATE TABLE IF NOT EXISTS sync_operations (
  operation_id TEXT PRIMARY KEY, usuario_id TEXT, entidad TEXT, accion TEXT, record_id TEXT,
  base_version INTEGER, status TEXT, created_at TIMESTAMPTZ DEFAULT now()
);
-- Auditoría
CREATE TABLE IF NOT EXISTS auditoria (
  id TEXT PRIMARY KEY, usuario_id TEXT, accion TEXT, entidad TEXT, record_id TEXT,
  antes TEXT, despues TEXT, fecha TIMESTAMPTZ DEFAULT now()
);
