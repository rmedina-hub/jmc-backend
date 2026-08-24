// Proxy IA endurecido: la API key vive SOLO aquí. Timeout, allowlist de modelo,
// límite de contexto, sanitización de errores, auditoría de uso. Nunca filtra key/headers/stack.
import { audit } from './audit.js';
const MODELOS_PERMITIDOS = new Set(['claude-3-5-sonnet-20240620', 'claude-3-5-haiku-20241022']);
const MAX_PROMPT = 20000;      // caracteres
const TIMEOUT_MS = 20000;

export function registerIA(app, { fetchImpl } = {}) {
  const doFetch = fetchImpl || globalThis.fetch;
  app.post('/api/ia/consulta', async (req, reply) => {
    if (!req.user) return reply.code(401).send({ error: 'no_autenticado' });
    const key = process.env.ANTHROPIC_API_KEY;
    if (!key) return reply.code(503).send({ error: 'ia_no_configurada' });
    const prompt = String((req.body && req.body.prompt) || '');
    if (!prompt) return reply.code(400).send({ error: 'prompt_vacio' });
    if (prompt.length > MAX_PROMPT) return reply.code(413).send({ error: 'prompt_demasiado_largo', max: MAX_PROMPT });
    let model = (req.body && req.body.model) || 'claude-3-5-sonnet-20240620';
    if (!MODELOS_PERMITIDOS.has(model)) return reply.code(400).send({ error: 'modelo_no_permitido' });
    const ctrl = new AbortController();
    const to = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const r = await doFetch('https://api.anthropic.com/v1/messages', {
        method: 'POST', signal: ctrl.signal,
        headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
        body: JSON.stringify({ model, max_tokens: 1024, messages: [{ role: 'user', content: prompt }] })
      });
      const data = await r.json();
      try { await audit(app.db, req.user.sub, 'ia_consulta', 'ia', model, { chars: prompt.length }, null); } catch {}
      return { ok: true, respuesta: data }; // sin key, sin headers, sin stack
    } catch (e) {
      const msg = (e && e.name === 'AbortError') ? 'ia_timeout' : 'ia_upstream';
      return reply.code(502).send({ error: msg }); // error sanitizado (sin stack ni detalles internos)
    } finally { clearTimeout(to); }
  });
}
