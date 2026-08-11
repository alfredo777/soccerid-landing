/**
 * Panel de inversionistas / patrocinadores — Fase 2
 * Login por invitación + base de datos + panel del dueño (admin).
 */
const express = require('express');
const path = require('path');
const fs = require('fs');
const router = express.Router();

const knex = require('../db/knex');
const auth = require('../lib/panelAuth');
const { sendInvite } = require('../lib/panelMailer');

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
function tierFor(config, role, key) {
  const list = role === 'sponsor' ? config.sponsorTiers : config.investorTiers;
  return list.find(t => t.key === key) || null;
}

// ── Ensambla el objeto `panel` para un usuario (inversionista/patrocinador) ──
async function buildPanelData(user) {
  const config = loadConfig();
  const isSponsor = user.role === 'sponsor';
  const tier = tierFor(config, user.role, user.category) || { label: user.category || '—', color: '#6C3CE0', bg: '#EFE9FC', benefits: [] };

  const amountLabel = formatUSD(user.amount);
  const projected = formatUSD(Math.round((user.amount || 0) * 1.25));

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
    projectedReturn: projected,
    returnPct: 'Hasta 25%'
  };

  const stats = isSponsor ? [
    { label: 'Monto patrocinado', value: amountLabel, icon: 'wallet', accent: '#6C3CE0' },
    { label: 'Categoría', value: tier.label, sub: 'Patrocinador', icon: 'diamond', accent: '#14141B' },
    { label: 'Activaciones', value: 'Incluidas', sub: 'Según categoría', icon: 'trend', accent: '#14141B' },
    { label: 'Faltan para el partido', value: '—', sub: '27 marzo 2027', icon: 'clock', accent: '#14141B', countdown: true }
  ] : [
    { label: 'Monto invertido', value: amountLabel, icon: 'wallet', accent: '#6C3CE0' },
    { label: 'Retorno proyectado', value: projected, sub: 'Hasta 25%', icon: 'trend', accent: '#14141B' },
    { label: 'Tu categoría', value: tier.label, sub: user.category === 'diamante' ? 'Nivel máximo' : 'Inversionista', icon: 'diamond', accent: '#6C3CE0' },
    { label: 'Faltan para el partido', value: '—', sub: '27 marzo 2027', icon: 'clock', accent: '#14141B', countdown: true }
  ];

  // Distribución (estructura planeada del cupo) + donut
  const distribution = config.investorTiers.map(t => ({ label: t.label, count: t.count, color: t.color }));
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
  const milestones = mileRows.map(m => ({ title: m.title, date: m.date_label, done: !!m.done, highlight: !!m.highlight }));

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

  return {
    org: config.org,
    eventLabel: config.eventLabel,
    advisor: config.advisor,
    documents: config.documents,
    user: panelUser,
    userBenefits: tier.benefits || [],
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
      title: 'Dashboard · SOCCER iD Investor Portal',
      pageHeading: `Hola, ${req.panelUser.name.split(/\s+/)[0]} 👋`,
      pageSub: 'Bienvenido a tu panel de inversionista SOCCER iD CUP',
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
      title: 'Noticias · SOCCER iD Investor Portal',
      pageHeading: 'Noticias del evento',
      pageSub: 'Anuncios, actualizaciones y prensa de SOCCER iD CUP 2027',
      active: 'noticias',
      panel: await buildPanelData(req.panelUser)
    });
  } catch (e) { next(e); }
});

router.get('/calendario', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
    res.render('panel/calendario', {
      layout: 'panel',
      title: 'Calendario · SOCCER iD Investor Portal',
      pageHeading: 'Calendario y cronograma',
      pageSub: 'Fechas clave rumbo al 27 de marzo de 2027',
      active: 'calendario',
      panel: await buildPanelData(req.panelUser)
    });
  } catch (e) { next(e); }
});

