/**
 * Google Calendar del panel — calendario de la ORGANIZACIÓN.
 *
 * El admin conecta una cuenta de Google una vez y, desde ahí, las actividades del
 * calendario del panel se empujan a ese calendario de Google.
 *
 * **Va aparte del login de Google a propósito.** Tiene su propio callback
 * (`/panel/auth/google/calendar/callback`) y su propio interruptor. El login está
 * apagado mientras la pantalla de consentimiento siga en *Testing*; si Calendar
 * colgara del mismo callback, conectar el calendario obligaría a encender el
 * login. Comparte las credenciales del proyecto de Google (mismo client id y
 * secret), que es lo único que sí conviene compartir.
 *
 * Los tokens se guardan en `app_settings` (clave `google_calendar`), no en env:
 * el refresh token llega después de que el admin autoriza, y en Heroku no se
 * puede escribir una env var desde el propio proceso.
 */
const crypto = require('crypto');
const knex = require('../db/knex');
const googleAuth = require('./googleAuth');

const AUTH_URI = 'https://accounts.google.com/o/oauth2/v2/auth';
const TOKEN_URI = 'https://oauth2.googleapis.com/token';
const API = 'https://www.googleapis.com/calendar/v3';
const SCOPE = 'https://www.googleapis.com/auth/calendar.events';
const KEY = 'google_calendar';

/** Interruptor propio: GOOGLE_CALENDAR=0 lo apaga sin tocar el login. */
function apagado() {
  const v = String(process.env.GOOGLE_CALENDAR == null ? '' : process.env.GOOGLE_CALENDAR).trim().toLowerCase();
  return v === '0' || v === 'off' || v === 'false' || v === 'no';
}

/** ¿Se puede ofrecer la conexión? (credenciales presentes y no apagado) */
function disponible() {
  if (apagado()) return false;
  const c = googleAuth.config();
  return !!(c.id && c.secret);
}

function callbackUrl() {
  if (process.env.GOOGLE_CALENDAR_CALLBACK_URL) return process.env.GOOGLE_CALENDAR_CALLBACK_URL;
  const base = process.env.BASE_URL || (process.env.NODE_ENV === 'production'
    ? 'https://soccerid.co'
    : `http://localhost:${process.env.PORT || 3000}`);
  return base.replace(/\/$/, '') + '/panel/auth/google/calendar/callback';
}

function makeState() { return crypto.randomBytes(16).toString('hex'); }

function authUrl(state) {
  const { id } = googleAuth.config();
  const p = new URLSearchParams({
    client_id: id,
    redirect_uri: callbackUrl(),
    response_type: 'code',
    scope: SCOPE,
    state,
    // offline + consent: sin esto Google no manda refresh_token en la segunda
    // autorización, y la conexión se caería a la hora.
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: 'true'
  });
  return `${AUTH_URI}?${p.toString()}`;
}

// ── Estado guardado ──────────────────────────────────────────────────────────
async function leer() {
  try {
    const row = await knex('app_settings').where({ key: KEY }).first();
    return (row && row.value) ? (JSON.parse(row.value) || {}) : {};
  } catch (_) { return {}; }
}
async function guardar(patch) {
  const actual = await leer();
  const next = Object.assign({}, actual, patch);
  const value = JSON.stringify(next);
  const ex = await knex('app_settings').where({ key: KEY }).first();
  if (ex) await knex('app_settings').where({ key: KEY }).update({ value });
  else await knex('app_settings').insert({ key: KEY, value });
  return next;
}
async function desconectar() {
  await knex('app_settings').where({ key: KEY }).del();
}

/** Estado para la vista. Nunca devuelve tokens. */
async function estado() {
  const s = await leer();
  return {
    disponible: disponible(),
    conectado: !!s.refresh_token,
    cuenta: s.email || '',
    calendarId: s.calendar_id || 'primary',
    desde: s.conectado_en || '',
    ultimaSync: s.ultima_sync || '',
    ultimoError: s.ultimo_error || ''
  };
}

// ── Tokens ───────────────────────────────────────────────────────────────────
async function pedirTokens(params) {
  const { id, secret } = googleAuth.config();
  const res = await fetch(TOKEN_URI, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(Object.assign({ client_id: id, client_secret: secret }, params))
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error_description || data.error || `token_endpoint_${res.status}`);
  }
  return data;
}

