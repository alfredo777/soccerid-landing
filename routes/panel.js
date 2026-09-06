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
const turnstile = require('../lib/turnstile');

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
function buildEditionData(body) {
  const shared = {
    year: (body.year || '').trim(),
    match: (body.match || '').trim(),
    date: (body.date || '').trim(),
    city: (body.city || '').trim(),
    venue: (body.venue || '').trim(),
    banner: (body.banner || '').trim(),
    sponsors: edParse(body.sponsors, ED_KEYS.sponsors),
    videos: edParse(body.videos, ED_KEYS.videos),
    images: edParse(body.images, ED_KEYS.images)
  };
  const es = Object.assign({}, shared, {
    title: (body.title_es || '').trim(),
    description: (body.description_es || '').trim(),
    attendance: { value: (body.att_value || '').trim(), label: (body.att_label_es || '').trim() },
    stats: edParse(body.stats_es, ED_KEYS.stats),
    mediaLinks: edParse(body.media_es, ED_KEYS.media)
  });
  const en = Object.assign({}, shared, {
    title: (body.title_en || body.title_es || '').trim(),
    description: (body.description_en || '').trim(),
    attendance: { value: (body.att_value || '').trim(), label: (body.att_label_en || '').trim() },
    stats: edParse(body.stats_en, ED_KEYS.stats),
    mediaLinks: edParse(body.media_en, ED_KEYS.media)
  });
  return { data_es: JSON.stringify(es), data_en: JSON.stringify(en) };
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

// Notificaciones dirigidas a un usuario (audiencia 'all' o su rol)
async function notificationsForUser(user) {
  const rows = await knex('notifications')
    .where('audience', 'all').orWhere('audience', user.role)
    .orderBy('id', 'desc');
  const seenId = user.notifications_seen_id || 0;
  const unread = rows.filter(n => n.id > seenId).length;
  return { rows, unread };
}

// ── Ensambla el objeto `panel` para un usuario (inversionista/patrocinador) ──
async function buildPanelData(user) {
  const config = loadConfig();
  const cfg = await getDashboardConfig();
  const tiers = await getTiers();
  const isSponsor = user.role === 'sponsor';
  const tier = findTier(tiers, user.role, user.category) || { label: user.category || '—', color: '#6C3CE0', bg: '#EFE9FC', benefits: [] };

  // Inversión activa del usuario en el portafolio (si existe). Alimenta el cálculo
  // SIN cambiar la fórmula: capital/modalidad/retorno vienen de la inversión y se
  // pasan a computeReturn (return_pct actúa como el override return_rate).
  let investment = null, invEvent = null;
  try {
    investment = await knex('investments').where({ user_id: user.id })
      .orderByRaw("CASE state WHEN 'activa' THEN 0 ELSE 1 END")
      .orderBy([{ column: 'sort' }, { column: 'id' }]).first();
    if (investment) invEvent = await knex('portfolio_events').where({ id: investment.event_id }).first();
  } catch (_) {}
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

  // Hitos
  const mileRows = await knex('milestones').orderBy([{ column: 'sort', order: 'asc' }, { column: 'id', order: 'asc' }]);
  const MILE_STATUS = { completado: 'Completado', en_curso: 'En curso', pendiente: 'Pendiente' };
  const milestones = mileRows.map(m => {
    const status = m.status || (m.done ? 'completado' : 'pendiente');
    return {
      title: m.title, date: m.date_label, done: status === 'completado', inProgress: status === 'en_curso',
      highlight: !!m.highlight, owner: m.owner || '', status, statusLabel: MILE_STATUS[status] || 'Pendiente'
    };
  });

  // Calendario (mes en foco)
  const fmonth = config.focus.month, fyear = config.focus.year;
  const evRows = await knex('events').where({ month: fmonth, year: fyear }).orderBy('day');
  const events = evRows.map(e => ({ day: e.day, title: e.title, type: e.type, color: e.color, match: !!e.is_match }));
  const firstWeekday = new Date(fyear, fmonth - 1, 1).getDay();
  const daysInMonth = new Date(fyear, fmonth, 0).getDate();
  const cells = [];
  for (let i = 0; i < firstWeekday; i++) cells.push({ empty: true });
  for (let day = 1; day <= daysInMonth; day++) {
    const dayEvents = events.filter(e => e.day === day);
    cells.push({ day, events: dayEvents, match: dayEvents.some(e => e.match) });
  }

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

  return {
    simulator,
    eventPerf,
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
    milestones,
    calendarCells: cells,
    calendar: {
      monthLabel: MONTHS_ES_CAP[fmonth - 1],
      year: String(fyear),
      agendaDate: config.matchAgendaDate,
      agenda: config.matchAgenda
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
  res.render('panel/login', { layout: false, error: req.query.error, ok: req.query.ok });
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
      panel: await buildPanelData(req.panelUser)
    });
  } catch (e) { next(e); }
});

