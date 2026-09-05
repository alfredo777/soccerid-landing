/**
 * Cloudflare Turnstile — verificación server-side.
 *
 * Claves por variables de entorno (nunca en el repo):
 *   TURNSTILE_SITE_KEY    → clave pública (widget en el HTML)
 *   TURNSTILE_SECRET_KEY  → clave secreta (validación server-side)
 *   TURNSTILE_HOSTNAMES   → (opcional) lista separada por comas de hostnames
 *                           permitidos; si se define, se valida `result.hostname`.
 *
 * Si no hay secret configurado, la verificación se OMITE (feature apagado) para
 * no bloquear el acceso en local/desarrollo.
 */
const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

const siteKey = () => process.env.TURNSTILE_SITE_KEY || '';
const secretKey = () => process.env.TURNSTILE_SECRET_KEY || '';
const enabled = () => !!secretKey();

/**
 * Verifica el token de Turnstile enviado por el cliente.
 * @param {string} token  Valor del campo `cf-turnstile-response`.
 * @param {string} ip     IP del cliente (opcional).
 * @param {string} action (opcional) debe coincidir con data-action del widget.
 * @returns {Promise<boolean>} true si pasa (o si el feature está apagado).
 */
async function verify(token, ip, action) {
  // Feature apagado (sin secret): no bloquear.
  if (!enabled()) return true;

  if (typeof token !== 'string' || token.length === 0 || token.length > 2048) {
    return false;
  }

  let result;
  try {
    const body = new URLSearchParams({ secret: secretKey(), response: token });
    if (ip) body.set('remoteip', ip);
    const r = await fetch(SITEVERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      signal: AbortSignal.timeout(10000),
      body
    });
    if (!r.ok) throw new Error(`siteverify ${r.status}`);
    result = await r.json();
  } catch (_) {
    return false;
  }

  if (!result.success) return false;
  // Validación de acción (si se pidió y el resultado la trae)
  if (action && result.action && result.action !== action) return false;
  // Validación de hostname (solo si se configuró la lista)
  const allowed = (process.env.TURNSTILE_HOSTNAMES || '')
    .split(',').map(h => h.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(result.hostname)) return false;

  return true;
}

module.exports = { verify, enabled, siteKey };