/** Cierra la conexión: cambia el code por tokens y los guarda. */
async function conectar(code) {
  const data = await pedirTokens({
    code, redirect_uri: callbackUrl(), grant_type: 'authorization_code'
  });
  if (!data.refresh_token) {
    // Pasa cuando la cuenta ya autorizó antes y Google no reenvía el refresh.
    // Con prompt=consent no debería, pero si pasa hay que decirlo claro.
    throw new Error('Google no devolvió refresh token. Quita el acceso de la app en tu cuenta de Google y vuelve a conectar.');
  }
  let email = '';
  try {
    const perfil = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${data.access_token}` }
    }).then(r => r.json());
    email = (perfil && perfil.email) || '';
  } catch (_) {}

  await guardar({
    refresh_token: data.refresh_token,
    access_token: data.access_token,
    expira_en: Date.now() + (Number(data.expires_in || 3600) - 60) * 1000,
    email,
    conectado_en: new Date().toISOString(),
    ultimo_error: ''
  });
  return { email };
}

/** Access token vigente; lo renueva si hace falta. */
async function accessToken() {
  const s = await leer();
  if (!s.refresh_token) throw new Error('Google Calendar no está conectado');
  if (s.access_token && Number(s.expira_en || 0) > Date.now()) return s.access_token;
  const data = await pedirTokens({ refresh_token: s.refresh_token, grant_type: 'refresh_token' });
  await guardar({
    access_token: data.access_token,
    expira_en: Date.now() + (Number(data.expires_in || 3600) - 60) * 1000
  });
  return data.access_token;
}

// ── API de eventos ───────────────────────────────────────────────────────────
async function api(metodo, ruta, cuerpo) {
  const token = await accessToken();
  const res = await fetch(API + ruta, {
    method: metodo,
    headers: Object.assign({ Authorization: `Bearer ${token}` }, cuerpo ? { 'Content-Type': 'application/json' } : {}),
    body: cuerpo ? JSON.stringify(cuerpo) : undefined
  });
  if (res.status === 204) return {};
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && (data.error.message || data.error.status)) || `HTTP ${res.status}`;
    const err = new Error(msg);
    err.status = res.status;
    throw err;
  }
  return data;
}

/** Suma un día: Google trata `end.date` como exclusivo en eventos de día completo. */
function diaSiguiente(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Convierte una actividad del panel a un evento de Google.
 * Con hora se manda como evento con horario; sin hora, como día completo.
 */
function aEventoGoogle(act, zona) {
  const fecha = `${act.year}-${String(act.month).padStart(2, '0')}-${String(act.day).padStart(2, '0')}`;
  const tipo = act.type === 'Otro' ? (act.custom_type || 'Otro') : act.type;
  const base = {
    summary: act.title,
    description: [tipo, act.note].filter(Boolean).join(' · ') || undefined,
    source: { title: 'SOCCER iD Investor Hub', url: (process.env.BASE_URL || 'https://soccerid.co') + '/panel/calendario' }
  };
  if (/^\d{1,2}:\d{2}$/.test(String(act.time_label || ''))) {
    const hhmm = act.time_label.padStart(5, '0');
    const inicio = `${fecha}T${hhmm}:00`;
    const [h, m] = hhmm.split(':').map(Number);
    const fin = `${fecha}T${String((h + 1) % 24).padStart(2, '0')}:${String(m).padStart(2, '0')}:00`;
    return Object.assign(base, {
      start: { dateTime: inicio, timeZone: zona },
      end: { dateTime: fin, timeZone: zona }
    });
  }
  return Object.assign(base, { start: { date: fecha }, end: { date: diaSiguiente(fecha) } });
}

/**
 * Empuja las actividades al calendario de Google.
 * Guarda `google_event_id` en cada una para actualizar en vez de duplicar.
 * @returns {{creados:number, actualizados:number, errores:string[]}}
 */
async function sincronizar(actividades, zona = 'America/Mexico_City') {
  const s = await leer();
  const calId = encodeURIComponent(s.calendar_id || 'primary');
  let creados = 0, actualizados = 0;
  const errores = [];

  for (const act of actividades) {
    const cuerpo = aEventoGoogle(act, zona);
    try {
      if (act.google_event_id) {
        await api('PATCH', `/calendars/${calId}/events/${encodeURIComponent(act.google_event_id)}`, cuerpo);
        actualizados++;
      } else {
        const creado = await api('POST', `/calendars/${calId}/events`, cuerpo);
        await knex('events').where({ id: act.id }).update({ google_event_id: creado.id });
        creados++;
      }
    } catch (e) {
      // Si el evento se borró en Google, se limpia el id y se recrea en la
      // siguiente pasada, en vez de fallar para siempre.
      if (e.status === 404 || e.status === 410) {
        await knex('events').where({ id: act.id }).update({ google_event_id: null });
        errores.push(`"${act.title}": ya no estaba en Google, se recreará`);
      } else {
        errores.push(`"${act.title}": ${e.message}`);
      }
    }
  }

  await guardar({
    ultima_sync: new Date().toISOString(),
    ultimo_error: errores.length ? errores.slice(0, 3).join(' · ') : ''
  });
  return { creados, actualizados, errores };
}

/** Borra el evento en Google cuando se borra la actividad en el panel. */
async function borrarEvento(googleEventId) {
  if (!googleEventId) return { ok: true };
  const s = await leer();
  if (!s.refresh_token) return { ok: false, error: 'no conectado' };
  const calId = encodeURIComponent(s.calendar_id || 'primary');
  try {
    await api('DELETE', `/calendars/${calId}/events/${encodeURIComponent(googleEventId)}`);
    return { ok: true };
  } catch (e) {
    if (e.status === 404 || e.status === 410) return { ok: true }; // ya no estaba
    return { ok: false, error: e.message };
  }
}

module.exports = {
  disponible, callbackUrl, makeState, authUrl, conectar, desconectar,
  estado, sincronizar, borrarEvento, aEventoGoogle, SCOPE
};