router.get('/noticias', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
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
      excerpt: n.excerpt, body: n.body || '', image: n.image, date: n.date_label
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

router.get('/calendario', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
    res.render('panel/calendario', {
      layout: 'panel',
      title: 'Calendario · SOCCER iD Investor Hub',
      pageHeading: 'Calendario y cronograma',
      pageSub: 'Fechas clave rumbo al 27 de marzo de 2027',
      active: 'calendario',
      panel: await buildPanelData(req.panelUser)
    });
  } catch (e) { next(e); }
});

router.get('/notificaciones', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
    const { rows } = await notificationsForUser(req.panelUser);
    const seenId = req.panelUser.notifications_seen_id || 0;
    const list = rows.map(n => ({
      title: n.title, body: n.body,
      date: new Date(n.created_at).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'long', year: 'numeric' }),
      unread: n.id > seenId
    }));
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

// ════════════════════════════════════════════════
// PANEL DEL DUEÑO (ADMIN)
// ════════════════════════════════════════════════
router.get('/admin', auth.requireAdmin, async (req, res, next) => {
  try {
    const tiers = await getTiers();
    const users = await knex('users').whereNot({ role: 'admin' }).orderBy('id', 'desc');
    const news = await knex('news').orderBy([{ column: 'featured', order: 'desc' }, { column: 'sort', order: 'asc' }]);
    const events = await knex('events').orderBy([{ column: 'year' }, { column: 'month' }, { column: 'day' }]);
    const MILE_LABELS = { completado: 'Completado', en_curso: 'En curso', pendiente: 'Pendiente' };
    const milestones = (await knex('milestones').orderBy('sort')).map(m => {
      const status = m.status || (m.done ? 'completado' : 'pendiente');
      return Object.assign({}, m, { status, statusLabel: MILE_LABELS[status] || 'Pendiente', owner: m.owner || '' });
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

    // Ediciones de la CUP
    const editionRows = await knex('editions').orderBy([{ column: 'sort' }, { column: 'year' }]);
    const statusLabels = { past: 'Pasada', upcoming: 'Próxima', pause: 'Pausa' };
    const editionsView = editionRows.map(r => {
      const es = safeParse(r.data_es, {}) || {};
      const en = safeParse(r.data_en, {}) || {};
      return {
        id: r.id, year: r.year, status: r.status, statusLabel: statusLabels[r.status] || r.status,
        sort: r.sort, match: es.match || '', city: es.city || '', title: es.title || '',
        imageCount: (es.images || []).length,
        form: {
          id: r.id, year: r.year, status: r.status, sort: r.sort,
          match: es.match || '', date: es.date || '', city: es.city || '', venue: es.venue || '', banner: es.banner || '',
          att_value: (es.attendance || {}).value || '',
          att_label_es: (es.attendance || {}).label || '', att_label_en: (en.attendance || {}).label || '',
          title_es: es.title || '', title_en: en.title || '',
          description_es: es.description || '', description_en: en.description || '',
          stats_es: edJoin(es.stats, ED_KEYS.stats), stats_en: edJoin(en.stats, ED_KEYS.stats),
          media_es: edJoin(es.mediaLinks, ED_KEYS.media), media_en: edJoin(en.mediaLinks, ED_KEYS.media),
          sponsors: edJoin(es.sponsors, ED_KEYS.sponsors),
          videos: edJoin(es.videos, ED_KEYS.videos),
          images: edJoin(es.images, ED_KEYS.images)
        }
      };
    });

    // Registro de accesos: una sola consulta, se deriva todo (por código y por prospecto)
    const allAccess = await knex('access_log').orderBy('id', 'desc');
    const fmtWhen = (d) => d ? new Date(d).toLocaleString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';

    // Historial por código (cruzable con prospectos: incluye nombre/email/lead)
    const codesHistory = {};
    allAccess.forEach(a => {
      (codesHistory[a.code] = codesHistory[a.code] || []).push({
        leadId: a.lead_id || null, name: a.name || '—', email: a.email || '—',
        ip: a.ip || '—', device: (a.device_id || '').slice(0, 10) || '—', newDevice: !!a.new_device,
        when: fmtWhen(a.created_at)
      });
    });

    // Códigos de acceso a la propuesta 2027
    const codeRows = await knex('access_codes').orderBy([{ column: 'status' }, { column: 'id' }]);
    const codesView = codeRows.map(c => ({
      id: c.id, code: c.code, status: c.status,
      statusLabel: c.status === 'used' ? 'Usado' : 'Por usar', isTest: c.note === 'test',
      accesses: (codesHistory[c.code] || []).length
    }));
    const codesUsed = codesView.filter(c => c.status === 'used').length;
    const codesUnused = codesView.filter(c => c.status === 'unused' && !c.isTest).length;

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

    const notifyRow = await knex('app_settings').where({ key: 'notify_emails' }).first();
    const notifyEmails = notifyRow ? (notifyRow.value || '') : '';

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
      notifications: notifications.map(n => ({
        id: n.id, title: n.title, body: n.body, audience: n.audience,
        date: new Date(n.created_at).toLocaleDateString('es-MX', { timeZone: 'America/Mexico_City', day: 'numeric', month: 'short', year: 'numeric' })
      })),
      tiers: tiers.map(t => ({
        id: t.id, key: t.key, role: t.role, roleLabel: t.role === 'sponsor' ? 'Patrocinador' : 'Inversionista',
        label: t.label, color: t.color, amount: t.amount, count: t.count,
        benefitsText: (t.benefits || []).join('\n'), benefitsCount: (t.benefits || []).length
      })),
      investorTiers: tiers.filter(t => t.role === 'investor').map(t => ({ key: t.key, label: t.label, amount: t.amount })),
      sponsorTiers: tiers.filter(t => t.role === 'sponsor').map(t => ({ key: t.key, label: t.label, amount: t.amount })),
      editions: editionsView,
      editionsForms: editionsView.map(e => e.form),
      codes: codesView, codesUsed, codesUnused, codesHistory,
      leads: leadsView, leadsCount: leadsView.length, leadsHistory,
      accessLog: accessView,
      notifyEmails,
      dashboardConfig: await getDashboardConfig(),
      capitalItems, risksAdmin,
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
    const back = req.body.redirect === 'account' ? `/panel/admin/user/${user.id}?type=ok&msg=${encodeURIComponent('Documento agregado')}` : '/panel/admin?type=ok&msg=' + encodeURIComponent(`Documento agregado a ${user.name}`);
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
      sort: parseInt(req.body.sort || '99', 10) || 99
    });
    res.redirect('/panel/admin?type=ok&msg=Noticia+publicada#noticias');
  } catch (e) { next(e); }
});
router.post('/admin/news/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('news').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=Noticia+eliminada#noticias'); } catch (e) { next(e); }
});

