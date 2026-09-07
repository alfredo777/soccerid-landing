/**
 * Panel de inversionistas / patrocinadores — Fase 2
 * Login por invitación + base de datos + panel del dueño (admin).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const multer = require('multer');
const knex = require('../db/knex');
const auth = require('../lib/panelAuth');
const { sendInvite, sendNotification } = require('../lib/panelMailer');
const { sendLeadEmail } = require('../lib/project2027');
const { uploadImage, uploadDocument } = require('../lib/uploads');
const { getDashboardConfig, saveDashboardConfig, computeReturn } = require('../lib/panelSettings');
const { notify, notifyAdmins, TYPES: NOTIF_TYPES } = require('../lib/panelNotify');
const panelSms = require('../lib/panelSms');
const codeMap = require('../lib/codeMap');
const turnstile = require('../lib/turnstile');
const google = require('../lib/googleAuth');

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024 } });

const CONFIG_PATH = path.join(__dirname, '..', 'contents', 'panel_config.json');
function loadConfig() {
  return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
}

const MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const MONTHS_ES_CAP = MONTHS_ES.map(m => m.charAt(0).toUpperCase() + m.slice(1));

function formatUSD(n) {
  return 'USD $' + Number(n || 0).toLocaleString('en-US');
}
function initialsOf(name) {
  const parts = (name || '').trim().split(/\s+/);
  return ((parts[0] || '')[0] || '' ).concat((parts[1] || '')[0] || '').toUpperCase() || 'U';
}
function monthYear(dateVal) {
  const d = dateVal ? new Date(dateVal) : new Date();
  return `${MONTHS_ES_CAP[d.getMonth()]} ${d.getFullYear()}`;
}
function safeParse(str, fallback) {
  try { return JSON.parse(str); } catch (_) { return fallback; }
}
// Fecha corta para sellos de trazabilidad: "2026-08-24" → "24 ago 2026"
const MONTHS_ES_SHORT = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
function shortDate(str) {
  if (!str) return '';
  const d = new Date(String(str) + 'T12:00:00');
  if (isNaN(d)) return String(str);
  return `${d.getDate()} ${MONTHS_ES_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// Renderiza el texto de la presentación a HTML seguro (escapa; soporta párrafos,
// "## " títulos y "- " viñetas). El contenido se escapa antes de armar el HTML.
function renderPresentation(text) {
  if (!text) return '';
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return String(text).split(/\n{2,}/).map((block) => {
    const lines = block.split('\n');
    if (lines.length && lines.every(l => /^\s*-\s+/.test(l))) {
      return '<ul>' + lines.map(l => '<li>' + esc(l.replace(/^\s*-\s+/, '')) + '</li>').join('') + '</ul>';
    }
    if (/^\s*##\s+/.test(block)) return '<h3>' + esc(block.replace(/^\s*##\s+/, '').trim()) + '</h3>';
    return '<p>' + esc(block).replace(/\n/g, '<br>') + '</p>';
  }).join('');
}

// ── Ediciones: parseo de textareas "a | b | c" (una por línea) ↔ arreglo de objetos ──
const ED_KEYS = {
  stats: ['value', 'label', 'sub'],
  sponsors: ['src', 'alt'],
  media: ['title', 'source', 'url', 'image'],
  videos: ['id', 'title'],
  images: ['src', 'alt']
};
function edSplit(text) { return (text || '').split('\n').map(s => s.trim()).filter(Boolean); }
function edParse(text, keys) {
  return edSplit(text).map(line => {
    const p = line.split('|').map(x => x.trim());
    const o = {}; keys.forEach((k, i) => { o[k] = p[i] || ''; });
    return o;
  });
}
function edJoin(arr, keys) {
  return (arr || []).map(o => keys.map(k => o[k] || '').join(' | ')).join('\n');
}

// El formulario nuevo manda cada colección como JSON en un input oculto (filas
// repetibles). Se sigue aceptando el formato viejo de tuberías por si queda un
// formulario en caché o alguien pega el texto a mano.
function edFromJson(raw, keys) {
  let arr;
  try { arr = JSON.parse(raw); } catch (_) { return null; }
  if (!Array.isArray(arr)) return null;
  return arr.map(item => {
    const o = {};
    keys.forEach(k => { o[k] = String((item && item[k]) == null ? '' : item[k]).trim(); });
    return o;
  }).filter(o => keys.some(k => o[k]));   // fuera las filas que quedaron vacías
}
function edCollection(body, name, keys) {
  const desdeJson = body[name + '_json'] !== undefined ? edFromJson(body[name + '_json'], keys) : null;
  return desdeJson === null ? edParse(body[name], keys) : desdeJson;
}

function buildEditionData(body) {
  const shared = {
    year: (body.year || '').trim(),
    match: (body.match || '').trim(),
    // Una sola fecha para la edición: el formulario unificado manda `event_date`.
    date: (body.date || body.event_date || '').trim(),
    city: (body.city || '').trim(),
    venue: (body.venue || '').trim(),
    banner: (body.banner || '').trim(),
    sponsors: edCollection(body, 'sponsors', ED_KEYS.sponsors),
    videos: edCollection(body, 'videos', ED_KEYS.videos),
    images: edCollection(body, 'images', ED_KEYS.images)
  };
  const es = Object.assign({}, shared, {
    title: (body.title_es || '').trim(),
    description: (body.description_es || '').trim(),
    attendance: { value: (body.att_value || '').trim(), label: (body.att_label_es || '').trim() },
    stats: edCollection(body, 'stats_es', ED_KEYS.stats),
    mediaLinks: edCollection(body, 'media_es', ED_KEYS.media)
  });
  const en = Object.assign({}, shared, {
    title: (body.title_en || body.title_es || '').trim(),
    description: (body.description_en || '').trim(),
    attendance: { value: (body.att_value || '').trim(), label: (body.att_label_en || '').trim() },
    stats: edCollection(body, 'stats_en', ED_KEYS.stats),
    mediaLinks: edCollection(body, 'media_en', ED_KEYS.media)
  });
  return { data_es: JSON.stringify(es), data_en: JSON.stringify(en) };
}

// Año de la edición: 4 dígitos y dentro de un rango con sentido. Un año mal
// escrito ordena mal el timeline público y no se nota hasta que alguien lo ve.
function edValidYear(v) {
  const y = String(v == null ? '' : v).trim();
  if (!/^\d{4}$/.test(y)) return null;
  const n = parseInt(y, 10);
  return (n >= 2000 && n <= 2100) ? y : null;
}

// Categorías (tiers) desde la base de datos
async function getTiers() {
  const rows = await knex('tiers').orderBy([{ column: 'role' }, { column: 'sort' }]);
  return rows.map(r => ({
    id: r.id, key: r.key, role: r.role, label: r.label, color: r.color, bg: r.bg,
    amount: r.amount, count: r.count, benefits: safeParse(r.benefits, [])
  }));
}
function findTier(tiers, role, key) {
  return tiers.find(t => t.role === role && t.key === key) || null;
}

// Notificaciones dirigidas a un usuario: las de su audiencia (sin destinatario
// individual) más las **directas** que le mandaron a él. Nunca las de otro usuario.
async function notificationsForUser(user) {
  const rows = await knex('notifications')
    .where((q) => {
      q.whereNull('user_id').andWhere((a) => a.where('audience', 'all').orWhere('audience', user.role));
    })
    .orWhere('user_id', user.id)
    .orderBy('id', 'desc');
  const seenId = user.notifications_seen_id || 0;
  const unread = rows.filter(n => n.id > seenId).length;
  return { rows, unread };
}

// ── Ensambla el objeto `panel` para un usuario (inversionista/patrocinador) ──
async function buildPanelData(user, opts = {}) {
  const config = loadConfig();
  const cfg = await getDashboardConfig();
  const tiers = await getTiers();
  const isSponsor = user.role === 'sponsor';
  const tier = findTier(tiers, user.role, user.category) || { label: user.category || '—', color: '#6C3CE0', bg: '#EFE9FC', benefits: [] };

  // La edición que ve el inversionista la decide el ADMIN (config `activeEditionId`),
  // no cada usuario: no hay selector de edición en el panel. Si no está configurada,
  // se toma la de mayor año, que es la que está en curso.
  let invEvent = null, otherEditions = [];
  try {
    const editionRows = await knex('portfolio_events').orderBy([{ column: 'year', order: 'desc' }, { column: 'id', order: 'desc' }]);
    const elegida = editionRows.find(e => String(e.id) === String(cfg.activeEditionId));
    invEvent = elegida || editionRows[0] || null;
    // Panorámica de las demás ediciones: solo lectura, sin nada de inversión.
    otherEditions = editionRows.filter(e => !invEvent || e.id !== invEvent.id).map(e => ({
      year: e.year || '', title: e.title, match: e.match || '',
      venue: e.venue || '', city: e.city || '', dateLabel: e.event_date || '',
      subtitle: e.subtitle || '', accent: e.accent || '#8A8F98'
    }));
  } catch (_) {}

  // Inversión del usuario EN esa edición. Alimenta el cálculo SIN cambiar la fórmula:
  // capital/modalidad/retorno vienen de la inversión y se pasan a computeReturn
  // (return_pct actúa como el override return_rate). Si no tiene inversión en la
  // edición activa, se cae a los datos de su cuenta, como cuando no hay inversiones.
  let investment = null;
  try {
    if (invEvent) {
      investment = await knex('investments').where({ user_id: user.id, event_id: invEvent.id })
        .orderByRaw("CASE state WHEN 'activa' THEN 0 ELSE 1 END")
        .orderBy([{ column: 'sort' }, { column: 'id' }]).first() || null;
    }
  } catch (_) {}
  const investsHere = !!investment;
  const effUser = investment ? Object.assign({}, user, {
    amount: investment.capital, investment_type: investment.modality, return_rate: investment.return_pct
  }) : user;

  const amountLabel = formatUSD(effUser.amount);
  const ret = computeReturn(effUser, cfg); // retorno según tipo de inversión (con override por cuenta)

  // ── Overrides por cuenta: si están definidos, tienen prioridad sobre lo global/categoría ──
  const advOverride = safeParse(user.advisor, null);
  const advisor = (advOverride && advOverride.name) ? Object.assign({}, advOverride, {
    initials: initialsOf(advOverride.name)
  }) : cfg.advisor;
  const benefitsOverride = safeParse(user.benefits, null);
  const resolvedBenefits = (Array.isArray(benefitsOverride) && benefitsOverride.length) ? benefitsOverride : (tier.benefits || []);
  const activationsText = (user.activations && String(user.activations).trim()) ? String(user.activations).trim() : 'Incluidas';
  // Fecha corta del evento para el subtítulo del contador (ej. "27 marzo 2027")
  const evShort = (() => {
    try {
      const d = new Date((cfg.eventDate || '2027-03-27') + 'T12:00:00');
      return `${d.getDate()} ${MONTHS_ES[d.getMonth()]} ${d.getFullYear()}`;
    } catch (_) { return cfg.eventLabel || ''; }
  })();

  const panelUser = {
    name: user.name,
    firstName: (user.name || '').split(/\s+/)[0],
    initials: initialsOf(user.name),
    role: user.role,
    category: user.category,
    categoryLabel: (tier.label || '').toUpperCase(),
    color: tier.color,
    bg: tier.bg,
    amount: amountLabel,
    memberId: user.member_id || '—',
    since: monthYear(user.created_at),
    projectedReturn: ret.projectedReturn,
    returnPct: ret.returnPct,
    returnMetaLabel: ret.returnMetaLabel,
    investmentType: ret.type,
    investmentTypeLabel: ret.typeLabel,
    isRisk: ret.isRisk,
    effectiveSharePct: ret.effectiveSharePct || null
  };

  const stats = isSponsor ? [
    { label: 'Monto patrocinado', value: amountLabel, icon: 'wallet', accent: '#6C3CE0' },
    { label: 'Categoría', value: tier.label, sub: 'Patrocinador', icon: 'diamond', accent: '#14141B' },
    { label: 'Activaciones', value: activationsText, sub: 'Según categoría', icon: 'trend', accent: '#14141B' },
    { label: 'Faltan para el partido', value: '—', sub: evShort, icon: 'clock', accent: '#14141B', countdown: true }
  ] : [
    { label: 'Monto invertido', value: amountLabel, icon: 'wallet', accent: '#6C3CE0' },
    { label: 'Retorno proyectado', value: ret.projectedReturn, sub: ret.returnPct, icon: 'trend', accent: '#14141B' },
    { label: 'Tu categoría', value: tier.label, sub: ret.typeLabel, icon: 'diamond', accent: '#6C3CE0' },
    { label: 'Faltan para el partido', value: '—', sub: evShort, icon: 'clock', accent: '#14141B', countdown: true }
  ];

  // Distribución (estructura planeada del cupo) + donut
  const distribution = tiers.filter(t => t.role === 'investor').map(t => ({ label: t.label, count: t.count, color: t.color }));
  const total = distribution.reduce((s, d) => s + d.count, 0);
  const C = 2 * Math.PI * 54;
  let cum = 0;
  const donut = distribution.map(d => {
    const frac = total ? d.count / total : 0;
    const seg = { color: d.color, len: Math.round(frac * C * 100) / 100, angle: Math.round((cum / total) * 360 * 100) / 100 - 90 };
    cum += d.count;
    return seg;
  });

  // Noticias
  const newsRows = await knex('news').orderBy([{ column: 'featured', order: 'desc' }, { column: 'sort', order: 'asc' }, { column: 'id', order: 'asc' }]);
  const news = newsRows.map(n => ({
    id: n.id, tag: n.tag, tagColor: n.tag_color, title: n.title, excerpt: n.excerpt,
    image: n.image, date: n.date_label, size: n.size, featured: !!n.featured
  }));

  // Categorias presentes en las noticias: alimentan los chips de filtro para que
  // siempre coincidan con lo que el admin publica (no una lista fija).
  const newsTags = [...new Set(news.map(n => n.tag).filter(Boolean))];

  // Etapas del cronograma de la edición activa. Las que no tienen edición son de
  // antes de que el cronograma se separara por año: se siguen mostrando, si no el
  // panel se habría quedado vacío de golpe al migrar.
  const soloDeLaEdicion = (q) => q.where(function () {
    this.whereNull('event_id');
    if (invEvent) this.orWhere('event_id', invEvent.id);
  });
  const mileRows = await soloDeLaEdicion(knex('milestones'))
    .orderBy([{ column: 'sort', order: 'asc' }, { column: 'id', order: 'asc' }]);
  const MILE_STATUS = { completado: 'Completado', en_curso: 'En curso', pendiente: 'Pendiente' };
  const milestones = mileRows.map(m => {
    const status = m.status || (m.done ? 'completado' : 'pendiente');
    return {
      title: m.title, date: m.date_label, done: status === 'completado', inProgress: status === 'en_curso',
      highlight: !!m.highlight, owner: m.owner || '', status, statusLabel: MILE_STATUS[status] || 'Pendiente',
      description: m.description || '', startDate: m.start_date || '', endDate: m.end_date || ''
    };
  });

  // Calendario: mes solicitado; por defecto el MES ACTUAL
  const _now = new Date();
  const fmonth = (opts.calMonth >= 1 && opts.calMonth <= 12) ? opts.calMonth : (_now.getMonth() + 1);
  const fyear = (opts.calYear >= 2000 && opts.calYear <= 2100) ? opts.calYear : _now.getFullYear();
  const evRows = await soloDeLaEdicion(knex('events').where({ month: fmonth, year: fyear })).orderBy('day');
  const events = evRows.map(e => ({
    day: e.day, title: e.title,
    // Si el tipo es "Otro", lo que importa es lo que escribió el organizador
    type: e.type === 'Otro' ? (e.custom_type || 'Otro') : e.type,
    color: e.color, match: !!e.is_match,
    time: e.time_label || '', note: e.note || ''
  }));
  const firstWeekday = new Date(fyear, fmonth - 1, 1).getDay();
  const daysInMonth = new Date(fyear, fmonth, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ empty: true });
  for (let day = 1; day <= daysInMonth; day++) {
    const dayEvents = events.filter(e => e.day === day);
    cells.push({ day, events: dayEvents, match: dayEvents.some(e => e.match) });
  }

  // Agenda del día del partido: vive en la base y pertenece a la edición. Antes
  // salía de panel_config.json, que en Heroku ni siquiera sobrevive al deploy.
  let matchAgenda = [];
  try {
    const agRows = await soloDeLaEdicion(knex('match_agenda')).orderBy([{ column: 'sort' }, { column: 'id' }]);
    matchAgenda = agRows.map(a => ({
      time: a.time_label || '', title: a.title, sub: a.sub || '', color: a.color || '#6C3CE0'
    }));
  } catch (_) {}
  if (!matchAgenda.length) matchAgenda = config.matchAgenda || [];

  const notifs = await notificationsForUser(user);

  // Documentos personalizados del usuario (contratos y documentos legales)
  const docRows = await knex('user_documents').where({ user_id: user.id }).orderBy('id', 'desc');
  const userDocuments = docRows.map(d => ({
    id: d.id, name: d.name, url: d.url, meta: d.meta, ext: d.ext,
    category: d.category || 'General', docDate: shortDate(d.doc_date)
  }));
  // Agrupados por categoría para la página de documentos
  const DOC_CATS = ['Legal', 'Financiero', 'Evidencia', 'General'];
  const documentGroups = DOC_CATS
    .map(cat => ({ category: cat, docs: userDocuments.filter(d => d.category === cat) }))
    .filter(g => g.docs.length);

  // ── Ventas y punto de equilibrio ──
  const capacity = Number(cfg.capacity) || 21800;
  const ticketPrice = Number(cfg.ticketPrice) || 100;
  const projectCost = Number(cfg.projectCost) || 1000000;
  const breakEven = Number(cfg.breakEvenTickets) > 0 ? Number(cfg.breakEvenTickets) : Math.round(projectCost / (ticketPrice || 1));
  const ticketsSold = Math.max(0, Number(cfg.ticketsSold) || 0);
  const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
  const sales = {
    sold: ticketsSold,
    soldLabel: ticketsSold.toLocaleString('es-MX'),
    capacity, capacityLabel: capacity.toLocaleString('es-MX'),
    breakEven, breakEvenLabel: breakEven.toLocaleString('es-MX'),
    occupancyPct: capacity ? clamp((ticketsSold / capacity) * 100) : 0,
    soldPct: capacity ? clamp((ticketsSold / capacity) * 100) : 0,
    breakEvenPct: capacity ? clamp((breakEven / capacity) * 100) : 0,
    boxOffice: formatUSD(ticketsSold * ticketPrice),
    goalBoxOffice: formatUSD(capacity * ticketPrice),
    pastBreakEven: ticketsSold >= breakEven,
    toBreakEven: Math.max(0, breakEven - ticketsSold),
    toBreakEvenLabel: Math.max(0, breakEven - ticketsSold).toLocaleString('es-MX'),
    updated: shortDate(cfg.salesUpdated),
    source: cfg.returnSource || ''
  };

  // ── Uso del capital ──
  const capRows = await knex('capital_items').orderBy([{ column: 'sort' }, { column: 'id' }]);
  const capitalItems = capRows.map(c => {
    const budget = Number(c.budget) || 0, spent = Number(c.spent) || 0;
    return {
      id: c.id, label: c.label, note: c.note || '', source: c.source || '',
      budget, spent, budgetLabel: formatUSD(budget), spentLabel: formatUSD(spent),
      pct: budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0
    };
  });
  const totalBudget = capitalItems.reduce((s, c) => s + c.budget, 0);
  const totalSpent = capitalItems.reduce((s, c) => s + c.spent, 0);
  // Capital comprometido = suma de aportaciones de inversionistas activos
  const raisedRow = await knex('users').where({ role: 'investor', status: 'active' }).sum({ s: 'amount' }).first();
  const capitalRaised = Number(raisedRow && raisedRow.s) || 0;
  const capital = {
    items: capitalItems,
    totalBudget: formatUSD(totalBudget), totalSpent: formatUSD(totalSpent),
    spentPct: totalBudget ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0,
    raised: formatUSD(capitalRaised), hasRaised: capitalRaised > 0,
    budgetVsRaisedPct: capitalRaised ? Math.min(100, Math.round((totalBudget / capitalRaised) * 100)) : 0
  };

  // ── Riesgos ──
  const RISK_COLOR = { alto: '#C0392B', medio: '#C79A2E', bajo: '#1E8E5A' };
  const RISK_LEVEL = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' };
  const RISK_STATUS = { abierto: 'Abierto', monitoreo: 'En monitoreo', mitigado: 'Mitigado' };
  const riskRows = await knex('risks').orderBy([{ column: 'sort' }, { column: 'id' }]);
  const risks = riskRows.map(r => ({
    id: r.id, title: r.title, mitigation: r.mitigation || '',
    level: r.level, levelLabel: RISK_LEVEL[r.level] || 'Medio', color: RISK_COLOR[r.level] || '#C79A2E',
    status: r.status, statusLabel: RISK_STATUS[r.status] || 'En monitoreo'
  }));

  // Fecha/hora del evento para el contador (desde la config editable)
  const eventDateISO = `${cfg.eventDate || '2027-03-27'}T${cfg.eventTime || '19:00'}:00-05:00`;

  // ── Simulador "Escenario por asistencia" (solo participación a riesgo) ──
  // Ejercicio ilustrativo; NO sustituye a computeReturn (que da las cifras oficiales).
  const se = invEvent || {};
  const simulator = ret.isRisk ? {
    capital: Number(effUser.amount) || 0,
    budget: Number(se.budget || cfg.projectCost) || 0,
    capacity: Number(se.capacity || cfg.capacity) || 21800,
    ticketPrice: Number(se.ticket_price || cfg.ticketPrice) || 100,
    deductionsPct: se.deductions_pct != null ? Number(se.deductions_pct) : 15,
    rebatePer: se.rebate_per != null ? Number(se.rebate_per) : 5,
    capPct: se.cap_pct != null ? Number(se.cap_pct) : 50,
    split: Number(se.investor_split || cfg.investorSplit) || 50,
    // Retorno pactado del perfil (viene de computeReturn — NO se recalcula aquí)
    profitLabel: ret.profit
  } : null;
  // Desempeño del evento (para la modalidad a riesgo)
  const eventPerf = (ret.isRisk && invEvent) ? {
    title: invEvent.title,
    budget: formatUSD(invEvent.budget),
    projectedIncome: formatUSD(invEvent.projected_income),
    progress: invEvent.progress_pct
  } : null;

  // Paquetes disponibles para el inversionista: generales del evento + privados suyos
  let packages = [];
  if (invEvent) {
    const MOD_LBL = { fijo: 'Retorno fijo', riesgo: 'Participación a riesgo', patrocinio: 'Patrocinio' };
    const pkRows = await knex('event_packages').where({ event_id: invEvent.id, is_active: true })
      .andWhere(function () { this.whereNull('user_id').orWhere('user_id', user.id); })
      .orderBy([{ column: 'sort' }, { column: 'id' }]);
    packages = pkRows.map(p => ({
      name: p.name,
      modality: p.modality,
      modalityLabel: MOD_LBL[p.modality] || p.modality,
      amountLabel: formatUSD(p.amount || 0),
      returnPct: p.return_pct || 0,
      benefits: (p.benefits || '').split('\n').map(s => s.trim()).filter(Boolean),
      isPrivate: !!p.user_id,
      isMine: p.modality === ret.type
    }));
  }

  // Data room de la edición: documentos visibles para el inversionista (all + su modalidad),
  // agrupados por carpeta, con estatus.
  let dataRoom = [], dataRoomCount = 0;
  if (invEvent) {
    const DOC_ST = { revision: 'En revisión', aprobado: 'Aprobado', firmado: 'Firmado' };
    const drRows = await knex('event_documents').where({ event_id: invEvent.id })
      .andWhere(function () { this.where('visibility', 'all').orWhere('visibility', ret.type); })
      .orderBy([{ column: 'sort' }, { column: 'id' }]);
    dataRoomCount = drRows.length;
    const byFolder = {};
    drRows.forEach(d => {
      (byFolder[d.folder] = byFolder[d.folder] || []).push({
        name: d.name, url: d.url || '', status: d.status, statusLabel: DOC_ST[d.status] || d.status
      });
    });
    dataRoom = Object.keys(byFolder).map(f => ({ folder: f, docs: byFolder[f] }));
  }

  // Video tour de bienvenida (por modalidad) + onboarding la primera vez
  const isInvestor = user.role === 'investor';
  const tour = isInvestor ? {
    modality: ret.type,
    label: ret.typeLabel,
    video: `/assets/videos/onboarding/tour-${ret.type}-web.mp4`,
    videoMobile: `/assets/videos/onboarding/tour-${ret.type}-mobile.mp4`
  } : null;
  // Onboarding de primer login DESACTIVADO (a pedido): el video queda solo en el
  // menú "Video tour" (lightbox/drawer). Se conserva el código por si se reactiva.
  const showOnboarding = false;

  // Presentación de la edición (la que ve el inversionista)
  const presentation = invEvent ? renderPresentation(invEvent.presentation_es) : '';
  const presentationTitle = invEvent ? invEvent.title : '';

  // Edición activa tal como se le presenta al inversionista (solo lectura)
  const activeEdition = invEvent ? {
    year: invEvent.year || '', title: invEvent.title, match: invEvent.match || '',
    venue: invEvent.venue || '', city: invEvent.city || '', dateLabel: invEvent.event_date || '',
    accent: invEvent.accent || '#6C3CE0', investsHere
  } : null;

  // FAQ visible para este usuario (general + su rol)
  let faqs = [];
  try {
    const faqRows = await knex('faqs').where({ is_active: true })
      .andWhere(function () { this.where('audience', 'all').orWhere('audience', user.role); })
      .orderBy([{ column: 'sort' }, { column: 'id' }]);
    faqs = faqRows.map(f => ({ question: f.question, answer: f.answer || '' }));
  } catch (_) {}

  // Perfil editable por el propio usuario (drawer "Mi perfil").
  const profile = {
    name: user.name || '',
    email: user.email || '',
    language: user.language === 'en' ? 'en' : 'es',
    phone: user.phone || '',
    phoneExtra: user.phone_extra || '',
    emailExtra: user.email_extra || '',
    assistantEmail: user.assistant_email || '',
    assistantPhone: user.assistant_phone || '',
    // Por defecto el correo va encendido y el SMS apagado (aun no hay proveedor).
    notifyEmail: user.notify_email == null ? true : !!user.notify_email,
    notifySms: !!user.notify_sms
  };

  // Indice del buscador de la barra superior. El FAQ va primero a proposito:
  // es lo que mas se busca y lo que responde dudas sin abrir otra seccion.
  const searchIndex = [];
  faqs.forEach(f => searchIndex.push({
    g: 'Preguntas frecuentes', t: f.question, s: String(f.answer).slice(0, 120), u: '/panel/faq'
  }));
  news.forEach(n => searchIndex.push({
    g: 'Noticias', t: n.title, s: [n.tag, n.date].filter(Boolean).join(' · '), u: '/panel/noticias/' + n.id
  }));
  milestones.forEach(m => searchIndex.push({
    g: 'Cronograma', t: m.title, s: [m.date, m.statusLabel].filter(Boolean).join(' · '), u: '/panel/calendario#cronograma'
  }));
  [
    { t: 'Inicio', s: 'Resumen de tu inversión', u: '/panel' },
    { t: 'Estado del evento', s: 'Avances, anuncios y prensa', u: '/panel/noticias' },
    { t: 'Notificaciones', s: 'Avisos y comunicaciones', u: '/panel/notificaciones' },
    { t: 'Calendario', s: 'Fechas clave del evento', u: '/panel/calendario' },
    { t: 'Cronograma', s: 'Hitos del proyecto', u: '/panel/calendario#cronograma' },
    { t: 'Documentos', s: 'Data room y contratos', u: '/panel/documentos' },
    { t: 'Presentación', s: 'Propuesta de la edición', u: '/panel/presentacion' },
    { t: 'Ediciones', s: 'Edición en curso e historial', u: '/panel/ediciones' }
  ].concat(faqs.length ? [{ t: 'Preguntas frecuentes', s: 'Dudas comunes', u: '/panel/faq' }] : [])
    .forEach(x => searchIndex.push(Object.assign({ g: 'Secciones' }, x)));

  return {
    simulator,
    eventPerf,
    activeEdition,
    otherEditions,
    packages,
    dataRoom,
    dataRoomCount,
    presentation,
    presentationTitle,
    faqs,
    profile,
    searchIndex,
    tour,
    showOnboarding,
    org: config.org,
    eventLabel: cfg.eventLabel || config.eventLabel,
    eventDateISO,
    unread: notifs.unread,
    advisor: advisor,
    documents: userDocuments,
    userDocuments,
    documentGroups,
    sharedFolder: cfg.sharedFolder || null,
    user: panelUser,
    userBenefits: resolvedBenefits,
    // Etapa actual del proyecto (banda de estado)
    stage: {
      label: cfg.stageLabel || '', step: cfg.stageStep, total: cfg.stageTotal,
      note: cfg.stageNote || '', pct: (cfg.stageTotal ? Math.round((Number(cfg.stageStep) / Number(cfg.stageTotal)) * 100) : 0),
      updated: shortDate(cfg.stageUpdated)
    },
    // Sello de trazabilidad para las cifras de inversión
    trace: { source: cfg.returnSource || '', updated: shortDate(cfg.returnUpdated) },
    sales,
    capital,
    risks,
    stats,
    distribution,
    donut,
    donutC: Math.round(C * 100) / 100,
    investorTotal: total,
    news,
    newsTags,
    milestones,
    calendarCells: cells,
    calendar: {
      monthLabel: MONTHS_ES_CAP[fmonth - 1],
      year: String(fyear),
      prev: { y: fmonth === 1 ? fyear - 1 : fyear, m: fmonth === 1 ? 12 : fmonth - 1 },
      next: { y: fmonth === 12 ? fyear + 1 : fyear, m: fmonth === 12 ? 1 : fmonth + 1 },
      agendaDate: config.matchAgendaDate,
      agenda: matchAgenda
    }
  };
}

// Panel mínimo para vistas de admin (sin categoría)
function buildAdminPanel(user) {
  const config = loadConfig();
  return {
    org: config.org,
    eventLabel: config.eventLabel,
    user: {
      firstName: (user.name || 'Admin').split(/\s+/)[0],
      initials: initialsOf(user.name),
      role: 'admin',
      categoryLabel: 'ADMIN',
      color: '#14141B'
    }
  };
}

// ════════════════════════════════════════════════
// AUTENTICACIÓN
// ════════════════════════════════════════════════
router.get('/login', async (req, res) => {
  const user = await auth.getUserFromRequest(req);
  if (user) return res.redirect(user.role === 'admin' ? '/panel/admin' : '/panel');
  res.render('panel/login', { layout: false, error: req.query.error, ok: req.query.ok, googleEnabled: google.enabled() });
});

router.post('/login', async (req, res) => {
  // Verificación anti-bot (Cloudflare Turnstile). Si no hay secret configurado, se omite.
  const tsToken = req.body['cf-turnstile-response'];
  const clientIp = (req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.ip;
  const tsOk = await turnstile.verify(tsToken, clientIp, 'login');
  if (!tsOk) return res.redirect('/panel/login?error=captcha');

  const email = (req.body.email || '').trim().toLowerCase();
  const password = req.body.password || '';
  const user = await knex('users').where({ email }).first();
  if (!user || user.status !== 'active' || !auth.verifyPassword(password, user.password_hash)) {
    return res.redirect('/panel/login?error=1');
  }
  auth.issueSession(res, user);
  res.redirect(user.role === 'admin' ? '/panel/admin' : '/panel');
});

router.get('/logout', (req, res) => { auth.clearSession(res); res.redirect('/panel/login'); });
router.post('/logout', (req, res) => { auth.clearSession(res); res.redirect('/panel/login'); });

// ── Login con Google (acceso por invitación + Gmail) ──
router.get('/auth/google', (req, res) => {
  if (!google.enabled()) return res.redirect('/panel/login?error=1');
  const state = google.makeState();
  res.cookie('g_state', state, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 10 * 60 * 1000 });
  res.redirect(google.authUrl(state));
});

router.get('/auth/google/callback', async (req, res) => {
  try {
    if (!google.enabled()) return res.redirect('/panel/login?error=1');
    const { code, state } = req.query;
    const saved = req.cookies ? req.cookies.g_state : null;
    res.clearCookie('g_state');
    if (!code || !state || state !== saved) return res.redirect('/panel/login?error=google');
    const profile = await google.exchangeAndVerify(code);
    if (!profile.email || !profile.emailVerified) return res.redirect('/panel/login?error=google');
    // Contraste con la invitación: el correo de Google debe existir en users (no admin)
    const user = await knex('users').whereRaw('LOWER(email) = ?', [profile.email]).first();
    if (!user || user.role === 'admin') return res.redirect('/panel/login?error=noinvite');
    await knex('users').where({ id: user.id }).update({
      google_sub: profile.sub, status: 'active',
      invite_token: null, invite_expires: null, updated_at: knex.fn.now()
    });
    const fresh = await knex('users').where({ id: user.id }).first();
    auth.issueSession(res, fresh);
    res.redirect('/panel');
  } catch (e) { res.redirect('/panel/login?error=google'); }
});

// Activación (crear contraseña desde invitación)
router.get('/activar/:token', async (req, res) => {
  const user = await knex('users').where({ invite_token: req.params.token }).first();
  if (!user || (user.invite_expires && Number(user.invite_expires) < Date.now())) {
    return res.render('panel/activar', { layout: false, invalid: true });
  }
  res.render('panel/activar', { layout: false, token: req.params.token, name: user.name, email: user.email });
});

router.post('/activar/:token', async (req, res) => {
  const user = await knex('users').where({ invite_token: req.params.token }).first();
  if (!user || (user.invite_expires && Number(user.invite_expires) < Date.now())) {
    return res.render('panel/activar', { layout: false, invalid: true });
  }
  const pass = req.body.password || '';
  if (pass.length < 8 || pass !== req.body.password2) {
    return res.render('panel/activar', { layout: false, token: req.params.token, name: user.name, email: user.email, error: 'Las contraseñas no coinciden o son muy cortas (mínimo 8 caracteres).' });
  }
  await knex('users').where({ id: user.id }).update({
    password_hash: auth.hashPassword(pass),
    status: 'active',
    invite_token: null,
    invite_expires: null,
    updated_at: knex.fn.now()
  });
  const fresh = await knex('users').where({ id: user.id }).first();
  auth.issueSession(res, fresh);
  res.redirect('/panel');
});

// ════════════════════════════════════════════════
// VISTAS DEL PANEL (requieren sesión)
// ════════════════════════════════════════════════
router.get('/', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
    res.render('panel/dashboard', {
      layout: 'panel',
      title: (req.panelUser.role === 'sponsor' ? 'Mi patrocinio' : 'Mi inversión') + ' · SOCCER iD Investor Hub',
      pageHeading: `Hola, ${req.panelUser.name.split(/\s+/)[0]} 👋`,
      pageSub: req.panelUser.role === 'sponsor'
        ? 'Tu patrocinio en SOCCER iD CUP 2027, con cada etapa y cada activación a la vista'
        : 'Tu inversión en SOCCER iD CUP 2027, con cada etapa y cada cifra a la vista',
      active: 'dashboard',
      flash: req.query.msg || '',
      flashType: req.query.type === 'error' ? 'error' : 'ok',
      panel: await buildPanelData(req.panelUser)
    });
  } catch (e) { next(e); }
});

router.get('/noticias', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin#noticias');
    res.render('panel/noticias', {
      layout: 'panel',
      title: 'Noticias · SOCCER iD Investor Hub',
      pageHeading: 'Estado del evento',
      pageSub: 'Avances, anuncios y prensa de SOCCER iD CUP 2027, conforme suceden',
      active: 'noticias',
      panel: await buildPanelData(req.panelUser)
    });
  } catch (e) { next(e); }
});

// Vista de lectura de una noticia (inversionistas y patrocinadores)
router.get('/noticias/:id', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin#noticias');
    const n = await knex('news').where({ id: req.params.id }).first();
    if (!n) return res.redirect('/panel/noticias');
    const article = {
      id: n.id, tag: n.tag, tagColor: n.tag_color, title: n.title,
      excerpt: n.excerpt, body: n.body || '', image: n.image, date: n.date_label,
      sourceUrl: n.source_url || ''
    };
    res.render('panel/noticia', {
      layout: 'panel',
      title: `${n.title} · SOCCER iD Investor Hub`,
      pageHeading: 'Estado del evento',
      pageSub: 'Avances, anuncios y prensa de SOCCER iD CUP 2027',
      active: 'noticias',
      article,
      panel: await buildPanelData(req.panelUser)
    });
  } catch (e) { next(e); }
});

// ── Perfil: el usuario edita sus propios datos (drawer "Mi perfil") ──
// Solo se tocan campos suyos; categoria, monto y modalidad siguen siendo del admin.

const norm = (v) => String(v == null ? '' : v).trim();
// Guarda el correo solo si parece un correo; si no, se descarta en vez de
// escribir basura que luego rebota en los envios.
const optEmail = (v) => { const e = norm(v).toLowerCase(); return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) ? e : null; };
// Telefono: deja digitos y el + inicial; util para SMS mas adelante.
const optPhone = (v) => { const p = norm(v).replace(/[^\d+]/g, ''); return p.length >= 7 ? p.slice(0, 20) : null; };

router.post('/perfil', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
    const b = req.body;
    const language = b.language === 'en' ? 'en' : 'es';
    await knex('users').where({ id: req.panelUser.id }).update({
      language,
      phone: optPhone(b.phone),
      phone_extra: optPhone(b.phone_extra),
      email_extra: optEmail(b.email_extra),
      assistant_email: optEmail(b.assistant_email),
      assistant_phone: optPhone(b.assistant_phone),
      notify_email: !!b.notify_email,
      notify_sms: !!b.notify_sms,
      updated_at: knex.fn.now()
    });
    // El idioma se integra con el del sitio, que se resuelve por cookie `lang`.
    res.cookie('lang', language, { maxAge: 365 * 24 * 60 * 60 * 1000, path: '/', sameSite: 'lax' });
    res.redirect('/panel?type=ok&msg=' + encodeURIComponent('Perfil actualizado'));
  } catch (e) { next(e); }
});

router.post('/perfil/password', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
    const b = req.body;
    const actual = String(b.current_password || '');
    const nueva = String(b.new_password || '');
    const back = (msg, type) => res.redirect('/panel?type=' + type + '&msg=' + encodeURIComponent(msg) + '#perfil');

    const row = await knex('users').where({ id: req.panelUser.id }).first();
    if (!auth.verifyPassword(actual, row && row.password_hash)) return back('Tu contraseña actual no es correcta', 'error');
    if (nueva.length < 8) return back('La nueva contraseña debe tener al menos 8 caracteres', 'error');
    if (nueva !== String(b.new_password2 || '')) return back('Las contraseñas nuevas no coinciden', 'error');
    if (nueva === actual) return back('La nueva contraseña debe ser distinta de la actual', 'error');

    await knex('users').where({ id: req.panelUser.id })
      .update({ password_hash: auth.hashPassword(nueva), updated_at: knex.fn.now() });
    back('Contraseña actualizada', 'ok');
  } catch (e) { next(e); }
});

router.get('/calendario', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
    res.render('panel/calendario', {
      layout: 'panel',
      title: 'Calendario · SOCCER iD Investor Hub',
      pageHeading: 'Calendario y cronograma',
      pageSub: 'Fechas clave rumbo al 27 de marzo de 2027',
      active: 'calendario',
      panel: await buildPanelData(req.panelUser, { calMonth: parseInt(req.query.m, 10) || 0, calYear: parseInt(req.query.y, 10) || 0 })
    });
  } catch (e) { next(e); }
});

router.get('/notificaciones', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
    const { rows } = await notificationsForUser(req.panelUser);
    const seenId = req.panelUser.notifications_seen_id || 0;
    const list = rows.map(n => {
      const t = NOTIF_TYPES[n.type] || NOTIF_TYPES.comunicado;
      return {
        title: n.title, body: n.body,
        typeLabel: t.label, typeColor: t.color,
        direct: !!n.user_id,
        date: new Date(n.created_at).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' }),
        unread: n.id > seenId
      };
    });
    // Marcar todas como vistas
    const maxId = rows.length ? Math.max(...rows.map(n => n.id)) : 0;
    if (maxId > seenId) await knex('users').where({ id: req.panelUser.id }).update({ notifications_seen_id: maxId });

    const panel = await buildPanelData(req.panelUser);
    panel.unread = 0;
    res.render('panel/notificaciones', {
      layout: 'panel',
      title: 'Notificaciones · SOCCER iD Investor Hub',
      pageHeading: 'Notificaciones',
      pageSub: 'Comunicados y novedades de SOCCER iD CUP 2027',
      active: 'notificaciones',
      panel, notifications: list
    });
  } catch (e) { next(e); }
});

router.get('/documentos', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
    res.render('panel/documentos', {
      layout: 'panel',
      title: 'Documentos y evidencias · SOCCER iD Investor Hub',
      pageHeading: 'Documentos y evidencias',
      pageSub: 'Contratos, documentación legal y evidencias del proyecto compartidos contigo',
      active: 'documentos',
      panel: await buildPanelData(req.panelUser)
    });
  } catch (e) { next(e); }
});

router.get('/presentacion', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
    res.render('panel/presentacion', {
      layout: 'panel',
      title: 'Presentación · SOCCER iD Investor Hub',
      pageHeading: 'Presentación del evento',
      pageSub: 'La propuesta de esta edición',
      active: 'presentacion',
      panel: await buildPanelData(req.panelUser)
    });
  } catch (e) { next(e); }
});

// Panorámica de ediciones para el inversionista: SOLO LECTURA. No cambia de
// contexto — la edición activa la decide el admin.
router.get('/ediciones', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin#eventos');
    res.render('panel/ediciones', {
      layout: 'panel',
      title: 'Ediciones · SOCCER iD Investor Hub',
      pageHeading: 'Ediciones de la CUP',
      pageSub: 'La edición en curso y el historial del proyecto',
      active: 'ediciones',
      panel: await buildPanelData(req.panelUser)
    });
  } catch (e) { next(e); }
});

router.get('/faq', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
    res.render('panel/faq', {
      layout: 'panel',
      title: 'Preguntas frecuentes · SOCCER iD Investor Hub',
      pageHeading: 'Preguntas frecuentes',
      pageSub: 'Respuestas a las dudas más comunes',
      active: 'faq',
      panel: await buildPanelData(req.panelUser)
    });
  } catch (e) { next(e); }
});

// Marca el onboarding (video de bienvenida) como completado — AJAX
router.post('/onboarded', auth.requireAuth, async (req, res) => {
  try {
    await knex('users').where({ id: req.panelUser.id }).update({ onboarded_at: Date.now() });
    res.json({ ok: true });
  } catch (e) { res.status(500).json({ ok: false }); }
});

// ════════════════════════════════════════════════
// PANEL DEL DUEÑO (ADMIN)
// ════════════════════════════════════════════════
router.get('/admin', auth.requireAdmin, async (req, res, next) => {
  try {
    const tiers = await getTiers();
    const users = await knex('users').whereNot({ role: 'admin' }).orderBy('id', 'desc');
    const news = await knex('news').orderBy([{ column: 'featured', order: 'desc' }, { column: 'sort', order: 'asc' }]);
    // Una edición por año, así que el año es el orden natural. `sort` quedaba
    // desalineado en cuanto se creaba una edición fuera de secuencia.
    const peRows = await knex('portfolio_events').orderBy('year');

    const eventRowsAdmin = await knex('events').orderBy([{ column: 'year' }, { column: 'month' }, { column: 'day' }]);
    const edicionPorId = {};
    peRows.forEach(e => { edicionPorId[e.id] = e; });
    const events = eventRowsAdmin.map(e => Object.assign({}, e, {
      typeLabel: e.type === 'Otro' ? (e.custom_type || 'Otro') : e.type,
      customType: e.custom_type || '', time: e.time_label || '', note: e.note || '',
      eventId: e.event_id || '',
      editionLabel: e.event_id && edicionPorId[e.event_id] ? edicionPorId[e.event_id].title : ''
    }));

    const MILE_LABELS = { completado: 'Completado', en_curso: 'En curso', pendiente: 'Pendiente' };
    const mileRowsAdmin = await knex('milestones').orderBy([{ column: 'sort' }, { column: 'id' }]);
    const milestones = mileRowsAdmin.map((m, i) => {
      const status = m.status || (m.done ? 'completado' : 'pendiente');
      return Object.assign({}, m, {
        status, statusLabel: MILE_LABELS[status] || 'Pendiente', owner: m.owner || '',
        description: m.description || '', startDate: m.start_date || '', endDate: m.end_date || '',
        eventId: m.event_id || '',
        editionLabel: m.event_id && edicionPorId[m.event_id] ? edicionPorId[m.event_id].title : '',
        isFirst: i === 0, isLast: i === mileRowsAdmin.length - 1
      });
    });
    const notifications = await knex('notifications').orderBy('id', 'desc');

    // Uso del capital + riesgos (para el admin)
    const RISK_LBL = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' };
    const RISK_ST = { abierto: 'Abierto', monitoreo: 'En monitoreo', mitigado: 'Mitigado' };
    const RISK_CLR = { alto: '#C0392B', medio: '#C79A2E', bajo: '#1E8E5A' };
    const capitalItems = (await knex('capital_items').orderBy([{ column: 'sort' }, { column: 'id' }])).map(c => {
      const budget = Number(c.budget) || 0, spent = Number(c.spent) || 0;
      return {
        id: c.id, label: c.label, budget, spent,
        budgetLabel: formatUSD(budget), spentLabel: formatUSD(spent), note: c.note || '', source: c.source || '', sort: c.sort,
        pct: budget ? Math.min(100, Math.round((spent / budget) * 100)) : 0,
        over: spent > budget
      };
    });
    const risksAdmin = (await knex('risks').orderBy([{ column: 'sort' }, { column: 'id' }])).map(r => ({
      id: r.id, title: r.title, level: r.level, levelLabel: RISK_LBL[r.level] || 'Medio', color: RISK_CLR[r.level] || '#C79A2E',
      mitigation: r.mitigation || '', status: r.status, statusLabel: RISK_ST[r.status] || 'En monitoreo', sort: r.sort
    }));

    const allDocs = await knex('user_documents').orderBy('id', 'desc');
    const docsByUser = {};
    allDocs.forEach(d => { (docsByUser[d.user_id] = docsByUser[d.user_id] || []).push({ id: d.id, name: d.name, url: d.url, meta: d.meta }); });

    const roleLabel = (u) => u.role === 'sponsor' ? 'Patrocinador' : 'Inversionista';
    const tierLabel = (u) => { const t = findTier(tiers, u.role, u.category); return t ? t.label : '—'; };

    // Registro de accesos: una sola consulta, se deriva todo (por código y por prospecto)
    const allAccess = await knex('access_log').orderBy('id', 'desc');
    const fmtWhen = (d) => d ? new Date(d).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    // Historial por código (cruzable con prospectos: incluye nombre/email/lead)
    const codesHistory = {};
    const isOwner = (a) => a.matched_owner === true || a.matched_owner === 1;
    const isOther = (a) => a.matched_owner === false || a.matched_owner === 0;
    allAccess.forEach(a => {
      (codesHistory[a.code] = codesHistory[a.code] || []).push({
        leadId: a.lead_id || null, name: a.name || '—', email: a.email || '—',
        ip: a.ip || '—', device: (a.device_id || '').slice(0, 10) || '—', newDevice: !!a.new_device,
        owner: isOwner(a), other: isOther(a),
        whoLabel: isOwner(a) ? 'El dueño' : (isOther(a) ? 'Otra persona' : 'Sin confirmar'),
        when: fmtWhen(a.created_at)
      });
    });

    // Códigos de acceso a la propuesta 2027
    const codeRows = await knex('access_codes').orderBy([{ column: 'status' }, { column: 'id' }]);
    const codesView = codeRows.map(c => {
      const h = allAccess.filter(a => a.code === c.code);
      return {
        id: c.id, code: c.code, status: c.status,
        statusLabel: c.status === 'used' ? 'Usado' : 'Por usar', isTest: c.note === 'test',
        accesses: h.length,
        ownAccesses: h.filter(isOwner).length,
        otherAccesses: h.filter(isOther).length,
        assigneeName: c.assignee_name || '', assigneeEmail: c.assignee_email || '',
        assigneePhone: c.assignee_phone || '', tagsText: c.tags || '',
        tags: codeMap.parseTags(c.tags),
        assigned: !!(c.assignee_name || c.assignee_email || c.assignee_phone)
      };
    });
    const codesUsed = codesView.filter(c => c.status === 'used').length;
    const codesUnused = codesView.filter(c => c.status === 'unused' && !c.isTest).length;
    const codesAssigned = codesView.filter(c => c.assigned).length;
    const codesLeaked = codesView.filter(c => c.otherAccesses > 0).length;
    const codeTags = [...new Set(codesView.flatMap(c => c.tags))].sort();

    // Mapa de relaciones: quién repartió su código y quién acabó entrando con él
    const relations = codeMap.buildRelations(codeRows, allAccess);

    // Prospectos (leads) + historial de accesos por prospecto
    const leadRows = await knex('leads').orderBy('id', 'desc');
    const leadsHistory = {};
    allAccess.forEach(a => {
      if (!a.lead_id) return;
      (leadsHistory[a.lead_id] = leadsHistory[a.lead_id] || []).push({
        code: a.code || '—', ip: a.ip || '—', device: (a.device_id || '').slice(0, 10) || '—',
        ua: a.user_agent || '', newDevice: !!a.new_device, when: fmtWhen(a.created_at)
      });
    });
    const leadStatusLabels = { nuevo: 'Nuevo', contactado: 'Contactado', cliente: 'Cliente', descartado: 'Descartado' };
    const leadsView = leadRows.map(l => {
      const h = leadsHistory[l.id] || [];
      const devices = new Set(h.map(x => x.device).filter(d => d && d !== '—'));
      return {
        id: l.id, name: l.name || '—', email: l.email, status: l.status || 'nuevo',
        statusLabel: leadStatusLabels[l.status] || l.status, accesses: h.length,
        deviceCount: devices.size, lastIp: h[0] ? h[0].ip : '', lastWhen: h[0] ? h[0].when : '',
        date: l.created_at ? new Date(l.created_at).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric' }) : ''
      };
    });

    // Registro de accesos (últimos 200) — derivado de allAccess
    const accessView = allAccess.slice(0, 200).map(a => ({
      id: a.id, code: a.code, name: a.name || '—', email: a.email || '—',
      device: (a.device_id || '').slice(0, 8), newDevice: !!a.new_device, ip: a.ip || '',
      when: fmtWhen(a.created_at)
    }));

    // Ediciones del portafolio (multievento)
    const PHASE_LBL = PHASE_LABELS;
    // (peRows ya se consultó arriba: la usan el calendario y el cronograma)
    const pkCounts = await knex('event_packages').select('event_id').count({ n: '*' }).groupBy('event_id');
    const invAgg = await knex('investments').select('event_id').count({ n: '*' }).sum({ cap: 'capital' }).groupBy('event_id');
    const pkMap = {}; pkCounts.forEach(r => { pkMap[r.event_id] = Number(r.n); });
    const invMap = {}; invAgg.forEach(r => { invMap[r.event_id] = { n: Number(r.n), cap: Number(r.cap) || 0 }; });
    // Cuál es la que ven los inversionistas hoy: la configurada o, si no hay, la de mayor año
    const cfgDash = await getDashboardConfig();
    const porAnio = [...peRows].sort((a, b) => (b.year || 0) - (a.year || 0) || b.id - a.id);
    const activaAuto = porAnio[0] || null;
    const activaId = peRows.some(e => String(e.id) === String(cfgDash.activeEditionId))
      ? String(cfgDash.activeEditionId)
      : (activaAuto ? String(activaAuto.id) : '');
    const portfolioEditions = peRows.map(e => Object.assign({
      isActiveEdition: String(e.id) === activaId,
      isAutoActive: !cfgDash.activeEditionId && String(e.id) === activaId
    }, {
      id: e.id, year: e.year, title: e.title, match: e.match || '', subtitle: e.subtitle || '',
      city: e.city || '', venue: e.venue || '', dateLabel: e.event_date || '',
      phase: e.phase, phaseLabel: PHASE_LBL[e.phase] || e.phase, progress: e.progress_pct || 0,
      budgetLabel: formatUSD(e.budget || 0), isDemo: !!e.is_demo, accent: e.accent || '#6C3CE0', code: e.code || '',
      packages: pkMap[e.id] || 0, investments: (invMap[e.id] || {}).n || 0, capitalLabel: formatUSD((invMap[e.id] || {}).cap || 0)
    }));
    // Datos completos para prellenar el formulario (drawer) de edición.
    // Incluye el contenido público, que desde la unificación vive en la misma fila.
    const portfolioForms = peRows.map(e => {
      const pes = safeParse(e.data_es, {}) || {};
      const pen = safeParse(e.data_en, {}) || {};
      return {
        id: e.id, code: e.code || '', year: e.year || '', title: e.title || '', subtitle: e.subtitle || '',
        match: e.match || '', description: e.description || '', venue: e.venue || '', city: e.city || '', country: e.country || '',
        event_date: e.event_date || '', date_phase: e.date_phase || '', budget: e.budget || 0, projected_income: e.projected_income || 0,
        phase: e.phase || 'planeacion', status: e.status || 'past',
        progress_pct: e.progress_pct || 0, is_demo: !!e.is_demo, accent: e.accent || '#6C3CE0',
        presentation_es: e.presentation_es || '', presentation_en: e.presentation_en || '',
        capacity: e.capacity || 0, ticket_price: e.ticket_price || 0, deductions_pct: e.deductions_pct || 0,
        rebate_per: e.rebate_per || 0, cap_pct: e.cap_pct || 0, investor_split: e.investor_split || 0,
        // Contenido público (el que ve la landing): textos por idioma y colecciones
        banner: pes.banner || '',
        title_es: pes.title || '', title_en: pen.title || '',
        description_es: pes.description || '', description_en: pen.description || '',
        att_value: (pes.attendance || {}).value || '',
        att_label_es: (pes.attendance || {}).label || '', att_label_en: (pen.attendance || {}).label || '',
        rows: {
          stats_es: pes.stats || [], stats_en: pen.stats || [],
          media_es: pes.mediaLinks || [], media_en: pen.mediaLinks || [],
          sponsors: pes.sponsors || [], videos: pes.videos || [], images: pes.images || []
        }
      };
    });

    // Paquetes por edición (agrupados)
    const MOD_LBL = { fijo: 'Retorno fijo', riesgo: 'Participación a riesgo', patrocinio: 'Patrocinio' };
    const pkgRows = await knex('event_packages').orderBy([{ column: 'event_id' }, { column: 'sort' }, { column: 'id' }]);
    const nameById = {}; users.forEach(u => { nameById[u.id] = u.name; });
    const portfolioPackages = {};
    pkgRows.forEach(p => {
      (portfolioPackages[p.event_id] = portfolioPackages[p.event_id] || []).push({
        id: p.id, event_id: p.event_id, name: p.name, modality: p.modality, modalityLabel: MOD_LBL[p.modality] || p.modality,
        amount: p.amount || 0, amountLabel: formatUSD(p.amount || 0), return_pct: p.return_pct || 0, count: p.count || 0,
        benefits: p.benefits || '', is_active: !!p.is_active,
        user_id: p.user_id || '', assignee: p.user_id ? (nameById[p.user_id] || 'Inversionista') : ''
      });
    });
    // Inversionistas para asignar paquetes privados
    const investorsList = users.filter(u => u.role === 'investor').map(u => ({ id: u.id, name: u.name, email: u.email }));

    // FAQ (admin)
    const AUD_LBL = { all: 'General', investor: 'Inversionistas', sponsor: 'Patrocinadores' };
    const faqsAdmin = (await knex('faqs').orderBy([{ column: 'sort' }, { column: 'id' }])).map(f => ({
      id: f.id, audience: f.audience, audienceLabel: AUD_LBL[f.audience] || f.audience,
      question: f.question, answer: f.answer || '', is_active: !!f.is_active, sort: f.sort
    }));

    // ── Panel estadístico del admin ──
    // Todo es DERIVADO: se cuenta de lo que hay cargado. Nada se captura a mano,
    // porque un número escrito a mano queda viejo en cuanto alguien agrega algo.
    // Lo que depende del año se mide sobre la EDICIÓN ACTIVA (la que ven los
    // inversionistas); lo que es del negocio completo va en total.
    const edActiva = peRows.find(e => String(e.id) === activaId) || null;
    const invRows = await knex('investments');
    const invDeLaEdicion = edActiva ? invRows.filter(i => String(i.event_id) === String(edActiva.id)) : [];

    const sumaCapital = (arr) => arr.reduce((n, i) => n + Number(i.capital || 0), 0);
    const capTotal = sumaCapital(invRows);
    const capEdicion = sumaCapital(invDeLaEdicion);
    const fijoArr = invDeLaEdicion.filter(i => i.modality !== 'riesgo');
    const riesgoArr = invDeLaEdicion.filter(i => i.modality === 'riesgo');
    const capFijo = sumaCapital(fijoArr), capRiesgo = sumaCapital(riesgoArr);
    const presupuesto = Number((edActiva || {}).budget || 0);

    // Retorno proyectado: se usa la MISMA función del panel del inversionista,
    // para que el admin no vea una cifra distinta a la que ve cada quien.
    const cfgRet = await getDashboardConfig();
    let retornoProyectado = 0;
    invDeLaEdicion.forEach(i => {
      const u = users.find(x => x.id === i.user_id) || {};
      const r = computeReturn(Object.assign({}, u, {
        amount: i.capital, investment_type: i.modality, return_rate: i.return_pct
      }), cfgRet);
      retornoProyectado += Number(String(r.profit).replace(/[^0-9.-]/g, '')) || 0;
    });

    // Inversionistas REALES por categoría, contra el cupo PLANEADO de cada una.
    // La diferencia es justo lo que falta por vender.
    const investorUsers = users.filter(u => u.role === 'investor');
    const porCategoria = tiers.filter(t => t.role === 'investor').map(t => {
      const reales = investorUsers.filter(u => u.category === t.key).length;
      return { label: t.label, color: t.color, real: reales, cupo: t.count || 0 };
    });
    const totalReal = porCategoria.reduce((n, c) => n + c.real, 0);
    const totalCupo = porCategoria.reduce((n, c) => n + c.cupo, 0);

    // Dona de inversionistas reales (mismo cálculo que la del panel)
    const CIRC = 2 * Math.PI * 54;
    let acum = 0;
    const donutReal = porCategoria.map(c => {
      const frac = totalReal ? c.real / totalReal : 0;
      const seg = {
        color: c.color, label: c.label, real: c.real,
        len: Math.round(frac * CIRC * 100) / 100,
        angle: Math.round((totalReal ? acum / totalReal : 0) * 360 * 100) / 100 - 90
      };
      acum += c.real;
      return seg;
    });

    // Data room de la edición activa por estatus
    const drRows = edActiva ? await knex('event_documents').where({ event_id: edActiva.id }) : [];
    const docsPorEstatus = ['revision', 'aprobado', 'firmado'].map(k => ({
      key: k, label: DOC_STATES[k], n: drRows.filter(d => (d.status || 'revision') === k).length
    }));

    // Taquilla y punto de equilibrio (parámetros de la edición activa si los tiene)
    const capAforo = Number((edActiva || {}).capacity || cfgRet.capacity || 0);
    const precioBoleto = Number((edActiva || {}).ticket_price || cfgRet.ticketPrice || 0);
    const vendidos = Number(cfgRet.ticketsSold || 0);
    const equilibrio = Number(cfgRet.breakEvenTickets) ||
      (precioBoleto ? Math.ceil((presupuesto || Number(cfgRet.projectCost) || 0) / precioBoleto) : 0);

    const pct = (a, b) => b > 0 ? Math.min(100, Math.round((a / b) * 100)) : 0;
    const LEAD_ST = { nuevo: 'Nuevos', contactado: 'Contactados', cliente: 'Clientes', descartado: 'Descartados' };

    const stats = {
      edicion: edActiva ? { title: edActiva.title, year: edActiva.year } : null,
      capital: {
        edicion: formatUSD(capEdicion), total: formatUSD(capTotal),
        presupuesto: formatUSD(presupuesto),
        cubiertoPct: pct(capEdicion, presupuesto),
        // Sin presupuesto no se puede decir cuánto falta: un "$0 faltante" se lee
        // como "ya está cubierto", que es justo lo contrario.
        sinPresupuesto: presupuesto <= 0,
        faltante: formatUSD(Math.max(0, presupuesto - capEdicion)),
        retorno: formatUSD(retornoProyectado),
        inversiones: invDeLaEdicion.length, inversionesTotal: invRows.length
      },
      modalidad: {
        fijo: formatUSD(capFijo), riesgo: formatUSD(capRiesgo),
        fijoN: fijoArr.length, riesgoN: riesgoArr.length,
        fijoPct: pct(capFijo, capEdicion), riesgoPct: pct(capRiesgo, capEdicion)
      },
      inversionistas: {
        activos: investorUsers.filter(u => u.status === 'active').length,
        invitados: investorUsers.filter(u => u.status === 'invited').length,
        inactivos: investorUsers.filter(u => u.status === 'disabled').length,
        patrocinadores: users.filter(u => u.role === 'sponsor').length,
        real: totalReal, cupo: totalCupo, cupoPct: pct(totalReal, totalCupo),
        porCategoria, donut: donutReal, circ: Math.round(CIRC * 100) / 100
      },
      taquilla: {
        vendidos: vendidos.toLocaleString('es-MX'),
        aforo: capAforo.toLocaleString('es-MX'),
        ocupacionPct: pct(vendidos, capAforo),
        equilibrio: equilibrio.toLocaleString('es-MX'),
        equilibrioPct: pct(equilibrio, capAforo),
        superado: equilibrio > 0 && vendidos >= equilibrio,
        faltan: Math.max(0, equilibrio - vendidos).toLocaleString('es-MX'),
        ingreso: formatUSD(vendidos * precioBoleto)
      },
      documentos: { porEstatus: docsPorEstatus, total: drRows.length, porCuenta: allDocs.length },
      codigos: {
        total: codesView.length, usados: codesUsed, porUsar: codesUnused,
        conDueno: codesAssigned, ajenos: codesLeaked,
        accesos: allAccess.length,
        dispositivosNuevos: allAccess.filter(a => a.new_device).length
      },
      prospectos: Object.keys(LEAD_ST).map(k => ({
        label: LEAD_ST[k], n: leadsView.filter(l => l.status === k).length
      })),
      contenido: {
        noticias: news.length, faqs: faqsAdmin.length, notificaciones: notifications.length,
        avances: await knex('event_updates').count({ n: '*' }).first().then(r => Number(r.n)),
        medios: await knex('event_media').count({ n: '*' }).first().then(r => Number(r.n)),
        actividades: eventRowsAdmin.length, etapas: mileRowsAdmin.length
      }
    };

    const notifyRow = await knex('app_settings').where({ key: 'notify_emails' }).first();
    const notifyEmails = notifyRow ? (notifyRow.value || '') : '';
    const twilio = await panelSms.getPublicConfig();

    // Destinatarios posibles de una notificación directa (inversionistas y patrocinadores)
    const notifyPeople = users.filter(u => u.role !== 'admin').map(u => ({
      id: u.id, name: u.name, email: u.email,
      roleLabel: u.role === 'sponsor' ? 'Patrocinador' : 'Inversionista',
      hasPhone: !!u.phone, wantsEmail: u.notify_email == null ? true : !!u.notify_email, wantsSms: !!u.notify_sms
    }));
    const notifTypes = Object.keys(NOTIF_TYPES)
      .filter(k => k !== 'directa')
      .map(k => ({ key: k, label: NOTIF_TYPES[k].label }));

    res.render('panel/admin', {
      layout: 'panel',
      title: 'Administración · SOCCER iD Investor Hub',
      pageHeading: 'Panel del organizador',
      pageSub: 'Invita usuarios, publica noticias y gestiona el evento',
      active: 'admin',
      panel: buildAdminPanel(req.panelUser),
      flash: req.query.msg,
      flashType: req.query.type,
      s3: require('../lib/uploads').s3Enabled,
      users: users.map(u => ({
        id: u.id, name: u.name, email: u.email, role: u.role, roleLabel: roleLabel(u),
        category: u.category || '', tierLabel: tierLabel(u), amountRaw: u.amount || 0,
        amount: formatUSD(u.amount), status: u.status,
        investmentType: u.investment_type === 'riesgo' ? 'riesgo' : 'fijo',
        investmentTypeLabel: u.investment_type === 'riesgo' ? 'Participación a riesgo' : 'Retorno fijo',
        color: (findTier(tiers, u.role, u.category) || {}).color || '#8A8F98',
        docs: docsByUser[u.id] || [], docCount: (docsByUser[u.id] || []).length
      })),
      docsByUser,
      news, events, milestones,
      notifications: notifications.map(n => {
        const t = NOTIF_TYPES[n.type] || NOTIF_TYPES.comunicado;
        const dest = n.user_id ? (users.find(u => u.id === n.user_id) || null) : null;
        const chans = String(n.channels || 'in-app').split(',').filter(Boolean);
        return {
          id: n.id, title: n.title, body: n.body, audience: n.audience,
          typeLabel: t.label, typeColor: t.color,
          toLabel: dest ? dest.name : (n.audience === 'admin' ? 'Organizador' : null),
          channelsLabel: chans.map(c => c === 'in-app' ? 'in-app' : c.toUpperCase()).join(' · '),
          sentEmail: n.sent_email || 0, sentSms: n.sent_sms || 0,
          date: new Date(n.created_at).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric' })
        };
      }),
      tiers: tiers.map(t => ({
        id: t.id, key: t.key, role: t.role, roleLabel: t.role === 'sponsor' ? 'Patrocinador' : 'Inversionista',
        label: t.label, color: t.color, amount: t.amount, count: t.count,
        benefitsText: (t.benefits || []).join('\n'), benefitsCount: (t.benefits || []).length
      })),
      investorTiers: tiers.filter(t => t.role === 'investor').map(t => ({ key: t.key, label: t.label, amount: t.amount })),
      sponsorTiers: tiers.filter(t => t.role === 'sponsor').map(t => ({ key: t.key, label: t.label, amount: t.amount })),
      codes: codesView, codesUsed, codesUnused, codesHistory,
      codesAssigned, codesLeaked, codeTags, relations,
      leads: leadsView, leadsCount: leadsView.length, leadsHistory,
      accessLog: accessView,
      notifyEmails, twilio, notifyPeople, notifTypes, stats,
      actTypes: Object.keys(ACT_TYPES),
      dashboardConfig: await getDashboardConfig(),
      capitalItems, risksAdmin, portfolioEditions, portfolioForms, portfolioPackages, investorsList, faqsAdmin,
      capitalTotalBudget: formatUSD(capitalItems.reduce((s, c) => s + Number(c.budget), 0)),
      capitalTotalSpent: formatUSD(capitalItems.reduce((s, c) => s + Number(c.spent), 0))
    });
  } catch (e) { next(e); }
});

// Invitar usuario
router.post('/admin/invite', auth.requireAdmin, async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const email = (req.body.email || '').trim().toLowerCase();
    const role = req.body.role === 'sponsor' ? 'sponsor' : 'investor';
    const category = (req.body.category || '').trim();
    const amount = parseInt(req.body.amount || '0', 10) || 0;
    const investmentType = req.body.investment_type === 'riesgo' ? 'riesgo' : 'fijo';
    if (!name || !email) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Nombre y email son obligatorios'));

    const existing = await knex('users').where({ email }).first();
    if (existing) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Ya existe un usuario con ese email'));

    // member_id auto: prefijo por categoría + consecutivo
    const prefix = 'SIDC-' + (category ? category[0].toUpperCase() : 'U');
    const countSame = await knex('users').where({ role, category }).count({ c: '*' }).first();
    const memberId = prefix + String((Number(countSame.c) || 0) + 1).padStart(2, '0');

    const token = auth.makeInviteToken();
    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await knex('users').insert({
      name, email, role, category, amount, member_id: memberId,
      investment_type: investmentType,
      status: 'invited', invite_token: token, invite_expires: expires
    });

    const tier = findTier(await getTiers(), role, category);
    const baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://soccerid.co' : `http://localhost:${process.env.PORT || 3000}`);
    await sendInvite({
      to: email, name,
      activateUrl: `${baseUrl}/panel/activar/${token}`,
      categoryLabel: tier ? tier.label : '',
      roleLabel: role === 'sponsor' ? 'Patrocinador' : 'Inversionista'
    });

    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`Invitación enviada a ${email}`));
  } catch (e) { next(e); }
});

// Reenviar invitación
router.post('/admin/user/:id/resend', auth.requireAdmin, async (req, res, next) => {
  try {
    const user = await knex('users').where({ id: req.params.id }).first();
    if (!user) return res.redirect('/panel/admin?type=error&msg=Usuario+no+encontrado');
    const token = auth.makeInviteToken();
    const expires = Date.now() + 7 * 24 * 60 * 60 * 1000;
    await knex('users').where({ id: user.id }).update({ invite_token: token, invite_expires: expires, status: 'invited' });
    const tier = findTier(await getTiers(), user.role, user.category);
    const baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://soccerid.co' : `http://localhost:${process.env.PORT || 3000}`);
    await sendInvite({ to: user.email, name: user.name, activateUrl: `${baseUrl}/panel/activar/${token}`, categoryLabel: tier ? tier.label : '', roleLabel: user.role === 'sponsor' ? 'Patrocinador' : 'Inversionista' });
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`Invitación reenviada a ${user.email}`));
  } catch (e) { next(e); }
});

// Eliminar usuario
router.post('/admin/user/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try {
    await knex('users').where({ id: req.params.id }).whereNot({ role: 'admin' }).del();
    await knex('user_documents').where({ user_id: req.params.id }).del();
    res.redirect('/panel/admin?type=ok&msg=Usuario+eliminado');
  } catch (e) { next(e); }
});

// Documentos legales por usuario (enlaces de Google Drive)
router.post('/admin/user/:id/document', auth.requireAdmin, async (req, res, next) => {
  try {
    const user = await knex('users').where({ id: req.params.id }).first();
    if (!user) return res.redirect('/panel/admin?type=error&msg=Usuario+no+encontrado');
    const name = (req.body.name || '').trim();
    const url = (req.body.url || '').trim();
    if (!name || !url) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Nombre y enlace son obligatorios'));
    if (!/^https?:\/\//i.test(url)) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('El enlace debe empezar con http:// o https://'));
    const CATS = ['Legal', 'Financiero', 'Evidencia', 'General'];
    const category = CATS.includes(req.body.category) ? req.body.category : 'General';
    const docDate = (req.body.doc_date || '').trim() || null;
    await knex('user_documents').insert({ user_id: user.id, name, url, meta: 'Google Drive', ext: null, category, doc_date: docDate });
    // Avisa al dueño del documento (in-app siempre, email si lo tiene activado).
    // Con `silent=1` el admin puede cargar documentos sin avisar.
    let avisado = false;
    if (!req.body.silent && user.status === 'active') {
      try {
        await notify({
          type: 'documento', userId: user.id, channels: ['in-app', 'email'],
          title: `Nuevo documento: ${name}`,
          body: `Se agregó "${name}" (${category}) a tus documentos. Entra al portal para consultarlo.`
        });
        avisado = true;
      } catch (err) { console.error('  ✗ No se pudo notificar el documento:', err.message); }
    }
    const sufijo = avisado ? ' (se le avisó)' : '';
    const back = req.body.redirect === 'account' ? `/panel/admin/user/${user.id}?type=ok&msg=${encodeURIComponent('Documento agregado' + sufijo)}` : '/panel/admin?type=ok&msg=' + encodeURIComponent(`Documento agregado a ${user.name}${sufijo}`);
    res.redirect(back);
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message));
  }
});
router.post('/admin/document/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try {
    const doc = await knex('user_documents').where({ id: req.params.id }).first();
    await knex('user_documents').where({ id: req.params.id }).del();
    // req.body.redirect trae el id del usuario cuando se elimina desde la página por-cuenta
    const uid = (req.body.redirect && /^\d+$/.test(String(req.body.redirect))) ? req.body.redirect : (doc && doc.user_id);
    const back = req.body.redirect ? `/panel/admin/user/${uid}?type=ok&msg=Documento+eliminado` : '/panel/admin?type=ok&msg=Documento+eliminado';
    res.redirect(back);
  } catch (e) { next(e); }
});

// Subida de imagen genérica (AJAX) → devuelve JSON { url }
router.post('/admin/upload', auth.requireAdmin, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ error: 'No se recibió archivo' });
    const { url } = await uploadImage(req.file);
    res.json({ url });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// Enlace a la nota original: solo http/https, para no dejar pasar un javascript:
// dentro de un href. Devuelve null si viene vacio o no es una URL usable.
function sourceUrl(v) {
  const raw = String(v == null ? '' : v).trim();
  if (!raw) return null;
  try {
    const u = new URL(raw);
    return (u.protocol === 'http:' || u.protocol === 'https:') ? u.href : null;
  } catch (_) { return null; }
}

// Noticias
router.post('/admin/news', auth.requireAdmin, upload.single('imageFile'), async (req, res, next) => {
  try {
    const tag = req.body.tag || 'Anuncio';
    const tagColors = { 'Anuncio': '#6C3CE0', 'Actualización': '#14141B', 'Prensa': '#6B7280' };
    let image = (req.body.image || '').trim();
    if (req.file) { const up = await uploadImage(req.file); image = up.url; }
    if (!image) image = '/assets/images/gallery/cup2025/6.jpg';
    await knex('news').insert({
      tag, tag_color: tagColors[tag] || '#6C3CE0',
      title: (req.body.title || '').trim(),
      excerpt: (req.body.excerpt || '').trim(),
      body: (req.body.body || '').trim() || null,
      image,
      date_label: (req.body.date_label || '').trim(),
      size: req.body.size === 'tall' ? 'tall' : 'short',
      featured: req.body.featured ? true : false,
      source_url: sourceUrl(req.body.source_url),
      sort: parseInt(req.body.sort || '99', 10) || 99
    });
    res.redirect('/panel/admin?type=ok&msg=Noticia+publicada#noticias');
  } catch (e) { next(e); }
});
router.post('/admin/news/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('news').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=Noticia+eliminada#noticias'); } catch (e) { next(e); }
});

// Eventos del calendario
// Tipos de actividad del calendario. "Otro" abre un campo de texto para escribir
// el tipo a mano: el organizador hace cosas que no cabían en la lista corta.
const ACT_TYPES = {
  'Evento': '#6C3CE0',
  'Partido': '#6C3CE0',
  'Actualización': '#A78BE6',
  'Patrocinio': '#14141B',
  'Prensa': '#8A8F98',
  'Logística': '#0891B2',
  'Meeting': '#0E9F6E',
  'Meet & greet': '#D97706',
  'Junta de inversionistas': '#DB2777',
  'Otro': '#8A8F98'
};

// Datos de una actividad, con el mismo saneo al crear y al editar.
// Devuelve { data } o { error }.
function actividadBody(b) {
  const type = ACT_TYPES[b.type] ? b.type : 'Evento';
  const custom = (b.custom_type || '').trim().slice(0, 40);
  if (type === 'Otro' && !custom) return { error: 'Escribe qué tipo de actividad es' };
  const title = (b.title || '').trim();
  if (!title) return { error: 'La actividad necesita título' };

  const day = parseInt(b.day, 10), month = parseInt(b.month, 10), year = parseInt(b.year, 10);
  if (!(day >= 1 && day <= 31)) return { error: 'El día debe estar entre 1 y 31' };
  if (!(month >= 1 && month <= 12)) return { error: 'El mes debe estar entre 1 y 12' };
  if (!(year >= 2000 && year <= 2100)) return { error: 'El año debe estar entre 2000 y 2100' };
  // Un 31 de febrero se guarda igual y luego no aparece en ningún mes del calendario
  if (new Date(year, month - 1, day).getDate() !== day) {
    return { error: `El ${day}/${month}/${year} no existe` };
  }

  const hora = (b.time_label || '').trim();
  if (hora && !/^\d{1,2}:\d{2}$/.test(hora)) return { error: 'La hora va como 19:00' };

  return {
    data: {
      day, month, year, title,
      type, custom_type: type === 'Otro' ? custom : null,
      color: ACT_TYPES[type],
      is_match: type === 'Partido',
      time_label: hora || null,
      note: (b.note || '').trim() || null,
      event_id: parseInt(b.event_id, 10) || null
    }
  };
}

router.post('/admin/event', auth.requireAdmin, async (req, res) => {
  try {
    const { data, error } = actividadBody(req.body);
    if (error) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(error) + '#calendario');
    await knex('events').insert(data);
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Actividad agregada') + '#calendario');
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message) + '#calendario');
  }
});
router.post('/admin/event/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('events').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=Actividad+eliminada#calendario'); } catch (e) { next(e); }
});

// Hitos / cronograma
const MILE_STATUSES = ['pendiente', 'en_curso', 'completado'];
// Una etapa del cronograma. Las etapas no son un set fijo: se agregan, se
// editan, se reordenan y se borran, y cada edición puede tener las suyas.
function etapaBody(b) {
  const title = (b.title || '').trim();
  if (!title) return { error: 'La etapa necesita nombre' };
  const status = MILE_STATUSES.includes(b.status) ? b.status : 'pendiente';
  const fecha = (v) => {
    const d = String(v == null ? '' : v).trim();
    return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
  };
  const desde = fecha(b.start_date), hasta = fecha(b.end_date);
  if (desde && hasta && hasta < desde) return { error: 'La fecha de fin es anterior a la de inicio' };
  return {
    data: {
      title,
      date_label: (b.date_label || '').trim(),
      owner: (b.owner || '').trim() || null,
      description: (b.description || '').trim() || null,
      start_date: desde, end_date: hasta,
      status,
      done: status === 'completado',
      highlight: b.highlight ? true : false,
      event_id: parseInt(b.event_id, 10) || null
    }
  };
}

router.post('/admin/milestone', auth.requireAdmin, async (req, res) => {
  try {
    const { data, error } = etapaBody(req.body);
    if (error) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(error) + '#cronograma');
    // Se agrega al final salvo que se pida otro lugar
    const max = await knex('milestones').max({ m: 'sort' }).first();
    data.sort = parseInt(req.body.sort, 10) || ((Number(max && max.m) || 0) + 1);
    await knex('milestones').insert(data);
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Etapa agregada') + '#cronograma');
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message) + '#cronograma');
  }
});

router.post('/admin/milestone/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('milestones').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=Hito+eliminado#cronograma'); } catch (e) { next(e); }
});

// ── Uso del capital (rubros) ──
function capitalBody(b) {
  return {
    label: (b.label || '').trim(),
    budget: parseInt(b.budget || '0', 10) || 0,
    spent: parseInt(b.spent || '0', 10) || 0,
    note: (b.note || '').trim() || null,
    source: (b.source || '').trim() || null,
    sort: parseInt(b.sort || '99', 10) || 99
  };
}
router.post('/admin/capital', auth.requireAdmin, async (req, res, next) => {
  try {
    const data = capitalBody(req.body);
    if (!data.label) return res.redirect('/panel/admin?type=error&msg=El+rubro+es+obligatorio#capital');
    await knex('capital_items').insert(data);
    res.redirect('/panel/admin?type=ok&msg=Rubro+agregado#capital');
  } catch (e) { next(e); }
});
router.post('/admin/capital/:id/update', auth.requireAdmin, async (req, res, next) => {
  try {
    const data = capitalBody(req.body); delete data.sort;
    await knex('capital_items').where({ id: req.params.id }).update(Object.assign(data, { updated_at: knex.fn.now() }));
    res.redirect('/panel/admin?type=ok&msg=Rubro+actualizado#capital');
  } catch (e) { next(e); }
});
router.post('/admin/capital/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('capital_items').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=Rubro+eliminado#capital'); } catch (e) { next(e); }
});

// ── Riesgos ──
const RISK_LEVELS = ['alto', 'medio', 'bajo'];
const RISK_STATES = ['abierto', 'monitoreo', 'mitigado'];
function riskBody(b) {
  return {
    title: (b.title || '').trim(),
    level: RISK_LEVELS.includes(b.level) ? b.level : 'medio',
    mitigation: (b.mitigation || '').trim() || null,
    status: RISK_STATES.includes(b.status) ? b.status : 'monitoreo',
    sort: parseInt(b.sort || '99', 10) || 99
  };
}
router.post('/admin/risk', auth.requireAdmin, async (req, res, next) => {
  try {
    const data = riskBody(req.body);
    if (!data.title) return res.redirect('/panel/admin?type=error&msg=El+riesgo+es+obligatorio#riesgos');
    await knex('risks').insert(data);
    res.redirect('/panel/admin?type=ok&msg=Riesgo+agregado#riesgos');
  } catch (e) { next(e); }
});
router.post('/admin/risk/:id/update', auth.requireAdmin, async (req, res, next) => {
  try {
    const data = riskBody(req.body); delete data.sort;
    await knex('risks').where({ id: req.params.id }).update(Object.assign(data, { updated_at: knex.fn.now() }));
    res.redirect('/panel/admin?type=ok&msg=Riesgo+actualizado#riesgos');
  } catch (e) { next(e); }
});
router.post('/admin/risk/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('risks').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=Riesgo+eliminado#riesgos'); } catch (e) { next(e); }
});

// ── Reordenar (flechas ▲▼): normaliza `sort` y sube/baja un elemento ──
const REORDER_TABLES = { capital: { table: 'capital_items', hash: 'capital' }, risk: { table: 'risks', hash: 'riesgos' }, milestone: { table: 'milestones', hash: 'cronograma' } };
router.post('/admin/:kind/:id/move', auth.requireAdmin, async (req, res, next) => {
  try {
    const cfg = REORDER_TABLES[req.params.kind];
    if (!cfg) return res.redirect('/panel/admin');
    const dir = req.body.dir === 'up' ? -1 : 1;
    const rows = await knex(cfg.table).orderBy([{ column: 'sort' }, { column: 'id' }]);
    const idx = rows.findIndex(r => String(r.id) === String(req.params.id));
    const swap = idx + dir;
    if (idx !== -1 && swap >= 0 && swap < rows.length) {
      const tmp = rows[idx]; rows[idx] = rows[swap]; rows[swap] = tmp;
    }
    // Reasigna sort consecutivo para dejar el orden consistente
    for (let i = 0; i < rows.length; i++) {
      await knex(cfg.table).where({ id: rows[i].id }).update({ sort: i + 1 });
    }
    res.redirect(`/panel/admin?type=ok&msg=Orden+actualizado#${cfg.hash}`);
  } catch (e) { next(e); }
});

// ── Edición ──
router.post('/admin/user/:id/update', auth.requireAdmin, async (req, res, next) => {
  try {
    const user = await knex('users').where({ id: req.params.id }).first();
    if (!user || user.role === 'admin') return res.redirect('/panel/admin?type=error&msg=Usuario+no+encontrado');
    const email = (req.body.email || user.email).trim().toLowerCase();
    if (email !== user.email) {
      const dup = await knex('users').where({ email }).whereNot({ id: user.id }).first();
      if (dup) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Ese email ya está en uso'));
    }
    // Estado: activo sólo si ya tiene contraseña; si no, permanece invitado
    let status = req.body.active ? 'active' : 'disabled';
    if (!user.password_hash) status = 'invited';

    // Overrides por cuenta (vacío = hereda el valor global/categoría → se guarda null)
    const b = req.body;
    const advName = (b.adv_name || '').trim();
    const advisorOverride = advName ? JSON.stringify({
      name: advName, role: (b.adv_role || '').trim(),
      phone: (b.adv_phone || '').trim(), whatsapp: (b.adv_whatsapp || '').replace(/[^0-9]/g, '')
    }) : null;
    const benefitsList = (b.benefits || '').split('\n').map(s => s.trim()).filter(Boolean);
    const benefitsOverride = benefitsList.length ? JSON.stringify(benefitsList) : null;
    const returnRate = (b.return_rate === undefined || String(b.return_rate).trim() === '') ? null : (parseFloat(b.return_rate));
    const activations = (b.activations || '').trim() || null;

    await knex('users').where({ id: user.id }).update({
      name: (b.name || user.name).trim(),
      email,
      role: b.role === 'sponsor' ? 'sponsor' : 'investor',
      category: (b.category || '').trim(),
      amount: parseInt(b.amount || '0', 10) || 0,
      investment_type: b.investment_type === 'riesgo' ? 'riesgo' : 'fijo',
      advisor: advisorOverride,
      benefits: benefitsOverride,
      return_rate: (returnRate === null || isNaN(returnRate)) ? null : returnRate,
      activations,
      status,
      updated_at: knex.fn.now()
    });
    // Si viene de la página por-cuenta, regresa a ella; si no, a la lista
    const back = b.redirect === 'account' ? `/panel/admin/user/${user.id}?type=ok&msg=${encodeURIComponent('Cuenta actualizada')}` : '/panel/admin?type=ok&msg=Usuario+actualizado';
    res.redirect(back);
  } catch (e) { next(e); }
});

router.post('/admin/news/:id/update', auth.requireAdmin, upload.single('imageFile'), async (req, res, next) => {
  try {
    const tag = req.body.tag || 'Anuncio';
    const tagColors = { 'Anuncio': '#6C3CE0', 'Actualización': '#14141B', 'Prensa': '#6B7280' };
    const current = await knex('news').where({ id: req.params.id }).first();
    let image = (req.body.image || (current && current.image) || '/assets/images/gallery/cup2025/6.jpg').trim();
    if (req.file) { const up = await uploadImage(req.file); image = up.url; }
    await knex('news').where({ id: req.params.id }).update({
      tag, tag_color: tagColors[tag] || '#6C3CE0',
      title: (req.body.title || '').trim(),
      excerpt: (req.body.excerpt || '').trim(),
      body: (req.body.body || '').trim() || null,
      image,
      date_label: (req.body.date_label || '').trim(),
      size: req.body.size === 'tall' ? 'tall' : 'short',
      featured: req.body.featured ? true : false,
      source_url: sourceUrl(req.body.source_url),
      updated_at: knex.fn.now()
    });
    res.redirect('/panel/admin?type=ok&msg=Noticia+actualizada#noticias');
  } catch (e) { next(e); }
});

router.post('/admin/event/:id/update', auth.requireAdmin, async (req, res) => {
  try {
    const { data, error } = actividadBody(req.body);
    if (error) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(error) + '#calendario');
    await knex('events').where({ id: req.params.id }).update(Object.assign(data, { updated_at: knex.fn.now() }));
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Actividad actualizada') + '#calendario');
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message) + '#calendario');
  }
});

router.post('/admin/milestone/:id/update', auth.requireAdmin, async (req, res) => {
  try {
    const { data, error } = etapaBody(req.body);
    if (error) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(error) + '#cronograma');
    await knex('milestones').where({ id: req.params.id }).update(Object.assign(data, { updated_at: knex.fn.now() }));
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Etapa actualizada') + '#cronograma');
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message) + '#cronograma');
  }
});

// Categorías (tiers): editar etiqueta, color, monto, cupo y beneficios
router.post('/admin/tier/:id/update', auth.requireAdmin, async (req, res, next) => {
  try {
    const benefits = (req.body.benefits || '').split('\n').map(s => s.trim()).filter(Boolean);
    await knex('tiers').where({ id: req.params.id }).update({
      label: (req.body.label || '').trim(),
      color: (req.body.color || '#6C3CE0').trim(),
      amount: parseInt(req.body.amount || '0', 10) || 0,
      count: parseInt(req.body.count || '0', 10) || 0,
      benefits: JSON.stringify(benefits),
      updated_at: knex.fn.now()
    });
    res.redirect('/panel/admin?type=ok&msg=Categor%C3%ADa+actualizada#categorias');
  } catch (e) { next(e); }
});

// ── Notificaciones ──
// Un solo formulario cubre segmento (todos/inversionistas/patrocinadores) y
// directa (un destinatario). Los canales van por casillas; in-app siempre.
router.post('/admin/notify', auth.requireAdmin, async (req, res, next) => {
  try {
    const title = (req.body.title || '').trim();
    const body = (req.body.body || '').trim();
    if (!title) return res.redirect('/panel/admin?type=error&msg=El+t%C3%ADtulo+es+obligatorio#notificaciones');

    const target = req.body.target === 'user' ? 'user' : 'audience';
    let userId = null;
    if (target === 'user') {
      userId = parseInt(req.body.user_id, 10) || null;
      if (!userId) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Elige a quién va dirigida') + '#notificaciones');
      const dest = await knex('users').where({ id: userId }).first();
      if (!dest || dest.role === 'admin') return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Destinatario no válido') + '#notificaciones');
    }
    const channels = ['in-app'];
    if (req.body.ch_email) channels.push('email');
    if (req.body.ch_sms) channels.push('sms');

    const r = await notify({
      type: userId ? 'directa' : (req.body.notif_type || 'comunicado'),
      title, body,
      audience: req.body.audience,
      userId,
      eventId: parseInt(req.body.event_id, 10) || null,
      channels
    });
    const partes = [`in-app a ${r.recipients}`];
    if (channels.includes('email')) partes.push(`email a ${r.emailed}`);
    if (channels.includes('sms')) partes.push(`SMS a ${r.smsed}`);
    const aviso = r.errors.length ? ` — ${r.errors.length} fallo(s), revisa el log` : '';
    res.redirect('/panel/admin?type=' + (r.errors.length ? 'error' : 'ok') + '&msg=' +
      encodeURIComponent(`Notificación enviada (${partes.join(', ')})${aviso}`) + '#notificaciones');
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message) + '#notificaciones');
  }
});

router.post('/admin/notification/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('notifications').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=Notificaci%C3%B3n+eliminada#notificaciones'); } catch (e) { next(e); }
});

// Compartir una noticia como notificación
router.post('/admin/news/:id/notify', auth.requireAdmin, async (req, res, next) => {
  try {
    const n = await knex('news').where({ id: req.params.id }).first();
    if (!n) return res.redirect('/panel/admin?type=error&msg=Noticia+no+encontrada#noticias');
    const r = await notify({ type: 'post', title: n.title, body: n.excerpt, audience: 'all', channels: ['in-app', 'email'] });
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`Noticia compartida con ${r.recipients} usuarios (email a ${r.emailed})`) + '#noticias');
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════
// EDICIONES DE LA CUP (contenido público administrable)
// ════════════════════════════════════════════════
// Las rutas /admin/edition* se retiraron al unificar: la edición (pública y de
// inversión) se guarda en /admin/portfolio. La tabla `editions` sigue existiendo
// con sus datos por si hiciera falta mirarla, pero ya nadie le escribe.

// ════════════════════════════════════════════════
// EVENTOS DEL PORTAFOLIO (multievento = ediciones por año)
// ════════════════════════════════════════════════
const PORTFOLIO_PHASES = ['planeacion', 'negociacion', 'produccion', 'evento', 'cierre'];
const PHASE_LABELS = { planeacion: 'Planeación', negociacion: 'Negociación', produccion: 'Producción', evento: 'Evento', cierre: 'Cierre' };
function portfolioBody(b) {
  const num = (v) => parseInt(String(v || '').replace(/[^0-9]/g, ''), 10) || 0;
  return {
    code: (b.code || '').trim() || null,
    year: parseInt(b.year, 10) || null,
    title: (b.title || '').trim(),
    subtitle: (b.subtitle || '').trim() || null,
    match: (b.match || '').trim() || null,
    description: (b.description || '').trim() || null,
    venue: (b.venue || '').trim() || null,
    city: (b.city || '').trim() || null,
    country: (b.country || '').trim() || null,
    event_date: (b.event_date || '').trim() || null,
    date_phase: (b.date_phase || '').trim() || null,
    budget: num(b.budget),
    projected_income: num(b.projected_income),
    phase: PORTFOLIO_PHASES.includes(b.phase) ? b.phase : 'planeacion',
    // Estado de la parte pública: decide si la edición tiene página propia
    // (`past`), si es la que viene (`upcoming`) o si ese año no hubo (`pause`).
    status: ['past', 'upcoming', 'pause'].includes(b.status) ? b.status : 'past',
    progress_pct: Math.max(0, Math.min(100, num(b.progress_pct))),
    is_demo: b.is_demo ? true : false,
    accent: (b.accent || '#6C3CE0').trim(),
    presentation_es: (b.presentation_es || '').trim() || null,
    presentation_en: (b.presentation_en || '').trim() || null,
    capacity: num(b.capacity),
    ticket_price: num(b.ticket_price),
    deductions_pct: num(b.deductions_pct),
    rebate_per: num(b.rebate_per),
    cap_pct: num(b.cap_pct),
    investor_split: num(b.investor_split)
  };
}
// Una edición = un año = una fila. Aquí se guarda TODO: identidad, contenido
// público (data_es/data_en), presentación e inversión. No hay una segunda tabla
// con el mismo año que se pueda desincronizar.
async function edicionValida(body, idActual) {
  const year = edValidYear(body.year);
  if (!year) return 'El año debe tener 4 dígitos, entre 2000 y 2100';
  if (!String(body.title || '').trim()) return 'El título es obligatorio';
  let q = knex('portfolio_events').where({ year: parseInt(year, 10) });
  if (idActual) q = q.whereNot({ id: idActual });
  if (await q.first()) return `Ya existe la edición ${year}. Una edición por año: edita la que ya está.`;
  return null;
}

router.post('/admin/portfolio', auth.requireAdmin, async (req, res) => {
  try {
    const error = await edicionValida(req.body, null);
    if (error) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(error) + '#eventos');
    const data = portfolioBody(req.body);
    const { data_es, data_en } = buildEditionData(req.body);
    data.data_es = data_es;
    data.data_en = data_en;
    const max = await knex('portfolio_events').max({ m: 'sort' }).first();
    data.sort = (Number(max && max.m) || 0) + 1;
    await knex('portfolio_events').insert(data);
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`Edición ${data.year} creada`) + '#eventos');
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message) + '#eventos');
  }
});
router.post('/admin/portfolio/:id/update', auth.requireAdmin, async (req, res) => {
  try {
    const row = await knex('portfolio_events').where({ id: req.params.id }).first();
    if (!row) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Edición no encontrada') + '#eventos');
    const error = await edicionValida(req.body, row.id);
    if (error) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(error) + '#eventos');
    const data = portfolioBody(req.body);
    const { data_es, data_en } = buildEditionData(req.body);
    data.data_es = data_es;
    data.data_en = data_en;
    await knex('portfolio_events').where({ id: row.id }).update(Object.assign(data, { updated_at: knex.fn.now() }));
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`Edición ${data.year} actualizada`) + '#eventos');
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message) + '#eventos');
  }
});
router.post('/admin/portfolio/:id/delete', auth.requireAdmin, async (req, res) => {
  try {
    const id = req.params.id;
    const ev = await knex('portfolio_events').where({ id }).first();
    if (!ev) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Edición no encontrada') + '#eventos');

    // Con inversiones registradas no se borra: son registros de dinero de gente
    // real. Primero hay que sacarlos desde la cuenta de cada inversionista.
    const conCapital = await knex('investments').where({ event_id: id }).count({ n: '*' }).first();
    if (Number(conCapital.n) > 0) {
      return res.redirect('/panel/admin?type=error&msg=' +
        encodeURIComponent(`${ev.title} tiene ${conCapital.n} inversión(es) registrada(s). Quítalas primero desde la cuenta de cada inversionista.`) + '#eventos');
    }

    // Lo demás sí cuelga de la edición y se va con ella: si no, quedan filas
    // apuntando a un event_id que ya no existe.
    await knex('event_packages').where({ event_id: id }).del();
    await knex('event_updates').where({ event_id: id }).del();
    await knex('event_documents').where({ event_id: id }).del();
    await knex('event_media').where({ event_id: id }).del();
    await knex('event_communications').where({ event_id: id }).del();
    await knex('portfolio_events').where({ id }).del();

    // Si era la edición activa, se vuelve automática en vez de dejar al panel
    // apuntando a algo que ya no está.
    const cfg = await getDashboardConfig();
    if (String(cfg.activeEditionId) === String(id)) await saveDashboardConfig({ activeEditionId: '' });

    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`Edición ${ev.title} eliminada`) + '#eventos');
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message) + '#eventos');
  }
});

// ── FAQ (admin) ──
function faqBody(b) {
  return {
    audience: ['all', 'investor', 'sponsor'].includes(b.audience) ? b.audience : 'all',
    question: (b.question || '').trim(),
    answer: (b.answer || '').trim() || null,
    is_active: b.is_active ? true : false,
    sort: parseInt(b.sort || '0', 10) || 0
  };
}
router.post('/admin/faq', auth.requireAdmin, async (req, res, next) => {
  try {
    const data = faqBody(req.body);
    if (!data.question) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('La pregunta es obligatoria') + '#faq');
    if (!data.sort) { const max = await knex('faqs').max({ m: 'sort' }).first(); data.sort = (Number(max && max.m) || 0) + 1; }
    await knex('faqs').insert(data);
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Pregunta agregada') + '#faq');
  } catch (e) { next(e); }
});
router.post('/admin/faq/:id/update', auth.requireAdmin, async (req, res, next) => {
  try {
    await knex('faqs').where({ id: req.params.id }).update(Object.assign(faqBody(req.body), { updated_at: knex.fn.now() }));
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Pregunta actualizada') + '#faq');
  } catch (e) { next(e); }
});
router.post('/admin/faq/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('faqs').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Pregunta eliminada') + '#faq'); } catch (e) { next(e); }
});

// ── Paquetes de inversión por edición ──
function packageBody(b) {
  const num = (v) => parseInt(String(v || '').replace(/[^0-9]/g, ''), 10) || 0;
  return {
    name: (b.name || '').trim(),
    modality: ['fijo', 'riesgo', 'patrocinio'].includes(b.modality) ? b.modality : 'fijo',
    amount: num(b.amount),
    return_pct: parseFloat(String(b.return_pct || '').replace(/[^0-9.]/g, '')) || 0,
    count: num(b.count),
    benefits: (b.benefits || '').trim() || null,
    user_id: (b.user_id && /^\d+$/.test(String(b.user_id))) ? parseInt(b.user_id, 10) : null, // null = general
    is_active: b.is_active ? true : false
  };
}
// ════════════════════════════════════════════════
// GESTIÓN DE UNA EDICIÓN (cronología, data room, medios, comunicaciones)
// Una página por edición, igual que /admin/user/:id es una página por cuenta.
// ════════════════════════════════════════════════
const DR_FOLDERS = ['Clubes', 'Estadio', 'Proveedores', 'Contratos de inversión', 'Finanzas', 'General', 'Evidencias'];
const DOC_STATES = { revision: 'En revisión', aprobado: 'Aprobado', firmado: 'Firmado' };
const VISIBILITY = { all: 'Todos', fijo: 'Solo retorno fijo', riesgo: 'Solo participación a riesgo' };

function evDate(v) {
  const d = String(v == null ? '' : v).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(d) ? d : null;
}

router.get('/admin/evento/:id', auth.requireAdmin, async (req, res, next) => {
  try {
    const ev = await knex('portfolio_events').where({ id: req.params.id }).first();
    if (!ev) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Edición no encontrada') + '#eventos');

    const [updates, docs, media, comms, invs, packages, agenda] = await Promise.all([
      knex('event_updates').where({ event_id: ev.id }).orderBy([{ column: 'update_date', order: 'desc' }, { column: 'id', order: 'desc' }]),
      knex('event_documents').where({ event_id: ev.id }).orderBy([{ column: 'folder' }, { column: 'sort' }, { column: 'id' }]),
      knex('event_media').where({ event_id: ev.id }).orderBy([{ column: 'media_date', order: 'desc' }, { column: 'id', order: 'desc' }]),
      knex('event_communications').where({ event_id: ev.id }).orderBy('id', 'desc'),
      knex('investments').where({ event_id: ev.id }),
      knex('event_packages').where({ event_id: ev.id }),
      knex('match_agenda').where({ event_id: ev.id }).orderBy([{ column: 'sort' }, { column: 'id' }])
    ]);

    const users = await knex('users').whereNot({ role: 'admin' });
    const userById = {};
    users.forEach(u => { userById[u.id] = u; });

    // El data room y las evidencias son la misma tabla; los separa la carpeta.
    const esEvidencia = (d) => d.folder === 'Evidencias';
    const mapDoc = (d) => ({
      id: d.id, name: d.name, url: d.url || '', folder: d.folder || 'General',
      status: d.status || 'revision', statusLabel: DOC_STATES[d.status] || d.status,
      visibility: d.visibility || 'all', visibilityLabel: VISIBILITY[d.visibility] || d.visibility,
      isDemo: !!d.is_demo
    });

    // KPIs derivados: no se capturan a mano, se cuentan. Si se capturaran,
    // quedarían desactualizados en cuanto alguien agregue algo.
    const capital = invs.reduce((n, i) => n + Number(i.capital || 0), 0);
    const budget = Number(ev.budget || 0);
    const porModalidad = { fijo: 0, riesgo: 0 };
    invs.forEach(i => { porModalidad[i.modality === 'riesgo' ? 'riesgo' : 'fijo'] += Number(i.capital || 0); });

    res.render('panel/admin-evento', {
      layout: 'panel',
      title: `${ev.title} · Administración · SOCCER iD`,
      pageHeading: ev.title,
      pageSub: 'Cronología, data room, evidencias, medios y comunicaciones de esta edición',
      active: 'admin',
      panel: buildAdminPanel(req.panelUser),
      flash: req.query.msg,
      flashType: req.query.type,
      ev: {
        id: ev.id, title: ev.title, year: ev.year || '', code: ev.code || '',
        match: ev.match || '', venue: ev.venue || '', city: ev.city || '',
        dateLabel: ev.event_date || '', phase: ev.phase || 'planeacion',
        phaseLabel: (PHASE_LABELS[ev.phase] || ev.phase), progress: ev.progress_pct || 0,
        accent: ev.accent || '#6C3CE0', isDemo: !!ev.is_demo
      },
      kpis: {
        capital: formatUSD(capital),
        budget: formatUSD(budget),
        coverturePct: budget > 0 ? Math.min(100, Math.round(capital / budget * 100)) : 0,
        investors: invs.length,
        packages: packages.length,
        docs: docs.filter(d => !esEvidencia(d)).length,
        evidences: docs.filter(esEvidencia).length,
        media: media.length,
        updates: updates.length,
        fijo: formatUSD(porModalidad.fijo),
        riesgo: formatUSD(porModalidad.riesgo),
        fijoPct: capital > 0 ? Math.round(porModalidad.fijo / capital * 100) : 0,
        riesgoPct: capital > 0 ? Math.round(porModalidad.riesgo / capital * 100) : 0
      },
      updates: updates.map(u => ({
        id: u.id, date: u.update_date || '', title: u.title, description: u.description || '',
        phase: u.phase || '', phaseLabel: PHASE_LABELS[u.phase] || u.phase || '—', isDemo: !!u.is_demo
      })),
      docs: docs.filter(d => !esEvidencia(d)).map(mapDoc),
      evidences: docs.filter(esEvidencia).map(mapDoc),
      media: media.map(m => ({
        id: m.id, title: m.title, source: m.source || '', url: m.url || '',
        date: m.media_date || '', isDemo: !!m.is_demo
      })),
      comms: comms.map(c => ({
        id: c.id, title: c.title, body: c.body || '', audience: c.audience || 'all',
        audienceLabel: VISIBILITY[c.audience] || c.audience,
        status: c.status || 'activo', date: c.comm_date || ''
      })),
      agenda: agenda.map(a => ({
        id: a.id, time: a.time_label || '', title: a.title, sub: a.sub || '', color: a.color || '#6C3CE0'
      })),
      investments: invs.map(i => ({
        id: i.id, name: (userById[i.user_id] || {}).name || 'Cuenta eliminada',
        email: (userById[i.user_id] || {}).email || '',
        modality: i.modality, modalityLabel: i.modality === 'riesgo' ? 'Participación a riesgo' : 'Retorno fijo',
        capital: formatUSD(i.capital), returnPct: i.return_pct || 0, state: i.state || 'activa'
      })),
      phases: PORTFOLIO_PHASES.map(k => ({ key: k, label: PHASE_LABELS[k] || k })),
      folders: DR_FOLDERS.filter(f => f !== 'Evidencias'),
      docStates: Object.keys(DOC_STATES).map(k => ({ key: k, label: DOC_STATES[k] })),
      visibilities: Object.keys(VISIBILITY).map(k => ({ key: k, label: VISIBILITY[k] })),
      s3: require('../lib/uploads').s3Enabled
    });
  } catch (e) { next(e); }
});

const evBack = (id, ok, msg, hash) =>
  `/panel/admin/evento/${id}?type=${ok ? 'ok' : 'error'}&msg=${encodeURIComponent(msg)}${hash ? '#' + hash : ''}`;

// ── Cronología (avances) ──
router.post('/admin/evento/:id/avance', auth.requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const title = (req.body.title || '').trim();
    if (!title) return res.redirect(evBack(id, false, 'El avance necesita título', 'cronologia'));
    await knex('event_updates').insert({
      event_id: id, title,
      description: (req.body.description || '').trim() || null,
      update_date: evDate(req.body.update_date),
      phase: PORTFOLIO_PHASES.includes(req.body.phase) ? req.body.phase : null,
      is_demo: false
    });
    res.redirect(evBack(id, true, 'Avance agregado', 'cronologia'));
  } catch (e) { res.redirect(evBack(id, false, e.message, 'cronologia')); }
});
router.post('/admin/evento/:id/avance/:aid/delete', auth.requireAdmin, async (req, res) => {
  try {
    const n = await knex('event_updates').where({ id: req.params.aid, event_id: req.params.id }).del();
    res.redirect(evBack(req.params.id, !!n, n ? 'Avance eliminado' : 'Ese avance no es de esta edición', 'cronologia'));
  } catch (e) { res.redirect(evBack(req.params.id, false, e.message, 'cronologia')); }
});

// ── Data room y evidencias (misma tabla, distinta carpeta) ──
router.post('/admin/evento/:id/documento', auth.requireAdmin, async (req, res) => {
  const id = req.params.id;
  const hash = req.body.folder === 'Evidencias' ? 'evidencias' : 'dataroom';
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.redirect(evBack(id, false, 'El documento necesita nombre', hash));
    const url = sourceUrl(req.body.url);
    if ((req.body.url || '').trim() && !url) {
      return res.redirect(evBack(id, false, 'El enlace debe empezar con http:// o https://', hash));
    }
    await knex('event_documents').insert({
      event_id: id, name, url,
      folder: DR_FOLDERS.includes(req.body.folder) ? req.body.folder : 'General',
      status: DOC_STATES[req.body.status] ? req.body.status : 'revision',
      visibility: VISIBILITY[req.body.visibility] ? req.body.visibility : 'all',
      is_demo: false
    });
    res.redirect(evBack(id, true, 'Documento agregado', hash));
  } catch (e) { res.redirect(evBack(id, false, e.message, hash)); }
});
router.post('/admin/evento/:id/documento/:did/estado', auth.requireAdmin, async (req, res) => {
  try {
    const estado = DOC_STATES[req.body.status] ? req.body.status : 'revision';
    const n = await knex('event_documents').where({ id: req.params.did, event_id: req.params.id }).update({ status: estado, updated_at: knex.fn.now() });
    res.redirect(evBack(req.params.id, !!n, n ? `Documento marcado como ${DOC_STATES[estado].toLowerCase()}` : 'Ese documento no es de esta edición', 'dataroom'));
  } catch (e) { res.redirect(evBack(req.params.id, false, e.message, 'dataroom')); }
});
router.post('/admin/evento/:id/documento/:did/delete', auth.requireAdmin, async (req, res) => {
  try {
    const n = await knex('event_documents').where({ id: req.params.did, event_id: req.params.id }).del();
    res.redirect(evBack(req.params.id, !!n, n ? 'Documento eliminado' : 'Ese documento no es de esta edición', 'dataroom'));
  } catch (e) { res.redirect(evBack(req.params.id, false, e.message, 'dataroom')); }
});

// ── En medios (cobertura de terceros; distinto de las noticias propias) ──
router.post('/admin/evento/:id/medio', auth.requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const title = (req.body.title || '').trim();
    if (!title) return res.redirect(evBack(id, false, 'La nota necesita título', 'medios'));
    const url = sourceUrl(req.body.url);
    if ((req.body.url || '').trim() && !url) {
      return res.redirect(evBack(id, false, 'El enlace debe empezar con http:// o https://', 'medios'));
    }
    await knex('event_media').insert({
      event_id: id, title, url,
      source: (req.body.source || '').trim() || null,
      media_date: evDate(req.body.media_date),
      is_demo: false
    });
    res.redirect(evBack(id, true, 'Nota agregada', 'medios'));
  } catch (e) { res.redirect(evBack(id, false, e.message, 'medios')); }
});
router.post('/admin/evento/:id/medio/:mid/delete', auth.requireAdmin, async (req, res) => {
  try {
    const n = await knex('event_media').where({ id: req.params.mid, event_id: req.params.id }).del();
    res.redirect(evBack(req.params.id, !!n, n ? 'Nota eliminada' : 'Esa nota no es de esta edición', 'medios'));
  } catch (e) { res.redirect(evBack(req.params.id, false, e.message, 'medios')); }
});

// ── Agenda del día del partido (por edición) ──
router.post('/admin/evento/:id/agenda', auth.requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const title = (req.body.title || '').trim();
    if (!title) return res.redirect(evBack(id, false, 'El bloque necesita título', 'agenda'));
    const hora = (req.body.time_label || '').trim();
    if (hora && !/^\d{1,2}:\d{2}$/.test(hora)) return res.redirect(evBack(id, false, 'La hora va como 19:00', 'agenda'));
    const max = await knex('match_agenda').where({ event_id: id }).max({ m: 'sort' }).first();
    await knex('match_agenda').insert({
      event_id: id, title,
      time_label: hora || null,
      sub: (req.body.sub || '').trim() || null,
      color: /^#[0-9a-f]{6}$/i.test(req.body.color || '') ? req.body.color : '#6C3CE0',
      sort: (Number(max && max.m) || 0) + 1
    });
    res.redirect(evBack(id, true, 'Bloque agregado a la agenda', 'agenda'));
  } catch (e) { res.redirect(evBack(id, false, e.message, 'agenda')); }
});
router.post('/admin/evento/:id/agenda/:aid/delete', auth.requireAdmin, async (req, res) => {
  try {
    const n = await knex('match_agenda').where({ id: req.params.aid, event_id: req.params.id }).del();
    res.redirect(evBack(req.params.id, !!n, n ? 'Bloque eliminado' : 'Ese bloque no es de esta edición', 'agenda'));
  } catch (e) { res.redirect(evBack(req.params.id, false, e.message, 'agenda')); }
});

// ── Comunicaciones por edición y modalidad ──
// Se apoyan en el mismo despachador de notificaciones (issue 13): quedan en el
// panel del inversionista y salen por correo si él lo tiene activado.
router.post('/admin/evento/:id/comunicacion', auth.requireAdmin, async (req, res) => {
  const id = req.params.id;
  try {
    const title = (req.body.title || '').trim();
    if (!title) return res.redirect(evBack(id, false, 'La comunicación necesita título', 'comunicaciones'));
    const body = (req.body.body || '').trim();
    const audience = VISIBILITY[req.body.audience] ? req.body.audience : 'all';
    await knex('event_communications').insert({
      event_id: id, title, body: body || null, audience,
      status: req.body.status === 'concluido' ? 'concluido' : 'activo',
      comm_date: evDate(req.body.comm_date), is_demo: false
    });

    // A quién le toca: los inversionistas con inversión en esta edición y, si la
    // comunicación es por modalidad, solo los de esa modalidad.
    let avisados = 0, correos = 0;
    if (req.body.notificar) {
      let q = knex('investments').where({ event_id: id });
      if (audience !== 'all') q = q.andWhere({ modality: audience });
      const destinos = await q;
      const ids = [...new Set(destinos.map(d => d.user_id))];
      for (const uid of ids) {
        const r = await notify({
          type: 'comunicado', userId: uid, channels: ['in-app', 'email'],
          eventId: parseInt(id, 10) || null, title, body
        });
        avisados += r.recipients;
        correos += r.emailed;
      }
    }
    const extra = req.body.notificar ? ` · avisados ${avisados} (email a ${correos})` : '';
    res.redirect(evBack(id, true, 'Comunicación guardada' + extra, 'comunicaciones'));
  } catch (e) { res.redirect(evBack(id, false, e.message, 'comunicaciones')); }
});
router.post('/admin/evento/:id/comunicacion/:cid/delete', auth.requireAdmin, async (req, res) => {
  try {
    const n = await knex('event_communications').where({ id: req.params.cid, event_id: req.params.id }).del();
    res.redirect(evBack(req.params.id, !!n, n ? 'Comunicación eliminada' : 'Esa comunicación no es de esta edición', 'comunicaciones'));
  } catch (e) { res.redirect(evBack(req.params.id, false, e.message, 'comunicaciones')); }
});

router.post('/admin/portfolio/:eventId/package', auth.requireAdmin, async (req, res, next) => {
  try {
    const data = packageBody(req.body);
    if (!data.name) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('El nombre del paquete es obligatorio') + '#eventos');
    data.event_id = parseInt(req.params.eventId, 10);
    const max = await knex('event_packages').where({ event_id: data.event_id }).max({ m: 'sort' }).first();
    data.sort = (Number(max && max.m) || 0) + 1;
    await knex('event_packages').insert(data);
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Paquete agregado') + '#eventos');
  } catch (e) { next(e); }
});
router.post('/admin/package/:id/update', auth.requireAdmin, async (req, res, next) => {
  try {
    await knex('event_packages').where({ id: req.params.id }).update(Object.assign(packageBody(req.body), { updated_at: knex.fn.now() }));
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Paquete actualizado') + '#eventos');
  } catch (e) { next(e); }
});
router.post('/admin/package/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try {
    await knex('event_packages').where({ id: req.params.id }).del();
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Paquete eliminado') + '#eventos');
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════
// CÓDIGOS DE ACCESO A LA PROPUESTA 2027 + PROSPECTOS (LEADS)
// ════════════════════════════════════════════════
router.post('/admin/code', auth.requireAdmin, async (req, res, next) => {
  try {
    const code = (req.body.code || '').trim();
    if (!code) return res.redirect('/panel/admin?type=error&msg=C%C3%B3digo+vac%C3%ADo#codigos');
    const ex = await knex('access_codes').where({ code }).first();
    if (ex) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Ese código ya existe') + '#codigos');
    await knex('access_codes').insert({ code, status: req.body.status === 'used' ? 'used' : 'unused' });
    res.redirect('/panel/admin?type=ok&msg=C%C3%B3digo+agregado#codigos');
  } catch (e) { next(e); }
});

router.post('/admin/codes/generate', auth.requireAdmin, async (req, res, next) => {
  try {
    const n = Math.min(Math.max(parseInt(req.body.count || '10', 10) || 10, 1), 100);
    const existing = new Set((await knex('access_codes').select('code')).map(r => r.code));
    const rows = []; let made = 0, guard = 0;
    while (made < n && guard < n * 60) {
      guard++;
      const c = String(Math.floor(1000000 + Math.random() * 9000000));
      if (existing.has(c)) continue;
      existing.add(c); rows.push({ code: c, status: 'unused' }); made++;
    }
    if (rows.length) await knex('access_codes').insert(rows);
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`${rows.length} códigos generados`) + '#codigos');
  } catch (e) { next(e); }
});

router.post('/admin/code/:id/status', auth.requireAdmin, async (req, res, next) => {
  try {
    const status = req.body.status === 'used' ? 'used' : 'unused';
    await knex('access_codes').where({ id: req.params.id }).update({ status, updated_at: knex.fn.now() });
    res.redirect('/panel/admin?type=ok&msg=Estado+actualizado#codigos');
  } catch (e) { next(e); }
});

// Asignar el código a una persona (dueño) + tags para el mapa de relaciones
router.post('/admin/code/:id/assign', auth.requireAdmin, async (req, res, next) => {
  try {
    const c = await knex('access_codes').where({ id: req.params.id }).first();
    if (!c) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Código no encontrado') + '#codigos');
    const name = (req.body.assignee_name || '').trim().slice(0, 120);
    const email = codeMap.normEmail(req.body.assignee_email);
    const phoneRaw = (req.body.assignee_phone || '').replace(/[^\d+]/g, '');
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('El correo del dueño no es válido') + '#codigos');
    }
    if (phoneRaw && phoneRaw.replace(/\D/g, '').length < 8) {
      return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('El teléfono del dueño está incompleto') + '#codigos');
    }
    const tags = codeMap.parseTags(req.body.tags).join(', ');
    const asignado = !!(name || email || phoneRaw);
    await knex('access_codes').where({ id: c.id }).update({
      assignee_name: name || null,
      assignee_email: email || null,
      assignee_phone: phoneRaw || null,
      tags: tags || null,
      assigned_at: asignado ? knex.fn.now() : null,
      updated_at: knex.fn.now()
    });

    // Los accesos que ya estaban se re-evalúan contra el dueño nuevo: si no, el
    // mapa arrancaría vacío para todo lo que pasó antes de asignar.
    const updated = Object.assign({}, c, { assignee_name: name, assignee_email: email, assignee_phone: phoneRaw });
    const previos = await knex('access_log').where({ code: c.code });
    for (const a of previos) {
      const m = codeMap.matchOwner(updated, { name: a.name, email: a.email });
      await knex('access_log').where({ id: a.id }).update({ matched_owner: m });
    }
    const msg = asignado
      ? `Código ${c.code} asignado a ${name || email || phoneRaw}` + (previos.length ? ` (${previos.length} acceso(s) recalculado(s))` : '')
      : `Código ${c.code} sin dueño`;
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(msg) + '#codigos');
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message) + '#codigos');
  }
});

router.post('/admin/code/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('access_codes').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=C%C3%B3digo+eliminado#codigos'); } catch (e) { next(e); }
});

// ── Twilio (SMS): las llaves se configuran aquí, no por variables de entorno ──
router.post('/admin/settings/twilio', auth.requireAdmin, async (req, res, next) => {
  try {
    const sid = (req.body.account_sid || '').trim();
    const token = (req.body.auth_token || '').trim();
    const from = (req.body.from || '').trim();
    if (sid && !/^AC[0-9a-f]{32}$/i.test(sid)) {
      return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('El Account SID de Twilio empieza con AC y tiene 34 caracteres') + '#configuracion');
    }
    if (from && !/^(\+\d{8,15}|MG[0-9a-f]{32})$/i.test(from)) {
      return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('El remitente debe ser un número en formato +521234567890 o un Messaging Service SID (MG...)') + '#configuracion');
    }
    await panelSms.saveConfig({ account_sid: sid, auth_token: token, from });
    // Con las tres llaves puestas el SMS queda activo solo; si falta alguna, se dice cuál.
    const cfg = await panelSms.getPublicConfig();
    const msg = cfg.ready
      ? 'Twilio guardado — el canal SMS quedó activo'
      : `Twilio guardado, pero falta ${cfg.missingLabel}: el SMS sigue apagado`;
    res.redirect('/panel/admin?type=' + (cfg.ready ? 'ok' : 'error') + '&msg=' + encodeURIComponent(msg) + '#configuracion');
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message) + '#configuracion');
  }
});

router.post('/admin/settings/twilio/test', auth.requireAdmin, async (req, res, next) => {
  try {
    const to = (req.body.to || '').trim();
    if (!to) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Pon un número para la prueba') + '#configuracion');
    const r = await panelSms.sendSms({ to, body: 'SOCCER iD — SMS de prueba desde el panel. Si lo recibiste, Twilio quedó bien configurado.' });
    const msg = r.sent ? `SMS de prueba enviado a ${to}` : `No se pudo enviar: ${r.error}`;
    res.redirect('/panel/admin?type=' + (r.sent ? 'ok' : 'error') + '&msg=' + encodeURIComponent(msg) + '#configuracion');
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message) + '#configuracion');
  }
});

router.post('/admin/settings/twilio/clear', auth.requireAdmin, async (req, res, next) => {
  try {
    await panelSms.clearConfig();
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Credenciales de Twilio borradas') + '#configuracion');
  } catch (e) { next(e); }
});

router.post('/admin/settings/notify', auth.requireAdmin, async (req, res, next) => {
  try {
    const value = (req.body.notify_emails || '').trim();
    const ex = await knex('app_settings').where({ key: 'notify_emails' }).first();
    if (ex) await knex('app_settings').where({ key: 'notify_emails' }).update({ value });
    else await knex('app_settings').insert({ key: 'notify_emails', value });
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Correos de notificación actualizados') + '#codigos');
  } catch (e) { next(e); }
});

// Configuración del dashboard — guardado PARCIAL por grupo.
// Cada tarjeta envía un `group` y solo esos campos se actualizan (el resto se conserva).
// La edición activa la decide el admin: es la que ven TODOS los inversionistas.
// No hay selector del lado del inversionista, a propósito.
router.post('/admin/settings/edicion-activa', auth.requireAdmin, async (req, res) => {
  try {
    const id = parseInt(req.body.active_edition_id, 10) || '';
    if (id) {
      const ex = await knex('portfolio_events').where({ id }).first();
      if (!ex) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Esa edición no existe') + '#eventos');
      await saveDashboardConfig({ activeEditionId: String(id) });
      return res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`Los inversionistas ahora ven ${ex.title}`) + '#eventos');
    }
    await saveDashboardConfig({ activeEditionId: '' });
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Edición activa automática (la de mayor año)') + '#eventos');
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message) + '#eventos');
  }
});

router.post('/admin/settings/dashboard', auth.requireAdmin, async (req, res, next) => {
  try {
    const b = req.body;
    const num = (v, d) => { const n = parseFloat(String(v).replace(/[^0-9.\-]/g, '')); return isNaN(n) ? d : n; };
    const group = b.group || 'all';
    const patch = {};

    if (group === 'advisor' || group === 'all') {
      patch.advisor = {
        name: (b.adv_name || '').trim(), role: (b.adv_role || '').trim(),
        phone: (b.adv_phone || '').trim(), whatsapp: (b.adv_whatsapp || '').replace(/[^0-9]/g, ''), initials: ''
      };
    }
    if (group === 'folder' || group === 'all') {
      const sharedUrl = (b.sf_url || '').trim();
      patch.sharedFolder = sharedUrl ? { name: (b.sf_name || '').trim() || 'Carpeta compartida', description: (b.sf_desc || '').trim(), url: sharedUrl } : null;
    }
    if (group === 'event' || group === 'all') {
      patch.eventDate = (b.event_date || '').trim() || '2027-03-27';
      patch.eventTime = (b.event_time || '').trim() || '19:00';
      patch.eventLabel = (b.event_label || '').trim();
    }
    if (group === 'invest' || group === 'all') {
      patch.fixedRate = num(b.fixed_rate, 25);
      patch.investorSplit = num(b.investor_split, 50);
      patch.projectCost = num(b.project_cost, 1000000);
      patch.ticketPrice = num(b.ticket_price, 100);
      patch.referenceAttendance = num(b.reference_attendance, 21800);
    }
    if (group === 'sales' || group === 'all') {
      patch.ticketsSold = num(b.tickets_sold, 0);
      patch.salesUpdated = (b.sales_updated || '').trim();
      patch.breakEvenTickets = (b.break_even_tickets === undefined || String(b.break_even_tickets).trim() === '') ? '' : num(b.break_even_tickets, '');
    }
    if (group === 'stage' || group === 'all') {
      patch.stageLabel = (b.stage_label || '').trim();
      patch.stageStep = num(b.stage_step, 1);
      patch.stageTotal = num(b.stage_total, 6);
      patch.stageNote = (b.stage_note || '').trim();
      patch.stageUpdated = (b.stage_updated || '').trim();
    }
    if (group === 'trace' || group === 'all') {
      patch.returnSource = (b.return_source || '').trim();
      patch.returnUpdated = (b.return_updated || '').trim();
    }
    await saveDashboardConfig(patch);
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent('Configuración guardada') + '#configuracion');
  } catch (e) { next(e); }
});

router.post('/admin/lead/:id/status', auth.requireAdmin, async (req, res, next) => {
  try {
    const status = ['nuevo', 'contactado', 'cliente', 'descartado'].includes(req.body.status) ? req.body.status : 'nuevo';
    await knex('leads').where({ id: req.params.id }).update({ status, updated_at: knex.fn.now() });
    res.redirect('/panel/admin?type=ok&msg=Prospecto+actualizado#leads');
  } catch (e) { next(e); }
});

router.post('/admin/lead/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('leads').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=Prospecto+eliminado#leads'); } catch (e) { next(e); }
});

router.post('/admin/lead/:id/email', auth.requireAdmin, async (req, res, next) => {
  try {
    const lead = await knex('leads').where({ id: req.params.id }).first();
    if (!lead) return res.redirect('/panel/admin?type=error&msg=Prospecto+no+encontrado#leads');
    const r = await sendLeadEmail({ to: lead.email, name: lead.name, subject: (req.body.subject || '').trim(), body: (req.body.body || '').trim() });
    if (r.sent && lead.status === 'nuevo') await knex('leads').where({ id: lead.id }).update({ status: 'contactado', updated_at: knex.fn.now() });
    res.redirect('/panel/admin?type=' + (r.sent ? 'ok' : 'error') + '&msg=' + encodeURIComponent(r.sent ? `Correo enviado a ${lead.email}` : ('Error: ' + (r.error || 'no enviado'))) + '#leads');
  } catch (e) { next(e); }
});

router.post('/admin/leads/email', auth.requireAdmin, async (req, res, next) => {
  try {
    const subject = (req.body.subject || '').trim();
    const body = (req.body.body || '').trim();
    const audience = req.body.audience;
    let q = knex('leads');
    if (['nuevo', 'contactado', 'cliente', 'descartado'].includes(audience)) q = q.where({ status: audience });
    const leads = await q;
    let sent = 0;
    for (const l of leads) {
      const r = await sendLeadEmail({ to: l.email, name: l.name, subject, body });
      if (r.sent) sent++;
    }
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`Correo enviado a ${sent} de ${leads.length} prospectos`) + '#leads');
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════
// EDICIÓN POR CUENTA (una página por inversionista/patrocinador)
// ════════════════════════════════════════════════
router.get('/admin/user/:id', auth.requireAdmin, async (req, res, next) => {
  try {
    const user = await knex('users').where({ id: req.params.id }).first();
    if (!user || user.role === 'admin') return res.redirect('/panel/admin?type=error&msg=Usuario+no+encontrado');
    const cfg = await getDashboardConfig();
    const tiers = await getTiers();
    const tier = findTier(tiers, user.role, user.category);
    const advOverride = safeParse(user.advisor, null);
    const benefitsOverride = safeParse(user.benefits, null);
    const ret = computeReturn(user, cfg);

    const docRows = await knex('user_documents').where({ user_id: user.id }).orderBy('id', 'desc');
    const documents = docRows.map(d => ({ id: d.id, name: d.name, url: d.url, meta: d.meta, ext: d.ext, category: d.category || 'General', docDate: shortDate(d.doc_date) }));

    res.render('panel/admin-user', {
      layout: 'panel',
      title: `Editar cuenta · ${user.name} · SOCCER iD`,
      pageHeading: `Editar cuenta de ${user.name}`,
      pageSub: 'Todo lo que edites aquí afecta únicamente el panel de esta cuenta',
      active: 'admin',
      panel: buildAdminPanel(req.panelUser),
      flash: req.query.msg,
      flashType: req.query.type,
      account: {
        id: user.id, name: user.name, email: user.email, role: user.role,
        isSponsor: user.role === 'sponsor',
        color: (tier && tier.color) || '#8A8F98',
        category: user.category || '', amountRaw: user.amount || 0,
        investmentType: user.investment_type === 'riesgo' ? 'riesgo' : 'fijo',
        status: user.status, active: user.status === 'active',
        memberId: user.member_id || '—',
        // overrides
        advName: advOverride ? advOverride.name : '', advRole: advOverride ? advOverride.role : '',
        advPhone: advOverride ? advOverride.phone : '', advWhatsapp: advOverride ? advOverride.whatsapp : '',
        benefitsText: Array.isArray(benefitsOverride) ? benefitsOverride.join('\n') : '',
        returnRate: (user.return_rate === null || user.return_rate === undefined) ? '' : user.return_rate,
        activations: user.activations || '',
        // valores heredados (para mostrar como placeholder / referencia)
        globalAdvisor: cfg.advisor || {},
        categoryBenefits: (tier && tier.benefits) || [],
        computedReturnPct: ret.returnPct, computedReturn: ret.projectedReturn,
        documents, docCount: documents.length
      },
      investorTiers: tiers.filter(t => t.role === 'investor').map(t => ({ key: t.key, label: t.label, amount: t.amount })),
      sponsorTiers: tiers.filter(t => t.role === 'sponsor').map(t => ({ key: t.key, label: t.label, amount: t.amount })),
      s3: require('../lib/uploads').s3Enabled
    });
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════
// VISTA PREVIA (admin ve el panel como inversionista/patrocinador)
// ════════════════════════════════════════════════
// Vista previa del panel real de una cuenta específica (debe ir antes de :role)
router.get('/admin/preview/user/:id', auth.requireAdmin, async (req, res, next) => {
  try {
    const user = await knex('users').where({ id: req.params.id }).first();
    if (!user || user.role === 'admin') return res.redirect('/panel/admin?type=error&msg=Usuario+no+encontrado');
    const roleLabel = user.role === 'sponsor' ? 'Patrocinador' : 'Inversionista';
    res.render('panel/dashboard', {
      layout: 'panel',
      title: `Vista previa · ${user.name} · SOCCER iD`,
      pageHeading: `Vista previa · ${user.name}`,
      pageSub: `Así ve su panel esta cuenta (${roleLabel})`,
      active: 'dashboard',
      previewRole: user.role,
      previewLabel: user.name,
      previewUserId: user.id,
      panel: await buildPanelData(user)
    });
  } catch (e) { next(e); }
});

router.get('/admin/preview/:role', auth.requireAdmin, async (req, res, next) => {
  try {
    const role = req.params.role === 'sponsor' ? 'sponsor' : 'investor';
    // Sin esto el usuario de ejemplo siempre cae en 'fijo' y no habia forma de
    // previsualizar la vista de riesgo (desempeno + simulador).
    const modality = req.query.modality === 'riesgo' ? 'riesgo' : 'fijo';
    const tiers = await getTiers();
    const roleTiers = tiers.filter(t => t.role === role);
    // Toma la categoría de mayor monto como ejemplo representativo
    const tier = roleTiers.slice().sort((a, b) => (b.amount || 0) - (a.amount || 0))[0] || null;
    const sampleUser = {
      id: 0,
      name: role === 'sponsor' ? 'Patrocinador de ejemplo' : 'Inversionista de ejemplo',
      role,
      category: tier ? tier.key : '',
      amount: tier ? tier.amount : 0,
      investment_type: modality,
      member_id: role === 'sponsor' ? 'SIDC-S01' : 'SIDC-D01',
      created_at: null,
      notifications_seen_id: 0
    };
    const roleLabel = role === 'sponsor' ? 'Patrocinador' : 'Inversionista';
    res.render('panel/dashboard', {
      layout: 'panel',
      title: `Vista previa · ${roleLabel} · SOCCER iD Investor Hub`,
      pageHeading: `Vista previa · ${roleLabel}`,
      pageSub: 'Previsualización de solo lectura del portal del usuario',
      active: 'dashboard',
      previewRole: role,
      previewLabel: roleLabel,
      previewModality: role === 'investor' ? modality : '',
      panel: await buildPanelData(sampleUser)
    });
  } catch (e) { next(e); }
});

module.exports = router;
