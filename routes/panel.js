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
const { uploadImage, uploadDocument } = require('../lib/uploads');

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
  const tiers = await getTiers();
  const isSponsor = user.role === 'sponsor';
  const tier = findTier(tiers, user.role, user.category) || { label: user.category || '—', color: '#6C3CE0', bg: '#EFE9FC', benefits: [] };

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

  const notifs = await notificationsForUser(user);

  // Documentos personalizados del usuario (contratos y documentos legales)
  const docRows = await knex('user_documents').where({ user_id: user.id }).orderBy('id', 'desc');
  const userDocuments = docRows.map(d => ({ id: d.id, name: d.name, url: d.url, meta: d.meta, ext: d.ext }));

  return {
    org: config.org,
    eventLabel: config.eventLabel,
    unread: notifs.unread,
    advisor: config.advisor,
    documents: userDocuments,
    userDocuments,
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

router.get('/notificaciones', auth.requireAuth, async (req, res, next) => {
  try {
    if (req.panelUser.role === 'admin') return res.redirect('/panel/admin');
    const { rows } = await notificationsForUser(req.panelUser);
    const seenId = req.panelUser.notifications_seen_id || 0;
    const list = rows.map(n => ({
      title: n.title, body: n.body,
      date: new Date(n.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' }),
      unread: n.id > seenId
    }));
    // Marcar todas como vistas
    const maxId = rows.length ? Math.max(...rows.map(n => n.id)) : 0;
    if (maxId > seenId) await knex('users').where({ id: req.panelUser.id }).update({ notifications_seen_id: maxId });

    const panel = await buildPanelData(req.panelUser);
    panel.unread = 0;
    res.render('panel/notificaciones', {
      layout: 'panel',
      title: 'Notificaciones · SOCCER iD Investor Portal',
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
      title: 'Contratos y documentos · SOCCER iD Investor Portal',
      pageHeading: 'Contratos y documentos legales',
      pageSub: 'Documentación privada compartida contigo por SOCCER iD',
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
    const milestones = await knex('milestones').orderBy('sort');
    const notifications = await knex('notifications').orderBy('id', 'desc');
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

    res.render('panel/admin', {
      layout: 'panel',
      title: 'Administración · SOCCER iD Investor Portal',
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
        color: (findTier(tiers, u.role, u.category) || {}).color || '#8A8F98',
        docs: docsByUser[u.id] || [], docCount: (docsByUser[u.id] || []).length
      })),
      docsByUser,
      news, events, milestones,
      notifications: notifications.map(n => ({
        id: n.id, title: n.title, body: n.body, audience: n.audience,
        date: new Date(n.created_at).toLocaleDateString('es-MX', { day: 'numeric', month: 'short', year: 'numeric' })
      })),
      tiers: tiers.map(t => ({
        id: t.id, key: t.key, role: t.role, roleLabel: t.role === 'sponsor' ? 'Patrocinador' : 'Inversionista',
        label: t.label, color: t.color, amount: t.amount, count: t.count,
        benefitsText: (t.benefits || []).join('\n'), benefitsCount: (t.benefits || []).length
      })),
      investorTiers: tiers.filter(t => t.role === 'investor').map(t => ({ key: t.key, label: t.label, amount: t.amount })),
      sponsorTiers: tiers.filter(t => t.role === 'sponsor').map(t => ({ key: t.key, label: t.label, amount: t.amount })),
      editions: editionsView,
      editionsForms: editionsView.map(e => e.form)
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
    await knex('user_documents').insert({ user_id: user.id, name, url, meta: 'Google Drive', ext: null });
    res.redirect('/panel/admin?type=ok&msg=' + encodeURIComponent(`Documento agregado a ${user.name}`));
  } catch (e) {
    res.redirect('/panel/admin?type=error&msg=' + encodeURIComponent(e.message));
  }
});
router.post('/admin/document/:id/delete', auth.requireAdmin, async (req, res, next) => {
  try { await knex('user_documents').where({ id: req.params.id }).del(); res.redirect('/panel/admin?type=ok&msg=Documento+eliminado'); } catch (e) { next(e); }
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
    await knex('users').where({ id: user.id }).update({
      name: (req.body.name || user.name).trim(),
      email,
      role: req.body.role === 'sponsor' ? 'sponsor' : 'investor',
      category: (req.body.category || '').trim(),
      amount: parseInt(req.body.amount || '0', 10) || 0,
      status,
      updated_at: knex.fn.now()
    });
    res.redirect('/panel/admin?type=ok&msg=Usuario+actualizado');
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
    await knex('milestones').where({ id: req.params.id }).update({
      title: (req.body.title || '').trim(),
      date_label: (req.body.date_label || '').trim(),
      done: req.body.done ? true : false,
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
// VISTA PREVIA (admin ve el panel como inversionista/patrocinador)
// ════════════════════════════════════════════════
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
      title: `Vista previa · ${roleLabel} · SOCCER iD Investor Portal`,
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
