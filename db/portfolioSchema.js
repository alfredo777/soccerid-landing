/**
 * Esquema del "Sistema de Inversionistas" multi-evento (portafolio).
 *
 * 100% ADITIVO: crea tablas nuevas sin tocar las existentes ni la landing.
 * Se ejecuta después del esquema base. Idempotente.
 *
 * NO cambia la lógica de retorno (lib/panelSettings.js → computeReturn): las
 * inversiones guardan capital/retorno/fechas; los cálculos ilustrativos
 * (simulador) usan los parámetros por evento definidos aquí.
 */
const knex = require('./knex');

async function ensurePortfolioSchema() {
  // ── Eventos del portafolio (distintos del calendario `events`) ──
  if (!(await knex.schema.hasTable('portfolio_events'))) {
    await knex.schema.createTable('portfolio_events', (t) => {
      t.increments('id').primary();
      t.string('code');                    // HOU / AUS / ORL
      t.string('title').notNullable();     // "Houston 2027"
      t.string('subtitle');                // "Caso demostrativo"
      t.text('description');
      t.string('venue');                   // "Shell Energy Stadium"
      t.string('venue_note');              // "· propuesta demo"
      t.string('city');
      t.string('country');
      t.string('event_date');              // "2027-03-27"
      t.string('date_phase');              // etiqueta de la fecha: "Planeación" | "Concluido"
      t.bigInteger('budget').defaultTo(0);            // presupuesto / objetivo
      t.bigInteger('projected_income').defaultTo(0);  // ingreso proyectado (Finanzas)
      t.string('phase').defaultTo('planeacion');      // planeacion|negociacion|produccion|evento|cierre
      t.integer('progress_pct').defaultTo(0);
      t.boolean('is_demo').defaultTo(false);
      t.string('accent').defaultTo('#6C3CE0');
      // Parámetros del simulador (por evento)
      t.integer('capacity').defaultTo(21800);
      t.integer('ticket_price').defaultTo(100);
      t.integer('deductions_pct').defaultTo(15);
      t.integer('rebate_per').defaultTo(5);
      t.integer('cap_pct').defaultTo(50);           // tope % sobre el capital
      t.integer('investor_split').defaultTo(50);    // 50/50
      t.integer('sort').defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // ── Inversiones (inversionista × evento) ──
  if (!(await knex.schema.hasTable('investments'))) {
    await knex.schema.createTable('investments', (t) => {
      t.increments('id').primary();
      t.integer('user_id').notNullable();
      t.integer('event_id').notNullable();
      t.string('modality').defaultTo('fijo');   // fijo | riesgo
      t.bigInteger('capital').defaultTo(0);
      t.float('return_pct').defaultTo(0);        // % pactado/estimado (rol del antiguo users.return_rate)
      t.string('invest_date');
      t.string('delivery_date');
      t.string('state').defaultTo('activa');     // activa | cerrada | pausa
      t.text('notes');
      t.integer('sort').defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // ── Cronología / avances por evento ──
  if (!(await knex.schema.hasTable('event_updates'))) {
    await knex.schema.createTable('event_updates', (t) => {
      t.increments('id').primary();
      t.integer('event_id').notNullable();
      t.string('update_date');
      t.string('phase');                         // fase asociada al avance
      t.string('title').notNullable();
      t.text('description');
      t.boolean('is_demo').defaultTo(false);
      t.integer('sort').defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // ── Data room por evento (carpetas + estatus + visibilidad) ──
  if (!(await knex.schema.hasTable('event_documents'))) {
    await knex.schema.createTable('event_documents', (t) => {
      t.increments('id').primary();
      t.integer('event_id').notNullable();
      t.string('folder').defaultTo('General');   // Clubes|Estadio|Proveedores|Contratos de inversión|Finanzas|General|Evidencias
      t.string('name').notNullable();
      t.string('url');
      t.string('status').defaultTo('revision');  // revision | aprobado | firmado
      t.string('visibility').defaultTo('all');   // all | fijo | riesgo
      t.boolean('is_demo').defaultTo(false);
      t.integer('sort').defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // ── En medios (cobertura externa de terceros) ──
  if (!(await knex.schema.hasTable('event_media'))) {
    await knex.schema.createTable('event_media', (t) => {
      t.increments('id').primary();
      t.integer('event_id').notNullable();
      t.string('title').notNullable();
      t.string('source');
      t.string('url');
      t.string('media_date');
      t.boolean('is_demo').defaultTo(false);
      t.integer('sort').defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // ── Comunicaciones por evento (segmentadas por modalidad) ──
  if (!(await knex.schema.hasTable('event_communications'))) {
    await knex.schema.createTable('event_communications', (t) => {
      t.increments('id').primary();
      t.integer('event_id').notNullable();
      t.string('title').notNullable();
      t.text('body');
      t.string('audience').defaultTo('all');     // all | fijo | riesgo
      t.string('status').defaultTo('activo');    // activo | concluido
      t.string('comm_date');
      t.boolean('is_demo').defaultTo(false);
      t.integer('sort').defaultTo(0);
      t.timestamps(true, true);
    });
  }

  // ── Roles: superadmin + admin por evento ──
  if (await knex.schema.hasTable('users') && !(await knex.schema.hasColumn('users', 'is_superadmin'))) {
    await knex.schema.alterTable('users', (t) => t.boolean('is_superadmin').defaultTo(false));
    // El admin existente pasa a superadmin
    await knex('users').where({ role: 'admin' }).update({ is_superadmin: true });
  }
  // Onboarding: marca cuándo el inversionista completó el video de bienvenida
  if (await knex.schema.hasTable('users') && !(await knex.schema.hasColumn('users', 'onboarded_at'))) {
    await knex.schema.alterTable('users', (t) => t.bigInteger('onboarded_at'));
  }
  if (!(await knex.schema.hasTable('event_admins'))) {
    await knex.schema.createTable('event_admins', (t) => {
      t.increments('id').primary();
      t.integer('user_id').notNullable();
      t.integer('event_id').notNullable();
      t.timestamps(true, true);
    });
  }
}

module.exports = { ensurePortfolioSchema };