// Eventos del calendario
router.post('/admin/event', auth.requireAdmin, async (req, res, next) => {
  try {
    const typeColors = { 'Evento': '#6C3CE0', 'Actualización': '#A78BE6', 'Patrocinio': '#14141B', 'Prensa': '#8A8F98', 'Partido': '#6C3CE0' };
    const type = req.body.type || 'Evento';
    await knex('events').insert({
      day: parseInt(req.body.day, 10) || 1,
      month: parseInt(req.body.month, 10) || 3,
      year: parseInt(req.body.year, 10) || 2027,
      title: (req.body.title || '').trim(),
      type, color: typeColors[type] || '#6C3CE0',
      is_match: type === 'Partido'
    });
    res.redirect('/panel/admin?type=ok&msg=Evento+agregado#calendario');
  } catch (e) { next(e); }
});
router.post('/admin/event/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('events').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=Evento+eliminado#calendario'); } catch (e) { next(e); }
});

// Hitos / cronograma
const MILE_STATUSES = ['pendiente', 'en_curso', 'completado'];
router.post('/admin/milestone', auth.requireAdmin, async (req, res, next) => {
  try {
    const status = MILE_STATUSES.includes(req.body.status) ? req.body.status : 'pendiente';
    await knex('milestones').insert({
      title: (req.body.title || '').trim(),
      date_label: (req.body.date_label || '').trim(),
      owner: (req.body.owner || '').trim() || null,
      status,
      done: status === 'completado',
      highlight: req.body.highlight ? true : false,
      sort: parseInt(req.body.sort || '99', 10) || 99
    });
    res.redirect('/panel/admin?type=ok&msg=Hito+agregado#cronograma');
  } catch (e) { next(e); }
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
      updated_at: knex.fn.now()
    });
    res.redirect('/panel/admin?type=ok&msg=Noticia+actualizada#noticias');
  } catch (e) { next(e); }
});

