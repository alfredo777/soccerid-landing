// Test de punta a punta de los modelos de datos, contra la BD real.
// Todo va marcado __TEST__ y se borra al final; se verifica que los conteos
// vuelvan al valor base. No toca datos existentes.
const knex = require('../db/knex');

let pass = 0, fail = 0;
const ok = (cond, msg) => { (cond ? pass++ : fail++); console.log('  ' + (cond ? 'OK   ' : 'FALLA ') + msg); };

(async () => {
  const TABLAS = ['users', 'portfolio_events', 'event_packages', 'investments', 'event_updates',
    'event_documents', 'event_media', 'event_communications', 'milestones', 'events', 'match_agenda',
    'notifications', 'access_codes', 'access_log', 'leads', 'faqs', 'news', 'ai_log', 'app_settings'];
  const base = {};
  for (const t of TABLAS) { try { base[t] = Number((await knex(t).count({ n: '*' }).first()).n); } catch (_) { base[t] = null; } }
  console.log('== baseline tomado ==');

  const idDe = (r) => (typeof r[0] === 'object' ? r[0].id : r[0]);

  // 1. Edicion (portfolio_events) + contenido publico en la misma fila
  console.log('\n== 1. Edicion unificada ==');
  const edId = idDe(await knex('portfolio_events').insert({
    year: 2099, title: '__TEST__ Edicion', match: 'A vs B', venue: 'Sede X', city: 'Ciudad',
    event_date: '2099-05-01', status: 'upcoming', phase: 'planeacion', budget: 1000000,
    data_es: JSON.stringify({ title: 'Publico ES', stats: [{ value: '1', label: 'X' }] }),
    data_en: JSON.stringify({ title: 'Public EN' }), sort: 2099
  }).returning('id'));
  const ed = await knex('portfolio_events').where({ id: edId }).first();
  ok(ed && JSON.parse(ed.data_es).title === 'Publico ES', 'edicion con identidad + contenido publico en una fila');

  // 2. Paquete e inversion + computeReturn
  console.log('\n== 2. Paquete, inversion y calculo de retorno ==');
  await knex('event_packages').insert({ event_id: edId, name: '__TEST__ Paquete', modality: 'fijo', amount: 50000, return_pct: 20, is_active: true });
  const inv = await knex('users').where({ role: 'investor' }).first();
  const invId = idDe(await knex('investments').insert({ user_id: inv.id, event_id: edId, modality: 'fijo', capital: 200000, return_pct: 25, invest_date: '2099-01-01', delivery_date: '2099-12-01', state: 'activa' }).returning('id'));
  const settings = require('../lib/panelSettings');
  const cfg = await settings.getDashboardConfig();
  const ret = settings.computeReturn({ amount: 200000, investment_type: 'fijo', return_rate: 25 }, cfg);
  ok(ret.profit === 'USD $50,000', 'computeReturn fijo 25% de 200k = 50k (dio ' + ret.profit + ')');

  // 3. Hijos de la edicion + visibilidad por modalidad
  console.log('\n== 3. Hijos de la edicion ==');
  await knex('event_updates').insert({ event_id: edId, title: '__TEST__ Avance', phase: 'planeacion', update_date: '2099-02-01' });
  await knex('event_documents').insert({ event_id: edId, name: '__TEST__ Doc riesgo', folder: 'Finanzas', status: 'aprobado', visibility: 'riesgo' });
  await knex('event_media').insert({ event_id: edId, title: '__TEST__ Nota', source: 'X', media_date: '2099-02-01' });
  await knex('event_communications').insert({ event_id: edId, title: '__TEST__ Comm', audience: 'fijo', status: 'activo' });
  await knex('match_agenda').insert({ event_id: edId, title: '__TEST__ Kickoff', time_label: '19:00', sort: 1 });
  const verFijo = await knex('event_documents').where({ event_id: edId }).andWhere(function () { this.where('visibility', 'all').orWhere('visibility', 'fijo'); });
  ok(verFijo.length === 0, 'doc de visibilidad riesgo NO lo ve un fijo');
  const verRiesgo = await knex('event_documents').where({ event_id: edId }).andWhere(function () { this.where('visibility', 'all').orWhere('visibility', 'riesgo'); });
  ok(verRiesgo.length === 1, 'doc de visibilidad riesgo SI lo ve un riesgo');

  // 4. Notificaciones: directa 1-a-1 y preferencia por tipo
  console.log('\n== 4. Notificaciones ==');
  const { wantsType } = require('../lib/panelNotify');
  ok(wantsType({ notify_off: 'post,codigo' }, 'documento') === true, 'acepta un tipo no apagado');
  ok(wantsType({ notify_off: 'post,codigo' }, 'post') === false, 'rechaza un tipo apagado');
  ok(wantsType({ notify_off: 'post' }, 'directa') === true, 'las directas no se pueden apagar');
  await knex('notifications').insert({ title: '__TEST__ Directa', audience: 'all', type: 'directa', user_id: inv.id, channels: 'in-app' });
  const dir = await knex('notifications').where({ title: '__TEST__ Directa' }).andWhere(function () { this.where('user_id', inv.id).orWhereNull('user_id'); });
  ok(dir.length === 1, 'directa consultable por su destinatario');

  // 5. Codigos 2027: dueno y matchOwner
  console.log('\n== 5. Codigos + mapa de relaciones ==');
  const codeMap = require('../lib/codeMap');
  await knex('access_codes').insert({ code: '9999001', status: 'unused', assignee_name: '__TEST__ Dueno', assignee_email: 'test@x.co', assignee_phone: '+525599887766' });
  const c = await knex('access_codes').where({ code: '9999001' }).first();
  ok(codeMap.matchOwner(c, { email: 'TEST@X.co' }) === true, 'matchOwner por correo (case-insensitive)');
  ok(codeMap.matchOwner(c, { phone: '5599887766' }) === true, 'matchOwner por telefono (ultimos 10 digitos)');
  ok(codeMap.matchOwner(c, { email: 'otro@y.co' }) === false, 'matchOwner distinta persona');
  ok(codeMap.matchOwner({}, { email: 'a@b.co' }) === null, 'matchOwner sin dueno = null');

  // 6. FAQ ES/EN, noticia, lead, ai_log
  console.log('\n== 6. Otros modelos ==');
  await knex('faqs').insert({ audience: 'all', question: '__TEST__ Q', answer: 'R', question_en: 'Q EN', answer_en: 'A EN', is_active: true, sort: 999 });
  await knex('news').insert({ title: '__TEST__ Noticia', tag: 'Anuncio', excerpt: 'x', source_url: 'https://ok.co/n' });
  await knex('leads').insert({ name: '__TEST__ Lead', email: 'testlead@x.co', status: 'nuevo' });
  await knex('ai_log').insert({ user_id: inv.id, tarea: 'faq', instruccion: '__TEST__', tokens_in: 10, tokens_out: 5, aplicado: false });
  const f = await knex('faqs').where({ question: '__TEST__ Q' }).first();
  ok(f && f.question_en === 'Q EN', 'FAQ guarda version ingles');

  // 7. UPDATE en cadena
  console.log('\n== 7. Update ==');
  await knex('investments').where({ id: invId }).update({ capital: 300000 });
  const inv2 = await knex('investments').where({ id: invId }).first();
  ok(Number(inv2.capital) === 300000, 'update de capital persiste');

  // 8. Borrado y verificacion de baseline
  console.log('\n== 8. Limpieza y baseline ==');
  await knex('investments').where({ event_id: edId }).del();
  await knex('event_packages').where({ event_id: edId }).del();
  await knex('event_updates').where({ event_id: edId }).del();
  await knex('event_documents').where({ event_id: edId }).del();
  await knex('event_media').where({ event_id: edId }).del();
  await knex('event_communications').where({ event_id: edId }).del();
  await knex('match_agenda').where({ event_id: edId }).del();
  await knex('portfolio_events').where({ id: edId }).del();
  await knex('notifications').where('title', 'like', '__TEST__%').del();
  await knex('access_codes').where('code', '9999001').del();
  await knex('faqs').where('question', 'like', '__TEST__%').del();
  await knex('news').where('title', 'like', '__TEST__%').del();
  await knex('leads').where('email', 'testlead@x.co').del();
  await knex('ai_log').where('instruccion', '__TEST__').del();

  let restaurado = true;
  for (const t of TABLAS) {
    let n; try { n = Number((await knex(t).count({ n: '*' }).first()).n); } catch (_) { n = null; }
    if (String(n) !== String(base[t])) { restaurado = false; console.log('  RESIDUO en ' + t + ': ' + base[t] + ' -> ' + n); }
  }
  ok(restaurado, 'todas las tablas volvieron a su conteo base (sin residuos)');

  console.log('\n== RESULTADO: ' + pass + ' OK / ' + fail + ' fallas ==');
  process.exit(fail ? 1 : 0);
})().catch(e => { console.log('ERROR FATAL:', e.message); process.exit(1); });
