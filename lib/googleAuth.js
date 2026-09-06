/**
 * Login con Google (OAuth 2.0, authorization code flow) — sin dependencias extra.
 *
 * Credenciales por env (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET). En local, si no
 * están, se leen de `google-client.local.json` (gitignored). El callback se deriva
 * de BASE_URL o de GOOGLE_CALLBACK_URL.
 *
 * El id_token se obtiene del token endpoint de Google por TLS usando el client
 * secret (canal autenticado), y se validan aud/iss/exp/email_verified.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';

function config() {
  let id = process.env.GOOGLE_CLIENT_ID || '';
  let secret = process.env.GOOGLE_CLIENT_SECRET || '';
  if (!id || !secret) {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'google-client.local.json'), 'utf8')).web || {};
      id = id || j.client_id || '';
      secret = secret || j.client_secret || '';
    } catch (_) {}
  }
  return { id, secret };
}

function enabled() { const c = config(); return !!(c.id && c.secret); }

function callbackUrl() {
  if (process.env.GOOGLE_CALLBACK_URL) return process.env.GOOGLE_CALLBACK_URL;
  const base = process.env.BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://soccerid.co' : `http://localhost:${process.env.PORT || 3000}`);
  return base.replace(/\/$/, '') + '/panel/auth/google/callback';
}

function makeState() { return crypto.randomBytes(16).toString('hex'); }

function authUrl(state) {
  const { id } = config();
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: callbackUrl(),
    response_type: 'code',
    scope: 'openid email profile',
    state,
    access_type: 'online',
    prompt: 'select_account',
    include_granted_scopes: 'true'
  });
  if (process.env.GOOGLE_HD) p.set('hd', process.env.GOOGLE_HD);
  return `${AUTH_URI}?${p.toString()}`;
}

function decodeJwtPayload(jwt) {
  const part = String(jwt).split('.')[1];
  if (!part) return null;
  const b64 = part.replace(/-/g, '+').replace(/_/g, '/');
  try { return JSON.parse(Buffer.from(b64, 'base64').toString('utf8')); } catch (_) { return null; }
}

/**
 * Intercambia el code por tokens y devuelve el perfil verificado
 * { sub, email, emailVerified, name } o lanza error.
 */
async function exchangeAndVerify(code) {
  const { id, secret } = config();
  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code, client_id: id, client_secret: secret,
      redirect_uri: callbackUrl(), grant_type: 'authorization_code'
    })
  });
  const data = await res.json();
  if (!res.ok || !data.id_token) throw new Error('token_exchange_failed');

  const claims = decodeJwtPayload(data.id_token);
  if (!claims) throw new Error('bad_id_token');
  const issOk = claims.iss === 'https://accounts.google.com' || claims.iss === 'accounts.google.com';
  const audOk = claims.aud === id;
  const notExpired = Number(claims.exp) * 1000 > Date.now();
  if (!issOk || !audOk || !notExpired) throw new Error('invalid_claims');
  if (process.env.GOOGLE_HD && claims.hd !== process.env.GOOGLE_HD) throw new Error('wrong_hd');

  return {
    sub: claims.sub,
    email: (claims.email || '').toLowerCase(),
    emailVerified: claims.email_verified === true || claims.email_verified === 'true',
    name: claims.name || ''
  };
}

module.exports = { enabled, config, callbackUrl, makeState, authUrl, exchangeAndVerify };