router.post('/admin/event/:id/update', auth.requireAdmin, async (req, res, next) => {
  try {
    const typeColors = { 'Evento': '#6C3CE0', 'Actualización': '#A78BE6', 'Patrocinio': '#14141B', 'Prensa': '#8A8F98', 'Partido': '#6C3CE0' };
    const type = req.body.type || 'Evento';
    await knex('events').where({ id: req.params.id }).update({
      day: parseInt(req.body.day, 10) || 1,
      month: parseInt(req.body.month, 10) || 3,
      year: parseInt(req.body.year, 10) || 2027,
      title: (req.body.title || '').trim(),
      type, color: typeColors[type] || '#6C3CE0',
      is_match: type === 'Partido',
      updated_at: knex.fn.now()
    });
    res.redirect('/panel/admin?type=ok&msg=Evento+actualizado#calendario');
  } catch (e) { next(e); }
});

router.post('/admin/milestone/:id/update', auth.requireAdmin, async (req, res, next) => {
  try {
    const status = MILE_STATUSES.includes(req.body.status) ? req.body.status : 'pendiente';
    await knex('milestones').where({ id: req.params.id }).update({
      title: (req.body.title || '').trim(),
      date_label: (req.body.date_label || '').trim(),
      owner: (req.body.owner || '').trim() || null,
      status,
      done: status === 'completado',
      highlight: req.body.highlight ? true : false,
      updated_at: knex.fn.now()
    });
    res.redirect('/panel/admin?type=ok&msg=Hito+actualizado#cronograma');
  } catch (e) { next(e); }
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
router.post('/admin/notify', auth.requireAdmin, async (req, res, next) => {
  try {
    const title = (req.body.title || '').trim();
    const body = (req.body.body || '').trim();
    const audience = ['all', 'investor', 'sponsor'].includes(req.body.audience) ? req.body.audience : 'all';
    if (!title) return res.redirect('/panel/admin?type=error&msg=El+t%C3%ADtulo+es+obligatorio#notificaciones');
    await knex('notifications').insert({ title, body, audience });
    let emailed = 0;
    if (req.body.sendEmail) {
      let q = knex('users').where({ status: 'active' }).whereNot({ role: 'admin' });
      if (audience !== 'all') q = q.andWhere({ role: audience });
      const recipients = await q;
      recipients.forEach(u => { sendNotification({ to: u.email, name: u.name, title, body }).catch(() => {}); });
      emailed = recipients.length;
    }
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`Notificación enviada${emailed ? ` (email a ${emailed})` : ''}`) + '#notificaciones');
  } catch (e) { next(e); }
});

