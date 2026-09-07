/**
 * Feed iCal del calendario del inversionista.
 *
 * Es la alternativa a Google Calendar que **no necesita OAuth ni permisos**: el
 * inversionista pega una URL en su app de calendario (Google, Apple, Outlook) y
 * las fechas del evento le aparecen ahí, actualizándose solas.
 *
 * La URL lleva un **token propio de cada usuario**, porque las apps de calendario
 * no mandan cookies: no hay sesión con la que autenticar la petición. El token es
 * un HMAC del id del usuario con el secreto del panel, así que no se puede
 * adivinar ni fabricar, y se invalida solo si se cambia el secreto.
 */
const crypto = require('crypto');

const SECRET = process.env.PANEL_JWT_SECRET || process.env.SESSION_SECRET || 'panel-dev-secret-change-me';

/** Token estable por usuario: `<id>-<firma>`. */
function tokenPara(userId) {
  const firma = crypto.createHmac('sha256', SECRET).update('ical:' + userId).digest('hex').slice(0, 24);
  return `${userId}-${firma}`;
}

/** Devuelve el id del usuario si el token es legítimo, o null. */
function usuarioDe(token) {
  const m = String(token || '').match(/^(\d+)-([a-f0-9]{24})$/);
  if (!m) return null;
  const id = parseInt(m[1], 10);
  const esperado = tokenPara(id).split('-')[1];
  // Comparación en tiempo constante: comparar con === filtra por tiempo
  const a = Buffer.from(m[2]), b = Buffer.from(esperado);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  return id;
}

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n');
}

function dosDig(n) { return String(n).padStart(2, '0'); }

/** iCal parte las líneas a 75 octetos; si no, algunos clientes truncan. */
function plegar(linea) {
  if (linea.length <= 74) return linea;
  const trozos = [linea.slice(0, 74)];
  let resto = linea.slice(74);
  while (resto.length > 73) {
    trozos.push(' ' + resto.slice(0, 73));
    resto = resto.slice(73);
  }
  if (resto) trozos.push(' ' + resto);
  return trozos.join('\r\n');
}

/**
 * Arma el .ics.
 * @param {object} opts
 * @param {Array}  opts.actividades filas de `events`
 * @param {Array}  opts.etapas      filas de `milestones` con fecha
 * @param {string} opts.nombre      nombre del calendario
 * @param {string} opts.base        URL del sitio, para los enlaces
 */
function construir({ actividades = [], etapas = [], nombre = 'SOCCER iD', base = 'https://soccerid.co' }) {
  const ahora = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
  const L = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//SOCCER iD//Investor Hub//ES',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    `X-WR-CALNAME:${esc(nombre)}`,
    'X-WR-TIMEZONE:America/Mexico_City',
    // Cada 6 h: las fechas del evento no cambian cada minuto y así no se
    // castiga al servidor con clientes que refrescan sin parar.
    'REFRESH-INTERVAL;VALUE=DURATION:PT6H',
    'X-PUBLISHED-TTL:PT6H'
  ];

  actividades.forEach(a => {
    const fecha = `${a.year}${dosDig(a.month)}${dosDig(a.day)}`;
    const tipo = a.type === 'Otro' ? (a.custom_type || 'Otro') : a.type;
    L.push('BEGIN:VEVENT');
    L.push(`UID:actividad-${a.id}@soccerid.co`);
    L.push(`DTSTAMP:${ahora}`);
    if (/^\d{1,2}:\d{2}$/.test(String(a.time_label || ''))) {
      const [h, m] = a.time_label.split(':').map(Number);
      const ini = `${fecha}T${dosDig(h)}${dosDig(m)}00`;
      const fin = `${fecha}T${dosDig((h + 1) % 24)}${dosDig(m)}00`;
      L.push(`DTSTART;TZID=America/Mexico_City:${ini}`);
      L.push(`DTEND;TZID=America/Mexico_City:${fin}`);
    } else {
      const d = new Date(Date.UTC(a.year, a.month - 1, a.day + 1));
      L.push(`DTSTART;VALUE=DATE:${fecha}`);
      L.push(`DTEND;VALUE=DATE:${d.getUTCFullYear()}${dosDig(d.getUTCMonth() + 1)}${dosDig(d.getUTCDate())}`);
    }
    L.push(plegar(`SUMMARY:${esc(a.title)}`));
    const desc = [tipo, a.note].filter(Boolean).join(' · ');
    if (desc) L.push(plegar(`DESCRIPTION:${esc(desc)}`));
    L.push(plegar(`URL:${base}/panel/calendario`));
    L.push('END:VEVENT');
  });

  etapas.forEach(e => {
    const desde = String(e.start_date || e.end_date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(desde)) return;
    const fin = /^\d{4}-\d{2}-\d{2}$/.test(String(e.end_date || '')) ? e.end_date : desde;
    const d = new Date(fin + 'T00:00:00Z');
    d.setUTCDate(d.getUTCDate() + 1); // DTEND es exclusivo en eventos de día completo
    L.push('BEGIN:VEVENT');
    L.push(`UID:etapa-${e.id}@soccerid.co`);
    L.push(`DTSTAMP:${ahora}`);
    L.push(`DTSTART;VALUE=DATE:${desde.replace(/-/g, '')}`);
    L.push(`DTEND;VALUE=DATE:${d.toISOString().slice(0, 10).replace(/-/g, '')}`);
    L.push(plegar(`SUMMARY:${esc(e.title)}`));
    const desc = [e.description, e.owner].filter(Boolean).join(' · ');
    if (desc) L.push(plegar(`DESCRIPTION:${esc(desc)}`));
    L.push(plegar(`URL:${base}/panel/calendario#cronograma`));
    L.push('END:VEVENT');
  });

  L.push('END:VCALENDAR');
  return L.join('\r\n') + '\r\n';
}

/**
 * Enlace "Agregar a mi Google Calendar" para UNA actividad.
 * Es una URL normal de Google: no pide permisos ni conecta nada, solo abre el
 * formulario de evento con los datos ya puestos.
 */
function enlaceGoogle(a, base = 'https://soccerid.co') {
  const fecha = `${a.year}${dosDig(a.month)}${dosDig(a.day)}`;
  let cuando;
  if (/^\d{1,2}:\d{2}$/.test(String(a.time_label || ''))) {
    const [h, m] = a.time_label.split(':').map(Number);
    cuando = `${fecha}T${dosDig(h)}${dosDig(m)}00/${fecha}T${dosDig((h + 1) % 24)}${dosDig(m)}00`;
  } else {
    const d = new Date(Date.UTC(a.year, a.month - 1, a.day + 1));
    cuando = `${fecha}/${d.getUTCFullYear()}${dosDig(d.getUTCMonth() + 1)}${dosDig(d.getUTCDate())}`;
  }
  const tipo = a.type === 'Otro' ? (a.custom_type || 'Otro') : a.type;
  const p = new URLSearchParams({
    action: 'TEMPLATE',
    text: a.title,
    dates: cuando,
    details: [tipo, a.note, `${base}/panel/calendario`].filter(Boolean).join('\n'),
    ctz: 'America/Mexico_City'
  });
  return `https://calendar.google.com/calendar/render?${p.toString()}`;
}

module.exports = { tokenPara, usuarioDe, construir, enlaceGoogle };
