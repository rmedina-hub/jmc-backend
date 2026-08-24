// Motor único de cotización (server-side). Replica la fórmula verificada en los 4 cotizadores:
// utilidad = CostoDirecto x %  (NUNCA (CD+GG) x %).
export function calcularCotizacion(cot) {
  const items = cot.items || [];
  const CD = items.reduce((s, it) => s + (Number(it.cant)||0) * (Number(it.precio)||0), 0);
  const pctGG = Number(cot.pct_gg) || 0, pctUt = Number(cot.pct_utilidad) || 0;
  const pctIVA = cot.pct_iva !== undefined ? Number(cot.pct_iva) : 19;
  const desc = Number(cot.descuento) || 0;
  const gg = CD * (pctGG / 100);
  const utilidad = CD * (pctUt / 100);
  const subtotal = CD + gg + utilidad;
  const descMonto = subtotal * (desc / 100);
  const neto = subtotal - descMonto;
  const iva = neto * (pctIVA / 100);
  return {
    costoDirecto: Math.round(CD), gg: Math.round(gg), utilidad: Math.round(utilidad),
    descuento: Math.round(descMonto), neto: Math.round(neto), iva: Math.round(iva), total: Math.round(neto + iva)
  };
}
