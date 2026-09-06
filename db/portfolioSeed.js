/**
 * Datos demo del portafolio (marcados is_demo). Idempotente: solo siembra si vacío.
 * Refleja los mockups: Houston 2027 (activo, negociación 46%), Tigres vs Pumas
 * Austin 2025 (concluido) y América vs Atlético Orlando 2024 (concluido).
 */
const knex = require('./knex');
const auth = require('../lib/panelAuth');

// Crea (si faltan) los dos perfiles de inversionista demo: fijo y riesgo.
// Password por env DEMO_PASSWORD (default demo1234). Idempotente.
async function ensureDemoInvestors() {
  const pass = process.env.DEMO_PASSWORD || 'demo1234';
  const demos = [
    { name: 'Demo Inversionista · Fijo',  email: 'demo.fijo@soccerid.co',   category: 'plata', amount: 100000, investment_type: 'fijo',   member_id: 'SIDC-DEMO-F' },
    { name: 'Demo Inversionista · Riesgo', email: 'demo.riesgo@soccerid.co', category: 'oro',   amount: 250000, investment_type: 'riesgo', member_id: 'SIDC-DEMO-R' }
  ];
  for (const d of demos) {
    const ex = await knex('users').where({ email: d.email }).first();
    if (!ex) {
      await knex('users').insert(Object.assign({}, d, { role: 'investor', status: 'active', password_hash: auth.hashPassword(pass) }));
      console.log('  ✓ Perfil demo creado:', d.email);
    }
  }
}

