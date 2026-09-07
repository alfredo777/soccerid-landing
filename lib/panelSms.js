/**
 * Envío de SMS (Twilio) para las notificaciones del panel.
 *
 * Las credenciales se configuran **desde el admin** (pestaña Configuración) y se
 * guardan en `app_settings` con la clave `twilio_config`. Se usan variables de
 * entorno solo como respaldo, para no romper si alguien ya las tenía puestas:
 * TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM.
 *
 * Motivo de guardar en BD y no solo en env: en Heroku cambiar una env var
 * reinicia el dyno y hay que entrar por consola; el organizador necesita poder
 * pegar sus llaves sin depender de un deploy.
 *
 * Se habla con la API REST por HTTPS directo (sin el paquete `twilio`) para no
 * agregar dependencias al build.
 */
const https = require('https');
const knex = require('../db/knex');

const KEY = 'twilio_config';

function envFallback() {
  return {
    account_sid: process.env.TWILIO_ACCOUNT_SID || '',
    auth_token: process.env.TWILIO_AUTH_TOKEN || '',
    from: process.env.TWILIO_FROM || '',
    enabled: !!(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN)
  };
}

// Config completa (CON el token). Solo para uso interno del envío.
async function getConfig() {
  const env = envFallback();
  let saved = {};
  try {
    const row = await knex('app_settings').where({ key: KEY }).first();
    if (row && row.value) saved = JSON.parse(row.value) || {};
  } catch (_) {}
  const cfg = {
    account_sid: (saved.account_sid || env.account_sid || '').trim(),
    auth_token: (saved.auth_token || env.auth_token || '').trim(),
    from: (saved.from || env.from || '').trim(),
    enabled: saved.enabled === undefined ? env.enabled : !!saved.enabled
  };
  cfg.configured = !!(cfg.account_sid && cfg.auth_token && cfg.from);
  cfg.ready = cfg.configured && cfg.enabled;
  return cfg;
}

// Versión segura para la vista: nunca devuelve el token, solo si ya hay uno.
async function getPublicConfig() {
  const c = await getConfig();
  return {
    account_sid: c.account_sid,
    from: c.from,
    enabled: c.enabled,
    configured: c.configured,
    ready: c.ready,
    hasToken: !!c.auth_token,
    tokenMask: c.auth_token ? '••••••••' + c.auth_token.slice(-4) : ''
  };
}

/**
 * Guarda la config. Si `auth_token` viene vacío se conserva el que ya estaba
 * (así el admin puede cambiar el número sin volver a pegar el token).
 */
async function saveConfig(patch) {
  let saved = {};
  try {
    const row = await knex('app_settings').where({ key: KEY }).first();
    if (row && row.value) saved = JSON.parse(row.value) || {};
  } catch (_) {}
  const next = {
    account_sid: patch.account_sid !== undefined ? String(patch.account_sid || '').trim() : (saved.account_sid || ''),
    auth_token: (patch.auth_token || '').trim() || saved.auth_token || '',
    from: patch.from !== undefined ? String(patch.from || '').trim() : (saved.from || ''),
    enabled: !!patch.enabled
  };
  const value = JSON.stringify(next);
  const ex = await knex('app_settings').where({ key: KEY }).first();
  if (ex) await knex('app_settings').where({ key: KEY }).update({ value });
  else await knex('app_settings').insert({ key: KEY, value });
  return next;
}

async function clearConfig() {
  await knex('app_settings').where({ key: KEY }).del();
}

function post(cfg, to, body) {
  return new Promise((resolve) => {
    const form = new URLSearchParams({ To: to, From: cfg.from, Body: body }).toString();
    const req = https.request({
      method: 'POST',
      host: 'api.twilio.com',
      path: `/2010-04-01/Accounts/${encodeURIComponent(cfg.account_sid)}/Messages.json`,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(form),
        Authorization: 'Basic ' + Buffer.from(`${cfg.account_sid}:${cfg.auth_token}`).toString('base64')
      },
      timeout: 15000
    }, (res) => {
      let data = '';
      res.on('data', (c) => { data += c; });
      res.on('end', () => {
        if (res.statusCode >= 200 && res.statusCode < 300) return resolve({ sent: true });
        let msg = `HTTP ${res.statusCode}`;
        try { const j = JSON.parse(data); if (j.message) msg = j.message; } catch (_) {}
        resolve({ sent: false, error: msg });
      });
    });
    req.on('timeout', () => { req.destroy(); resolve({ sent: false, error: 'Tiempo de espera agotado' }); });
    req.on('error', (e) => resolve({ sent: false, error: e.message }));
    req.write(form);
    req.end();
  });
}

/** Manda un SMS. Nunca lanza: devuelve { sent, error }. */
async function sendSms({ to, body }) {
  const dest = String(to || '').replace(/[^\d+]/g, '');
  if (!dest || dest.length < 8) return { sent: false, error: 'Teléfono inválido' };
  const cfg = await getConfig();
  if (!cfg.ready) {
    console.log(`  ⚠ Twilio no configurado — SMS a ${dest} no enviado`);
    return { sent: false, error: 'Twilio no configurado' };
  }
  const r = await post(cfg, dest, String(body || '').slice(0, 600));
  if (!r.sent) console.error(`  ✗ Error enviando SMS a ${dest}: ${r.error}`);
  return r;
}

module.exports = { getConfig, getPublicConfig, saveConfig, clearConfig, sendSms, KEY };