router.post('/admin/notification/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('notifications').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=Notificaci%C3%B3n+eliminada#notificaciones'); } catch (e) { next(e); }
});

// Compartir una noticia como notificación
router.post('/admin/news/:id/notify', auth.requireAdmin, async (req, res, next) => {
  try {
    const n = await knex('news').where({ id: req.params.id }).first();
    if (!n) return res.redirect('/panel/admin?type=error&msg=Noticia+no+encontrada#noticias');
    await knex('notifications').insert({ title: n.title, body: n.excerpt, audience: 'all' });
    const recipients = await knex('users').where({ status: 'active' }).whereNot({ role: 'admin' });
    recipients.forEach(u => { sendNotification({ to: u.email, name: u.name, title: n.title, body: n.excerpt }).catch(() => {}); });
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`Noticia compartida con ${recipients.length} usuarios`) + '#noticias');
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════
// EDICIONES DE LA CUP (contenido público administrable)
// ════════════════════════════════════════════════
router.post('/admin/edition', auth.requireAdmin, async (req, res, next) => {
  try {
    const year = (req.body.year || '').trim();
    if (!year) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('El año es obligatorio') + '#ediciones');
    const existing = await knex('editions').where({ year }).first();
    if (existing) return res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent('Ya existe una edición con ese año') + '#ediciones');
    const status = ['past', 'upcoming', 'pause'].includes(req.body.status) ? req.body.status : 'past';
    const sort = parseInt(req.body.sort || year, 10) || 0;
    const { data_es, data_en } = buildEditionData(req.body);
    await knex('editions').insert({ year, status, sort, data_es, data_en });
    res.redirect('/panel/admin?type=ok&msg=Edici%C3%B3n+creada#ediciones');
  } catch (e) { next(e); }
});

router.post('/admin/edition/:id/update', auth.requireAdmin, async (req, res, next) => {
  try {
    const row = await knex('editions').where({ id: req.params.id }).first();
    if (!row) return res.redirect('/panel/admin?type=error&msg=Edici%C3%B3n+no+encontrada#ediciones');
    const year = (req.body.year || row.year).trim();
    const status = ['past', 'upcoming', 'pause'].includes(req.body.status) ? req.body.status : 'past';
    const sort = parseInt(req.body.sort || year, 10) || 0;
    const { data_es, data_en } = buildEditionData(req.body);
    await knex('editions').where({ id: row.id }).update({ year, status, sort, data_es, data_en, updated_at: knex.fn.now() });
    res.redirect('/panel/admin?type=ok&msg=Edici%C3%B3n+actualizada#ediciones');
  } catch (e) { next(e); }
});

router.post('/admin/edition/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try {
    await knex('editions').where({ id: req.params.id }).del();
    res.redirect('/panel/admin?type=ok&msg=Edici%C3%B3n+eliminada#ediciones');
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

router.post('/admin/code/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('access_codes').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=C%C3%B3digo+eliminado#codigos'); } catch (e) { next(e); }
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
      panel: await buildPanelData(sampleUser)
    });
  } catch (e) { next(e); }
});

module.exports = router;
