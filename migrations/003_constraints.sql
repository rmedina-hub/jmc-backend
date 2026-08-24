-- Restricciones de integridad adicionales (idempotentes donde el motor lo permita).
-- Nota: en PostgreSQL real se pueden endurecer con NOT VALID + VALIDATE para tablas con datos.
ALTER TABLE precios ADD CONSTRAINT chk_precio_no_neg CHECK (precio >= 0);
ALTER TABLE cotizacion_items ADD CONSTRAINT chk_cant_no_neg CHECK (cant >= 0);
ALTER TABLE cotizacion_items ADD CONSTRAINT chk_precio_item_no_neg CHECK (precio >= 0);
ALTER TABLE proveedores ADD CONSTRAINT chk_calif CHECK (calificacion IS NULL OR (calificacion BETWEEN 0 AND 5));
