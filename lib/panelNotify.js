/**
 * Punto único de envío de notificaciones del panel.
 *
 * Toda notificación queda registrada en la tabla `notifications` (canal in-app,
 * siempre) y, según los canales pedidos, sale además por **email** (reutilizando
 * `lib/panelMailer.js`, no hay otro camino de correo) y por **SMS**
 * (`lib/panelSms.js`, Twilio configurado desde el admin).
 *
 * Respeta las preferencias del usuario guardadas en su perfil:
 *   notify_email (default true) y notify_sms (default false).
 * Excepción: una notificación **directa** (1 a 1) siempre se guarda in-app, para
 * que el destinatario la vea aunque haya apagado email y SMS.
 */
const knex = require('../db/knex');
const { sendNotification } = require('./panelMailer');
const { sendSms } = require('./panelSms');

// Tipos de notificación (los del mapa de eventos del backlog)
const TYPES = {
  actividad: { label: 'Actividad', color: '#6C3CE0' },
  envio: { label: 'Envío', color: '#0E9F6E' },
  documento: { label: 'Documento', color: '#2563EB' },
  post: { label: 'Noticia', color: '#D97706' },
  codigo: { label: 'Código 2027', color: '#DB2777' },
  inversion: { label: 'Inversión', color: '#0891B2' },
  directa: { label: 'Mensaje directo', color: '#7C3AED' },
  comunicado: { label: 'Comunicado', color: '#4B5563' }
};
const TYPE_KEYS = Object.keys(TYPES);

function normType(v) {
  return TYPE_KEYS.includes(v) ? v : 'comunicado';
}
function normAudience(v) {
  return ['all', 'investor', 'sponsor'].includes(v) ? v : 'all';
}
/** Acepta array o string con comas. 'in-app' siempre va incluido. */
function normChannels(v) {
  const list = Array.isArray(v) ? v : String(v == null ? '' : v).split(',');
  const set = new Set(['in-app']);
  list.map(c => String(c).trim().toLowerCase()).forEach(c => {
    if (c === 'email' || c === 'sms') set.add(c);
  });
  return [...set];
}

function wantsEmail(u) { return u.notify_email == null ? true : !!u.notify_email; }
function wantsSms(u) { return !!u.notify_sms; }

/**
 * ¿Este usuario acepta que le avisen de este tipo?
 * Se guarda lo que apagó (`notify_off`), no lo que encendió: así un tipo nuevo
 * le llega a todos por defecto en vez de a nadie hasta que lo activen uno por uno.
 * Las **directas** no se pueden apagar: son mensajes dirigidos a esa persona.
 */
function wantsType(u, type) {
  if (type === 'directa') return true;
  const off = String(u.notify_off || '').split(',').map(x => x.trim()).filter(Boolean);
  return off.indexOf(type) === -1;
}

/** Destinatarios: un usuario concreto, o todos los activos de la audiencia. */
async function resolveRecipients({ userId, audience }) {
  if (userId) {
    const u = await knex('users').where({ id: userId }).first();
    return u && u.role !== 'admin' ? [u] : [];
  }
  let q = knex('users').where({ status: 'active' }).whereNot({ role: 'admin' });
  if (audience !== 'all') q = q.andWhere({ role: audience });
  return q;
}

/**
 * Crea y despacha una notificación.
 * @returns {{id:number, recipients:number, emailed:number, smsed:number, errors:string[]}}
 */
async function notify({ type, title, body, audience, userId, eventId, channels }) {
  const t = normType(type);
  const aud = userId ? 'all' : normAudience(audience);
  const chans = normChannels(channels);
  const clean = String(title || '').trim();
  if (!clean) throw new Error('La notificación necesita título');

  const [inserted] = await knex('notifications')
    .insert({
      title: clean,
      body: String(body || '').trim() || null,
      audience: aud,
      type: t,
      user_id: userId || null,
      event_id: eventId || null,
      channels: chans.join(',')
    })
    .returning('id');
  const id = typeof inserted === 'object' ? inserted.id : inserted;

  const recipients = await resolveRecipients({ userId, audience: aud });
  let emailed = 0, smsed = 0;
  const errors = [];

  for (const u of recipients) {
    // Quien apagó este tipo no recibe correo ni SMS. En el panel sí queda: es su
    // registro y no cuesta nada; apagar un tipo es para que no le suene el teléfono.
    const aceptaTipo = wantsType(u, t);
    if (chans.includes('email') && u.email && wantsEmail(u) && aceptaTipo) {
      const r = await sendNotification({ to: u.email, name: u.name, title: clean, body });
      if (r && r.sent) emailed++;
      else if (r && r.error) errors.push(`email ${u.email}: ${r.error}`);
    }
    if (chans.includes('sms') && u.phone && wantsSms(u) && aceptaTipo) {
      const r = await sendSms({ to: u.phone, body: `SOCCER iD CUP 2027 — ${clean}${body ? `\n${String(body).slice(0, 300)}` : ''}` });
      if (r && r.sent) smsed++;
      else if (r && r.error) errors.push(`sms ${u.phone}: ${r.error}`);
    }
  }

  if (emailed || smsed) {
    await knex('notifications').where({ id }).update({ sent_email: emailed, sent_sms: smsed });
  }
  return { id, recipients: recipients.length, emailed, smsed, errors };
}