async function seedPortfolio() {
  await ensureDemoInvestors();
  if (await knex('portfolio_events').first()) return; // ya sembrado

  const [houId] = await knex('portfolio_events').insert({
    code: 'HOU', title: 'Houston 2027', subtitle: 'Caso demostrativo',
    description: 'Caso demostrativo integral de un amistoso internacional en ventana FIFA. Fecha y país definidos; clubes y sede continúan sujetos a negociación y contratación.',
    venue: 'Shell Energy Stadium', venue_note: '· propuesta demo', city: 'Houston', country: 'Estados Unidos',
    event_date: '2027-03-27', date_phase: 'Planeación',
    budget: 1000000, projected_income: 1500000,
    phase: 'negociacion', progress_pct: 46, is_demo: true, accent: '#F59E0B',
    capacity: 21800, ticket_price: 100, deductions_pct: 15, rebate_per: 5, cap_pct: 50, investor_split: 50,
    sort: 1
  }).returning('id');
  const HOU = (houId && houId.id) || houId;

  await knex('portfolio_events').insert([
    {
      code: 'AUS', title: 'Tigres vs Pumas · Austin 2025', subtitle: 'Caso demostrativo',
      description: 'Evento histórico integrado como referencia del portafolio.',
      venue: 'Q2 Stadium', city: 'Austin', country: 'Estados Unidos',
      event_date: '2025-03-22', date_phase: 'Concluido',
      budget: 875000, projected_income: 1468000, phase: 'cierre', progress_pct: 100, is_demo: true, accent: '#6C3CE0', sort: 2
    },
    {
      code: 'ORL', title: 'América vs Atlético Nacional · Orlando 2024', subtitle: 'Caso demostrativo',
      description: 'Evento histórico integrado como referencia del portafolio.',
      venue: 'Camping World Stadium', city: 'Orlando', country: 'Estados Unidos',
      event_date: '2024-09-07', date_phase: 'Concluido',
      budget: 0, projected_income: 0, phase: 'cierre', progress_pct: 100, is_demo: true, accent: '#6C3CE0', sort: 3
    }
  ]);

  // Inversiones demo (enlazan por email a los perfiles demo si existen)
  const fijo = await knex('users').where({ email: 'demo.fijo@soccerid.co' }).first();
  const riesgo = await knex('users').where({ email: 'demo.riesgo@soccerid.co' }).first();
  const invs = [];
  if (riesgo) invs.push({ user_id: riesgo.id, event_id: HOU, modality: 'riesgo', capital: 250000, return_pct: 50, invest_date: '2026-08-28', delivery_date: '2027-08-31', state: 'activa', notes: 'DEMO: participación variable 50–50 sobre utilidad neta; retorno ilustrativo con tope de 50% sobre el capital.', sort: 1 });
  if (fijo) invs.push({ user_id: fijo.id, event_id: HOU, modality: 'fijo', capital: 100000, return_pct: 25, invest_date: '2026-08-20', delivery_date: '2027-08-31', state: 'activa', notes: 'DEMO: retorno fijo conforme al contrato individual.', sort: 2 });
  if (invs.length) await knex('investments').insert(invs);

  // Cronología (Houston) — 9 avances
  await knex('event_updates').insert([
    { event_id: HOU, update_date: '2027-04-30', phase: 'Cierre', title: 'Cierre financiero', description: 'Conciliación de ingresos, costos, retornos y reporte final para inversionistas.', is_demo: true, sort: 1 },
    { event_id: HOU, update_date: '2027-03-27', phase: 'Evento', title: 'Día del evento', description: 'Operación deportiva, producción, hospitalidad y atención a invitados.', is_demo: true, sort: 2 },
    { event_id: HOU, update_date: '2027-01-15', phase: 'Producción', title: 'Lanzamiento de venta', description: 'Activación de ticketing, comunicación y primera fase comercial.', is_demo: true, sort: 3 },
    { event_id: HOU, update_date: '2026-10-30', phase: 'Negociación', title: 'Firma de acuerdos definitivos', description: 'Formalización de sede, clubes y calendario de pagos.', is_demo: true, sort: 4 },
    { event_id: HOU, update_date: '2026-09-20', phase: 'Negociación', title: 'Cartas de intención con clubes', description: 'Términos comerciales preliminares con ambos clubes.', is_demo: true, sort: 5 },
    { event_id: HOU, update_date: '2026-09-05', phase: 'Negociación', title: 'Avance de sede y siguiente hito', description: 'Propuesta económica de estadio en revisión.', is_demo: true, sort: 6 },
    { event_id: HOU, update_date: '2026-08-30', phase: 'Planeación', title: 'Visita técnica al estadio', description: 'Revisión operativa y de mercado en Houston.', is_demo: true, sort: 7 },
    { event_id: HOU, update_date: '2026-08-25', phase: 'Planeación', title: 'Validación del mercado', description: 'Análisis de demanda y precios de referencia.', is_demo: true, sort: 8 },
    { event_id: HOU, update_date: '2026-08-20', phase: 'Planeación', title: 'Arranque del caso', description: 'Definición de objetivo, presupuesto y estructura de inversión.', is_demo: true, sort: 9 }
  ]);

  // Data room (Houston) — 16 documentos con carpeta, estatus y visibilidad
  const D = (folder, name, status, visibility, sort) => ({ event_id: HOU, folder, name, status, visibility, is_demo: true, sort });
  await knex('event_documents').insert([
    D('Clubes', 'Carta de intención · Club A', 'revision', 'all', 1),
    D('Clubes', 'Términos comerciales · Club B', 'revision', 'riesgo', 2),
    D('Estadio', 'Propuesta económica de estadio', 'revision', 'all', 3),
    D('Estadio', 'Matriz de costos operativos', 'aprobado', 'all', 4),
    D('Evidencias', 'Reunión comercial con clubes', 'aprobado', 'all', 5),
    D('Evidencias', 'Validación del mercado de Houston', 'aprobado', 'riesgo', 6),
    D('Evidencias', 'Visita técnica y revisión operativa', 'aprobado', 'all', 7),
    D('Finanzas', 'Presupuesto maestro · Versión 3', 'aprobado', 'riesgo', 8),
    D('Finanzas', 'Calendario de aplicación de capital', 'aprobado', 'riesgo', 9),
    D('Finanzas', 'Resumen de obligaciones de pago', 'aprobado', 'fijo', 10),
    D('General', 'Resumen ejecutivo del evento', 'aprobado', 'all', 11),
    D('General', 'Calendario maestro de producción', 'aprobado', 'all', 12),
    D('Contratos de inversión', 'Contrato individual · Participación a riesgo', 'firmado', 'riesgo', 13),
    D('Contratos de inversión', 'Contrato individual · Retorno fijo', 'firmado', 'fijo', 14),
    D('Proveedores', 'Cotización de producción local', 'aprobado', 'riesgo', 15),
    D('Proveedores', 'Itinerario y hospedaje de clubes', 'revision', 'all', 16)
  ]);

  // En medios (Houston) — 4
  await knex('event_media').insert([
    { event_id: HOU, title: 'Houston se consolida como plaza para futbol internacional', source: 'Medio deportivo', media_date: '2026-09-04', is_demo: true, sort: 1 },
    { event_id: HOU, title: 'Detrás de cámaras: preparación de un amistoso internacional', source: 'Canal deportivo', media_date: '2026-09-02', is_demo: true, sort: 2 },
    { event_id: HOU, title: 'Galería: visita técnica al estadio propuesto', source: 'Agencia deportiva', media_date: '2026-08-30', is_demo: true, sort: 3 },
    { event_id: HOU, title: 'Entrevista sobre el impacto económico del evento', source: 'Noticias Houston', media_date: '2026-08-25', is_demo: true, sort: 4 }
  ]);

  // Comunicaciones (Houston)
  await knex('event_communications').insert([
    { event_id: HOU, title: 'Avance de sede y siguiente hito', body: 'Propuesta económica de estadio en revisión; próximos pasos definidos.', audience: 'all', status: 'activo', comm_date: '2026-09-05', is_demo: true, sort: 1 },
    { event_id: HOU, title: 'Próximo hito: cartas de intención', body: 'Formalización de términos con ambos clubes.', audience: 'all', status: 'activo', comm_date: '2026-09-05', is_demo: true, sort: 2 },
    { event_id: HOU, title: 'Presupuesto y escenario actualizado', body: 'Actualización de presupuesto e ingreso proyectado del evento.', audience: 'riesgo', status: 'activo', comm_date: '2026-09-04', is_demo: true, sort: 3 },
    { event_id: HOU, title: 'Contrato y calendario de tu inversión', body: 'Documentos de tu contrato y calendario de pagos disponibles.', audience: 'fijo', status: 'concluido', comm_date: '2026-09-04', is_demo: true, sort: 4 }
  ]);

  console.log('  ✓ Portafolio demo sembrado (Houston/Austin/Orlando)');
}

module.exports = { seedPortfolio };
