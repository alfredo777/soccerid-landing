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
}

async function seed() {
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
}

async function init() {
  await ensureSchema();
  await seed();
  console.log('✓ Base de datos del panel lista');
}

module.exports = { init, ensureSchema, seed };
