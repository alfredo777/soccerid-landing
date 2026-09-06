/**
 * Creación de tablas + datos iniciales (idempotente).
 * Se ejecuta al arrancar el servidor.
 */
const knex = require('./knex');
const bcrypt = require('bcryptjs');

async function ensureSchema() {
  if (!(await knex.schema.hasTable('users'))) {
    await knex.schema.createTable('users', (t) => {
      t.increments('id').primary();
      t.string('name').notNullable();
      t.string('email').notNullable().unique();
      t.string('role').notNullable().defaultTo('investor'); // investor | sponsor | admin
      t.string('category');                                  // tier key
      t.bigInteger('amount').defaultTo(0);                   // USD
      t.string('member_id');
      t.string('status').notNullable().defaultTo('invited'); // invited | active | disabled
      t.string('password_hash');
      t.string('invite_token');
      t.bigInteger('invite_expires');
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('news'))) {
    await knex.schema.createTable('news', (t) => {
      t.increments('id').primary();
      t.string('tag').defaultTo('Anuncio');
      t.string('tag_color').defaultTo('#6C3CE0');
      t.string('title').notNullable();
      t.text('excerpt');
      t.string('image');
      t.string('date_label');
      t.string('size').defaultTo('short'); // tall | short
      t.boolean('featured').defaultTo(false);
      t.integer('sort').defaultTo(0);
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('events'))) {
    await knex.schema.createTable('events', (t) => {
      t.increments('id').primary();
      t.integer('day').notNullable();
      t.integer('month').notNullable();
      t.integer('year').notNullable();
      t.string('title').notNullable();
      t.string('type').defaultTo('Evento');
      t.string('color').defaultTo('#6C3CE0');
      t.boolean('is_match').defaultTo(false);
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('milestones'))) {
    await knex.schema.createTable('milestones', (t) => {
      t.increments('id').primary();
      t.string('title').notNullable();
      t.string('date_label');
      t.boolean('done').defaultTo(false);
      t.boolean('highlight').defaultTo(false);
      t.integer('sort').defaultTo(0);
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('notifications'))) {
    await knex.schema.createTable('notifications', (t) => {
      t.increments('id').primary();
      t.string('title').notNullable();
      t.text('body');
      t.string('audience').defaultTo('all'); // all | investor | sponsor
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('user_documents'))) {
    await knex.schema.createTable('user_documents', (t) => {
      t.increments('id').primary();
      t.integer('user_id').notNullable();
      t.string('name').notNullable();
      t.string('url').notNullable();
      t.string('meta');
      t.string('ext');
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('tiers'))) {
    await knex.schema.createTable('tiers', (t) => {
      t.increments('id').primary();
      t.string('key').notNullable();
      t.string('role').notNullable();      // investor | sponsor
      t.string('label').notNullable();
      t.string('color').defaultTo('#6C3CE0');
      t.string('bg').defaultTo('#EFE9FC');
      t.bigInteger('amount').defaultTo(0);
      t.integer('count').defaultTo(0);
      t.text('benefits');                  // JSON array
      t.integer('sort').defaultTo(0);
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('editions'))) {
    await knex.schema.createTable('editions', (t) => {
      t.increments('id').primary();
      t.string('year').notNullable();                        // identificador / slug de URL
      t.string('status').notNullable().defaultTo('past');    // past | upcoming | pause
      t.integer('sort').defaultTo(0);
      t.text('data_es');                                     // objeto completo de la edición (ES)
      t.text('data_en');                                     // objeto completo de la edición (EN)
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('access_codes'))) {
    await knex.schema.createTable('access_codes', (t) => {
      t.increments('id').primary();
      t.string('code').notNullable().unique();
      t.string('status').notNullable().defaultTo('unused'); // unused | used
      t.string('note');                                     // p.ej. 'test'
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('leads'))) {
    await knex.schema.createTable('leads', (t) => {
      t.increments('id').primary();
      t.string('name');
      t.string('email').notNullable().unique();
      t.string('status').defaultTo('nuevo');                // nuevo | contactado | cliente | descartado
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('access_log'))) {
    await knex.schema.createTable('access_log', (t) => {
      t.increments('id').primary();
      t.string('code');
      t.integer('lead_id');
      t.string('device_id');
      t.string('name');
      t.string('email');
      t.string('ip');
      t.text('user_agent');
      t.boolean('new_device').defaultTo(false);
      t.timestamps(true, true);
    });
  }

  if (!(await knex.schema.hasTable('app_settings'))) {
    await knex.schema.createTable('app_settings', (t) => {
      t.string('key').primary();
      t.text('value');
    });
  }

  // Columna para rastrear la última notificación vista por usuario (idempotente)
  if (await knex.schema.hasTable('users') && !(await knex.schema.hasColumn('users', 'notifications_seen_id'))) {
    await knex.schema.alterTable('users', (t) => {
      t.integer('notifications_seen_id').defaultTo(0);
    });
  }

  // Tipo de inversión por usuario: 'fijo' (retorno contractual) | 'riesgo' (participación 50/50)
  if (await knex.schema.hasTable('users') && !(await knex.schema.hasColumn('users', 'investment_type'))) {
    await knex.schema.alterTable('users', (t) => {
      t.string('investment_type').defaultTo('fijo');
    });
  }

  // Overrides por cuenta (si están vacíos, el panel hereda el valor global/categoría)
  const userOverrideCols = [
    ['advisor', (t) => t.text('advisor')],              // JSON {name, role, phone, whatsapp}
    ['benefits', (t) => t.text('benefits')],            // JSON array de beneficios
    ['return_rate', (t) => t.float('return_rate')],     // % de rendimiento a mostrar
    ['activations', (t) => t.string('activations')]     // texto de "Activaciones" (patrocinador)
  ];
  for (const [col, builder] of userOverrideCols) {
    if (await knex.schema.hasTable('users') && !(await knex.schema.hasColumn('users', col))) {
      await knex.schema.alterTable('users', builder);
    }
  }

  // Documentos: categoría (Legal / Financiero / Evidencia / General) y fecha del documento
  if (await knex.schema.hasTable('user_documents') && !(await knex.schema.hasColumn('user_documents', 'category'))) {
    await knex.schema.alterTable('user_documents', (t) => t.string('category').defaultTo('General'));
  }
  if (await knex.schema.hasTable('user_documents') && !(await knex.schema.hasColumn('user_documents', 'doc_date'))) {
    await knex.schema.alterTable('user_documents', (t) => t.string('doc_date'));
  }

  // Hitos: responsable y estado explícito (pendiente | en_curso | completado)
  if (await knex.schema.hasTable('milestones') && !(await knex.schema.hasColumn('milestones', 'owner'))) {
    await knex.schema.alterTable('milestones', (t) => t.string('owner'));
  }
  if (await knex.schema.hasTable('milestones') && !(await knex.schema.hasColumn('milestones', 'status'))) {
    await knex.schema.alterTable('milestones', (t) => t.string('status').defaultTo('pendiente'));
    // Migra los existentes: los marcados "done" pasan a "completado"
    await knex('milestones').where({ done: true }).update({ status: 'completado' });
  }

  // Uso del capital: rubros con presupuestado vs ejercido (bloque "Uso del capital")
  if (!(await knex.schema.hasTable('capital_items'))) {
    await knex.schema.createTable('capital_items', (t) => {
      t.increments('id').primary();
      t.string('label').notNullable();       // rubro
      t.bigInteger('budget').defaultTo(0);    // presupuestado
      t.bigInteger('spent').defaultTo(0);     // ejercido
      t.string('note');                       // detalle
      t.string('source');                     // fuente/responsable del dato
      t.integer('sort').defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // Noticias: contenido completo para la vista de lectura
  if (await knex.schema.hasTable('news') && !(await knex.schema.hasColumn('news', 'body'))) {
    await knex.schema.alterTable('news', (t) => t.text('body'));
  }

  // Riesgos: matriz simple (bloque "Cronograma, riesgos y distribución")
  if (!(await knex.schema.hasTable('risks'))) {
    await knex.schema.createTable('risks', (t) => {
      t.increments('id').primary();
      t.string('title').notNullable();
      t.string('level').defaultTo('medio');   // alto | medio | bajo
      t.text('mitigation');                    // plan de mitigación
      t.string('status').defaultTo('monitoreo'); // abierto | monitoreo | mitigado
      t.integer('sort').defaultTo(0);
      t.timestamps(true, true);
    });
  }
}

async function seed() {
  // Categorías (tiers) desde panel_config.json
  if (!(await knex('tiers').first())) {
    const path = require('path');
    const fs = require('fs');
    const config = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contents', 'panel_config.json'), 'utf8'));
    const rows = [];
    (config.investorTiers || []).forEach((t, i) => rows.push({
      key: t.key, role: 'investor', label: t.label, color: t.color, bg: t.bg,
      amount: t.amount, count: t.count, benefits: JSON.stringify(t.benefits || []), sort: i + 1
    }));
    (config.sponsorTiers || []).forEach((t, i) => rows.push({
      key: t.key, role: 'sponsor', label: t.label, color: t.color, bg: t.bg,
      amount: t.amount, count: t.count, benefits: JSON.stringify(t.benefits || []), sort: i + 1
    }));
    if (rows.length) { await knex('tiers').insert(rows); console.log('  ✓ Categorías sembradas'); }
  }

  // Dueño / admin
  const adminEmail = (process.env.ADMIN_EMAIL || 'admin@soccerid.co').toLowerCase();
  const existingAdmin = await knex('users').where({ email: adminEmail }).first();
  if (!existingAdmin) {
    const pass = process.env.ADMIN_PASSWORD || 'socceridcup2027';
    await knex('users').insert({
      name: process.env.ADMIN_NAME || 'SOCCER iD',
      email: adminEmail,
      role: 'admin',
      status: 'active',
      password_hash: bcrypt.hashSync(pass, 10),
      member_id: 'ADMIN'
    });
    if (!process.env.ADMIN_PASSWORD) {
      console.log(`  ⚠ Admin creado: ${adminEmail} / ${pass} (define ADMIN_PASSWORD en producción)`);
    } else {
      console.log(`  ✓ Admin creado: ${adminEmail}`);
    }
  }

  // Inversionista demo (para pruebas de login) — solo si no existe ningún inversionista
  const anyInvestor = await knex('users').where({ role: 'investor' }).first();
  if (!anyInvestor && process.env.SEED_DEMO !== 'false') {
    await knex('users').insert({
      name: 'Carlos Mendoza',
      email: 'carlos.mendoza@example.com',
      role: 'investor',
      category: 'diamante',
      amount: 1000000,
      member_id: 'SIDC-D01',
      status: 'active',
      password_hash: bcrypt.hashSync('demo1234', 10)
    });
    console.log('  ✓ Inversionista demo: carlos.mendoza@example.com / demo1234');
  }

  // Noticias iniciales
  if (!(await knex('news').first())) {
    await knex('news').insert([
      { tag: 'Anuncio', tag_color: '#6C3CE0', title: 'Confirmado: Tigres vs Cruz Azul en Houston', excerpt: 'El clásico regio-cementero se jugará en el Shell Energy Stadium el 27 de marzo de 2027. Un duelo entre dos de los clubes más grandes de México en el principal mercado hispano de Estados Unidos.', image: '/assets/images/gallery/cup2025/6.jpg', date_label: '12 Jul 2026', size: 'tall', featured: true, sort: 1 },
      { tag: 'Anuncio', tag_color: '#6C3CE0', title: 'Shell Energy Stadium confirmado como sede oficial', excerpt: 'Estadio MLS listo para futbol con capacidad de 22,800 asistentes.', image: '/assets/images/gallery/cup2024/1.jpg', date_label: '28 Jun 2026', size: 'short', sort: 2 },
      { tag: 'Actualización', tag_color: '#14141B', title: 'Abrimos preventa exclusiva para inversionistas', excerpt: 'Los inversionistas Diamante y Platino tienen acceso prioritario a la asignación de boletos antes de la venta general.', image: '/assets/images/gallery/cup2023/1.jpg', date_label: '15 Ago 2026', size: 'tall', sort: 3 },
      { tag: 'Prensa', tag_color: '#6B7280', title: 'Cobertura confirmada con ESPN y TUDN', excerpt: 'El partido será transmitido a nivel internacional en las principales cadenas deportivas.', image: '/assets/images/gallery/cup2025/6.jpg', date_label: '02 Sep 2026', size: 'short', sort: 4 },
      { tag: 'Actualización', tag_color: '#14141B', title: 'Nuevo patrocinador categoría Black confirmado', excerpt: 'Sumamos una marca líder como patrocinador principal del torneo, reforzando el respaldo comercial del evento.', image: '/assets/images/gallery/cup2024/1.jpg', date_label: '20 Sep 2026', size: 'tall', sort: 5 },
      { tag: 'Anuncio', tag_color: '#6C3CE0', title: 'Presentación de jerseys conmemorativos', excerpt: 'Diseño especial edición SOCCER iD CUP 2027 para ambos equipos.', image: '/assets/images/gallery/cup2023/1.jpg', date_label: '05 Oct 2026', size: 'short', sort: 6 }
    ]);
    console.log('  ✓ Noticias iniciales sembradas');
  }

  // Eventos del calendario (Marzo 2027)
  if (!(await knex('events').first())) {
    await knex('events').insert([
      { day: 5, month: 3, year: 2027, title: 'Cierre de patrocinios', type: 'Patrocinio', color: '#14141B' },
      { day: 12, month: 3, year: 2027, title: 'Update inversionistas', type: 'Actualización', color: '#A78BE6' },
      { day: 15, month: 3, year: 2027, title: 'Rueda de prensa', type: 'Prensa', color: '#8A8F98' },
      { day: 20, month: 3, year: 2027, title: 'Media Day', type: 'Evento', color: '#6C3CE0' },
      { day: 23, month: 3, year: 2027, title: 'Llegada de equipos', type: 'Evento', color: '#6C3CE0' },
      { day: 27, month: 3, year: 2027, title: 'PARTIDO', type: 'Partido', color: '#6C3CE0', is_match: true }
    ]);
    console.log('  ✓ Eventos iniciales sembrados');
  }

  // Cronograma / hitos
  if (!(await knex('milestones').first())) {
    await knex('milestones').insert([
      { title: 'Cierre de contratos', date_label: 'Sep 2026', done: true, sort: 1 },
      { title: 'Lanzamiento comercial', date_label: 'Dic 2026', done: true, sort: 2 },
      { title: 'Media Day', date_label: 'Feb 2027', done: false, sort: 3 },
      { title: 'Partido internacional', date_label: '27 Mar 2027', done: false, highlight: true, sort: 4 },
      { title: 'Retorno a inversionistas', date_label: 'Ago 2027', done: false, sort: 5 }
    ]);
    console.log('  ✓ Cronograma inicial sembrado');
  }

  // Ediciones de la SOCCER iD CUP (desde cup_editions.json + timeline de gallery_pages.json)
  if (!(await knex('editions').first())) {
    const path = require('path');
    const fs = require('fs');
    const readJson = (f) => { try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contents', f), 'utf8')); } catch (_) { return null; } };
    const ed = readJson('cup_editions.json') || {};
    const gal = readJson('gallery_pages.json') || {};
    const es = ed.es || {};
    const en = ed.en || {};
    const rows = [];
    // Ediciones pasadas (con página de detalle)
    Object.keys(es).forEach((year) => {
      rows.push({
        year, status: 'past', sort: parseInt(year, 10) || 0,
        data_es: JSON.stringify(es[year]),
        data_en: JSON.stringify(en[year] || es[year])
      });
    });
    // Entradas del timeline sin detalle (pausa/próxima) desde gallery_pages.json
    const findG = (lang) => ((gal[lang] || []).find(g => g.id === 'soccer-id-cup-2027')) || {};
    const hiEs = (findG('es').highlights) || [];
    const hiEn = (findG('en').highlights) || [];
    hiEs.forEach((h, i) => {
      if (rows.find(r => r.year === h.year)) return;
      const he = hiEn[i] || h;
      const s = (h.city + ' ' + h.match).toLowerCase();
      const status = /fifa|world cup|pausa|mundial/.test(s) ? 'pause' : 'upcoming';
      rows.push({
        year: h.year, status, sort: parseInt(h.year, 10) || 0,
        data_es: JSON.stringify({ year: h.year, match: h.match, city: h.city }),
        data_en: JSON.stringify({ year: he.year, match: he.match, city: he.city })
      });
    });
    if (rows.length) { await knex('editions').insert(rows); console.log('  ✓ Ediciones sembradas'); }
  }

  // Códigos de acceso a la propuesta 2027 (+ configuración de notificaciones)
  if (!(await knex('access_codes').first())) {
    const path = require('path');
    const fs = require('fs');
    let existing = [];
    try { existing = (JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contents', 'cup_project_2027_codes.json'), 'utf8')).codes) || []; } catch (_) {}
    const rows = existing.map(c => ({ code: String(c), status: 'used', note: null }));
    const taken = new Set(rows.map(r => r.code));
    let n = 0;
    while (n < 20) {
      const c = String(Math.floor(1000000 + Math.random() * 9000000));
      if (taken.has(c)) continue;
      taken.add(c); rows.push({ code: c, status: 'unused', note: null }); n++;
    }
    if (!taken.has('2027000')) rows.push({ code: '2027000', status: 'unused', note: 'test' });
    await knex('access_codes').insert(rows);
    console.log(`  ✓ Códigos de acceso sembrados (${existing.length} usados, 20 por usar, prueba: 2027000)`);
  }
  if (!(await knex('app_settings').where({ key: 'notify_emails' }).first())) {
    await knex('app_settings').insert({ key: 'notify_emails', value: process.env.NOTIFY_EMAILS || 'jardarubydv@gmail.com, leon@soccerid.co, 7leonr@gmail.com' });
  }

  // Notificación de bienvenida
  if (!(await knex('notifications').first())) {
    await knex('notifications').insert({
      title: '¡Bienvenido al portal de inversionistas!',
      body: 'Aquí recibirás las novedades, fechas clave y comunicados de SOCCER iD CUP 2027.',
      audience: 'all'
    });
    console.log('  ✓ Notificación de bienvenida sembrada');
  }

  // Uso del capital (rubros iniciales)
  if (await knex.schema.hasTable('capital_items') && !(await knex('capital_items').first())) {
    await knex('capital_items').insert([
      { label: 'Renta y operación de estadio', budget: 350000, spent: 120000, note: 'Shell Energy Stadium', source: 'Contrato de sede', sort: 1 },
      { label: 'Participación de equipos', budget: 300000, spent: 150000, note: 'Garantías Tigres y Cruz Azul', source: 'Contratos deportivos', sort: 2 },
      { label: 'Producción y transmisión', budget: 180000, spent: 40000, note: 'ESPN / TUDN', source: 'Proveedores audiovisuales', sort: 3 },
      { label: 'Marketing y comercialización', budget: 120000, spent: 55000, note: 'Preventa y patrocinios', source: 'Área comercial', sort: 4 },
      { label: 'Operación y contingencias', budget: 50000, spent: 12000, note: 'Logística y reserva', source: 'Dirección de operaciones', sort: 5 }
    ]);
    console.log('  ✓ Uso del capital sembrado');
  }

  // Riesgos (matriz inicial)
  if (await knex.schema.hasTable('risks') && !(await knex('risks').first())) {
    await knex('risks').insert([
      { title: 'Venta de boletos por debajo del punto de equilibrio', level: 'alto', mitigation: 'Preventa a inversionistas, campañas segmentadas y alianzas con boleteras.', status: 'monitoreo', sort: 1 },
      { title: 'Retraso en cierre de patrocinios', level: 'medio', mitigation: 'Pipeline comercial diversificado y metas por trimestre.', status: 'monitoreo', sort: 2 },
      { title: 'Clima el día del partido', level: 'bajo', mitigation: 'Estadio con opciones de cobertura; seguro de evento.', status: 'abierto', sort: 3 },
      { title: 'Disponibilidad de los equipos', level: 'medio', mitigation: 'Contratos firmados con cláusulas y fechas confirmadas.', status: 'mitigado', sort: 4 }
    ]);
    console.log('  ✓ Riesgos sembrados');
  }
}

async function init() {
  await ensureSchema();
  await seed();
  // Sistema de inversionistas multi-evento (aditivo)
  const { ensurePortfolioSchema } = require('./portfolioSchema');
  const { seedPortfolio } = require('./portfolioSeed');
  await ensurePortfolioSchema();
  await seedPortfolio();
  console.log('✓ Base de datos del panel lista');
}

module.exports = { init, ensureSchema, seed };