// ════════════════════════════════════════════════
// PANEL DEL DUEÑO (ADMIN)
// ════════════════════════════════════════════════
router.get('/admin', auth.requireAdmin, async (req, res, next) => {
  try {
    const config = loadConfig();
    const users = await knex('users').whereNot({ role: 'admin' }).orderBy('id', 'desc');
    const news = await knex('news').orderBy([{ column: 'featured', order: 'desc' }, { column: 'sort', order: 'asc' }]);
    const events = await knex('events').orderBy([{ column: 'year' }, { column: 'month' }, { column: 'day' }]);
    const milestones = await knex('milestones').orderBy('sort');

    const roleLabel = (u) => u.role === 'sponsor' ? 'Patrocinador' : 'Inversionista';
    const tierLabel = (u) => {
      const t = tierFor(config, u.role, u.category);
      return t ? t.label : '—';
    };

    res.render('panel/admin', {
      layout: 'panel',
      title: 'Administración · SOCCER iD Investor Portal',
      pageHeading: 'Panel del organizador',
      pageSub: 'Invita usuarios, publica noticias y gestiona el evento',
      active: 'admin',
      panel: buildAdminPanel(req.panelUser),
      flash: req.query.msg,
      flashType: req.query.type,
      users: users.map(u => ({
        id: u.id, name: u.name, email: u.email, role: u.role, roleLabel: roleLabel(u),
        tierLabel: tierLabel(u), amount: formatUSD(u.amount), status: u.status,
        color: (tierFor(config, u.role, u.category) || {}).color || '#8A8F98'
      })),
      news, events, milestones,
      investorTiers: config.investorTiers.map(t => ({ key: t.key, label: t.label, amount: t.amount })),
      sponsorTiers: config.sponsorTiers.map(t => ({ key: t.key, label: t.label, amount: t.amount }))
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
      status: 'invited', invite_token: token, invite_expires: expires
    });

    const config = loadConfig();
    const tier = tierFor(config, role, category);
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
    const config = loadConfig();
    const tier = tierFor(config, user.role, user.category);
    const baseUrl = process.env.BASE_URL || (process.env.NODE_ENV === 'production' ? 'https://soccerid.co' : `http://localhost:${process.env.PORT || 3000}`);
    await sendInvite({ to: user.email, name: user.name, activateUrl: `${baseUrl}/panel/activar/${token}`, categoryLabel: tier ? tier.label : '', roleLabel: user.role === 'sponsor' ? 'Patrocinador' : 'Inversionista' });
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`Invitación reenviada a ${user.email}`));
  } catch (e) { next(e); }
});

// Eliminar usuario
router.post('/admin/user/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try {
    await knex('users').where({ id: req.params.id }).whereNot({ role: 'admin' }).del();
    res.redirect('/panel/admin?type=ok&msg=Usuario+eliminado');
  } catch (e) { next(e); }
});

// Noticias
router.post('/admin/news', auth.requireAdmin, async (req, res, next) => {
  try {
    const tag = req.body.tag || 'Anuncio';
    const tagColors = { 'Anuncio': '#6C3CE0', 'Actualización': '#14141B', 'Prensa': '#6B7280' };
    await knex('news').insert({
      tag, tag_color: tagColors[tag] || '#6C3CE0',
      title: (req.body.title || '').trim(),
      excerpt: (req.body.excerpt || '').trim(),
      image: (req.body.image || '/assets/images/gallery/cup2025/6.jpg').trim(),
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
router.post('/admin/milestone', auth.requireAdmin, async (req, res, next) => {
  try {
    await knex('milestones').insert({
      title: (req.body.title || '').trim(),
      date_label: (req.body.date_label || '').trim(),
      done: req.body.done ? true : false,
      highlight: req.body.highlight ? true : false,
      sort: parseInt(req.body.sort || '99', 10) || 99
    });
    res.redirect('/panel/admin?type=ok&msg=Hito+agregado#cronograma');
  } catch (e) { next(e); }
});
router.post('/admin/milestone/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('milestones').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=Hito+eliminado#cronograma'); } catch (e) { next(e); }
});

module.exports = router;
