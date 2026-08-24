-- Cuarentena y mapeo de reconciliación de precios (Hub) contra el maestro de materiales.
-- precios.material_id sólo se llena cuando el match es CONFIRMADO (determinístico exacto).
CREATE TABLE IF NOT EXISTS precios_reconciliacion (
  id TEXT PRIMARY KEY,
  precio_id TEXT,                 -- legacy_id/origen del precio
  sku_origen TEXT,
  descripcion TEXT,
  proveedor TEXT,
  unidad TEXT,
  precio NUMERIC,
  material_candidato_id TEXT,     -- material sugerido (si aplica)
  metodo TEXT,                    -- sku_exacto|desc_exacta|desc_unidad|desc_proveedor|fuzzy|none
  score NUMERIC,                  -- 0..1
  estado TEXT NOT NULL,           -- CONFIRMADO|SUGERIDO|SIN_MATCH
  created_at TIMESTAMPTZ DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_precrec_estado ON precios_reconciliacion(estado);
CREATE INDEX IF NOT EXISTS idx_precrec_material ON precios_reconciliacion(material_candidato_id);
