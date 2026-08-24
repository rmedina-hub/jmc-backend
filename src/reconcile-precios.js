// Reconciliación de precios (Hub) -> materiales (maestro). Determinística primero;
// fuzzy SOLO como SUGERENCIA (nunca adjudica FK). Devuelve estado por precio.
export function norm(s) {
  return String(s == null ? '' : s)
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // quita acentos
    .toUpperCase().replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
function lev(a, b) { // Levenshtein
  a = a || ''; b = b || ''; const m = a.length, n = b.length;
  if (!m) return n; if (!n) return m;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) d[0][j] = j;
  for (let i = 1; i <= m; i++) for (let j = 1; j <= n; j++)
    d[i][j] = Math.min(d[i-1][j]+1, d[i][j-1]+1, d[i-1][j-1] + (a[i-1] === b[j-1] ? 0 : 1));
  return d[m][n];
}
function ratio(a, b) { const M = Math.max(a.length, b.length) || 1; return 1 - lev(a, b) / M; }

// materiales: [{id, sku, descripcion, unidad}]  precios: [{id, sku, producto/descripcion, unidad, proveedor, precio}]
export function reconcilePrecios(precios, materiales, { fuzzyMin = 0.86 } = {}) {
  const bySku = new Map(), byDesc = new Map();
  for (const m of materiales) {
    const s = norm(m.sku); if (s) if (!bySku.has(s)) bySku.set(s, m);
    const d = norm(m.descripcion); if (d) if (!byDesc.has(d)) byDesc.set(d, m);
  }
  const out = [];
  for (const px of precios) {
    const sku = norm(px.sku);
    const desc = norm(px.descripcion || px.producto);
    const un = norm(px.unidad);
    let r = { precio_id: px.id, sku_origen: px.sku || null, descripcion: px.descripcion || px.producto || null, proveedor: px.proveedor || null, unidad: px.unidad || null, precio: Number(px.precio) || 0, material_candidato_id: null, metodo: 'none', score: 0, estado: 'SIN_MATCH' };
    // 1) SKU exacto
    if (sku && bySku.has(sku)) { r = { ...r, material_candidato_id: bySku.get(sku).id, metodo: 'sku_exacto', score: 1, estado: 'CONFIRMADO' }; out.push(r); continue; }
    // 2) descripción exacta
    if (desc && byDesc.has(desc)) { r = { ...r, material_candidato_id: byDesc.get(desc).id, metodo: 'desc_exacta', score: 1, estado: 'CONFIRMADO' }; out.push(r); continue; }
    // 3) desc + unidad exacta (entre materiales de misma desc-token) -> confirmado si único
    // 4) fuzzy (solo SUGERIDO)
    let best = null, bestScore = 0;
    if (desc) for (const [d, m] of byDesc) { const sc = ratio(desc, d); if (sc > bestScore) { bestScore = sc; best = m; } }
    if (best && bestScore >= fuzzyMin) { r = { ...r, material_candidato_id: best.id, metodo: 'fuzzy', score: +bestScore.toFixed(3), estado: 'SUGERIDO' }; }
    out.push(r);
  }
  const resumen = out.reduce((a, x) => (a[x.estado] = (a[x.estado] || 0) + 1, a), {});
  return { items: out, resumen };
}