/**
 * Aviso al organizador (no es un usuario del panel): va por email a la lista de
 * `notify_emails` y queda registrado con audiencia 'admin', que ningún
 * inversionista puede ver (el filtro solo deja pasar 'all' o su rol).
 */
async function notifyAdmins({ type, title, body, eventId, channels }) {
  const clean = String(title || '').trim();
  if (!clean) return { id: null, emailed: 0 };
  const [inserted] = await knex('notifications')
    .insert({
      title: clean, body: String(body || '').trim() || null,
      audience: 'admin', type: normType(type), event_id: eventId || null,
      channels: normChannels(channels === undefined ? 'email' : channels).join(',')
    })
    .returning('id');
  const id = typeof inserted === 'object' ? inserted.id : inserted;

  const chans = normChannels(channels === undefined ? 'email' : channels);
  if (!chans.includes('email')) return { id, emailed: 0 };

  let list = [];
  try {
    const row = await knex('app_settings').where({ key: 'notify_emails' }).first();
    list = String((row && row.value) || '').split(',').map(s => s.trim()).filter(Boolean);
  } catch (_) {}
  let emailed = 0;
  for (const to of list) {
    const r = await sendNotification({ to, name: 'equipo SOCCER iD', title: clean, body });
    if (r && r.sent) emailed++;
  }
  if (emailed) await knex('notifications').where({ id }).update({ sent_email: emailed });
  return { id, emailed };
}

/**
 * Recordatorio de fecha de entrega: avisa una sola vez, cuando faltan `dias` o
 * menos para la entrega de una inversión activa.
 *
 * Se marca `reminded_at` al avisar, para que correrlo todos los días no acabe
 * mandando el mismo recordatorio una y otra vez. No manda nada de las fechas ya
 * pasadas: recordar algo que debió entregarse hace tres meses no ayuda.
 */
async function recordarEntregas(dias = 30) {
  const hoy = new Date();
  const hasta = new Date(hoy.getTime() + dias * 24 * 60 * 60 * 1000);
  const iso = (d) => d.toISOString().slice(0, 10);

  let filas = [];
  try {
    filas = await knex('investments')
      .whereNull('reminded_at')
      .andWhere({ state: 'activa' })
      .whereNotNull('delivery_date')
      .andWhere('delivery_date', '>=', iso(hoy))
      .andWhere('delivery_date', '<=', iso(hasta));
  } catch (_) { return { avisados: 0 }; }

  let avisados = 0;
  for (const inv of filas) {
    let ev = null;
    try { ev = await knex('portfolio_events').where({ id: inv.event_id }).first(); } catch (_) {}
    const r = await notify({
      type: 'inversion', userId: inv.user_id, channels: ['in-app', 'email'], eventId: inv.event_id,
      title: 'Se acerca la fecha de entrega de tu inversión',
      body: `La entrega de tu inversión${ev ? ` en ${ev.title}` : ''} está programada para el ${inv.delivery_date}.`
    }).catch(() => ({ recipients: 0 }));
    if (r.recipients) {
      await knex('investments').where({ id: inv.id }).update({ reminded_at: knex.fn.now() });
      avisados += r.recipients;
    }
  }
  if (avisados) console.log(`  ✓ Recordatorios de entrega enviados: ${avisados}`);
  return { avisados, revisadas: filas.length };
}

module.exports = { notify, notifyAdmins, recordarEntregas, TYPES, TYPE_KEYS, normChannels, normType, wantsType };
