/**
 * Ediciones del portafolio (multievento = ediciones por año) + paquetes de inversión.
 * Datos reales conocidos (basados en la propuesta pública y ediciones previas).
 * Idempotente: solo siembra si `portfolio_events` está vacío.
 */
const knex = require('./knex');
const auth = require('../lib/panelAuth');

// Crea (si faltan) los dos perfiles de inversionista demo: fijo y riesgo.
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

// Semilla inicial del FAQ (basada en la propuesta 2027 y el panel). Idempotente.
async function ensureFaqs() {
  if (await knex('faqs').first()) return;
  const F = (audience, question, answer, sort) => ({ audience, question, answer, is_active: true, sort });
  await knex('faqs').insert([
    F('investor', '¿Cuál es la inversión mínima?', 'La inversión mínima es de USD $30,000 (aprox. $500,000 MXN).', 1),
    F('investor', '¿Qué modalidades de inversión hay?', 'Retorno fijo (hasta 25% contractual) y Participación a riesgo (socio del evento, reparto 50/50 sobre la utilidad, proporcional a tu capital).', 2),
    F('investor', '¿Cómo se calcula mi retorno a riesgo?', 'Tu participación efectiva = (tu capital / costo del proyecto) × 50%, aplicada a la utilidad del evento. Es ilustrativo y está sujeto al contrato, con tope del 50% sobre tu capital.', 3),
    F('investor', '¿Cuándo recibo mi retorno?', 'La distribución estimada es en agosto de 2027, tras el cierre financiero posterior al evento (27 de marzo de 2027).', 4),
    F('investor', '¿Hay contrato?', 'Sí, se firma un contrato individual. Los fondos se usan exclusivamente para la operación del evento y tienes acceso a la documentación y al seguimiento desde tu panel.', 5),
    F('investor', '¿Cómo doy seguimiento a mi inversión?', 'Desde tu panel: avances, documentos, comunicaciones y el simulador (solo modalidad a riesgo).', 6),
    F('sponsor', '¿Qué incluye un patrocinio?', 'Presencia de marca y activaciones según tu categoría, con exposición en estadio y transmisión.', 1),
    F('sponsor', '¿Qué alcance tiene el evento?', 'Houston es la plaza hispana líder en EE. UU.; con antecedentes de llenos (Tigres 21,792 en Houston 2025; Cruz Azul 25,405 en LA 2024).', 2),
    F('sponsor', '¿Cómo veo mis activaciones y beneficios?', 'En tu panel, en la sección de beneficios de tu categoría.', 3),
    F('all', '¿Qué es la SOCCER iD CUP 2027?', 'Un amistoso internacional en ventana FIFA: Tigres vs Cruz Azul, el 27 de marzo de 2027 en el Shell Energy Stadium de Houston, Texas.', 1)
  ]);
  console.log('  ✓ FAQ inicial sembrado');
}

async function seedPortfolio() {
  await ensureDemoInvestors();
  await ensureFaqs();
  if (await knex('portfolio_events').first()) return; // ya sembrado

  // Ediciones por año (la 2027 es la activa)
  const editions = [
    { code: 'SJ', year: 2023, title: 'San José 2023', subtitle: 'SOCCER iD CUP', match: 'Pumas vs Comunicaciones',
      city: 'San José', country: 'Estados Unidos', event_date: '2023-01-01', date_phase: 'Concluido',
      phase: 'cierre', progress_pct: 100, is_demo: false, accent: '#6C3CE0', sort: 1 },
    { code: 'ORL', year: 2024, title: 'Orlando 2024', subtitle: 'SOCCER iD CUP', match: 'América vs Atlético Nacional',
      city: 'Orlando', country: 'Estados Unidos', venue: 'Camping World Stadium', event_date: '2024-09-07', date_phase: 'Concluido',
      phase: 'cierre', progress_pct: 100, is_demo: false, accent: '#6C3CE0', sort: 2 },
    { code: 'AUS', year: 2025, title: 'Austin 2025', subtitle: 'SOCCER iD CUP', match: 'Pumas vs Tigres',
      city: 'Austin', country: 'Estados Unidos', venue: 'Q2 Stadium', event_date: '2025-01-01', date_phase: 'Concluido',
      phase: 'cierre', progress_pct: 100, is_demo: false, accent: '#6C3CE0', sort: 3 }
  ];
  await knex('portfolio_events').insert(editions);

  const [houId] = await knex('portfolio_events').insert({
    code: 'HOU', year: 2027, title: 'Houston 2027', subtitle: 'SOCCER iD CUP',
    match: 'Tigres vs Cruz Azul',
    description: 'Amistoso internacional en ventana FIFA: Tigres vs Cruz Azul en el Shell Energy Stadium (Houston). Objetivo de capital USD 1.0M.',
    venue: 'Shell Energy Stadium', city: 'Houston', country: 'Estados Unidos',
    event_date: '2027-03-27', date_phase: 'Planeación',
    presentation_es: [
      '## La oportunidad',
      'SOCCER iD CUP 2027 presenta un amistoso internacional en ventana FIFA: Tigres vs Cruz Azul en el Shell Energy Stadium de Houston, Texas, el 27 de marzo de 2027. Houston es la plaza hispana líder en EE. UU., con demanda comprobada.',
      '## La inversión',
      'Objetivo de capital: USD 1,000,000. Inversión mínima: USD 30,000. Dos modalidades: retorno fijo (hasta 25% contractual) o participación a riesgo (socio del evento, reparto 50/50 sobre la utilidad).',
      '## Por qué funciona',
      '- Boleto promedio USD 100 · aforo 21,800 · taquilla potencial USD 2.18M',
      '- Punto de equilibrio ~10,000 boletos (45.9% de ocupación)',
      '- Ingresos: taquilla, TV, publicidad, patrocinios, hospitality y merchandising',
      '## Experiencia',
      'Tres ediciones previas: 2023 Pumas vs Comunicaciones (San José), 2024 América vs Atlético Nacional (Orlando) y 2025 Pumas vs Tigres (Austin).'
    ].join('\n\n'),
    budget: 1000000, projected_income: 2180000,
    phase: 'negociacion', progress_pct: 46, is_demo: false, accent: '#F59E0B',
    capacity: 21800, ticket_price: 100, deductions_pct: 15, rebate_per: 5, cap_pct: 50, investor_split: 50,
    sort: 4
  }).returning('id');
  const HOU = (houId && houId.id) || houId;

  // Paquetes de inversión de 2027 (reales; editables desde el admin)
  await knex('event_packages').insert([
    { event_id: HOU, name: 'Retorno fijo', modality: 'fijo', amount: 30000, return_pct: 25, count: 0,
      benefits: 'Rendimiento contractual hasta 25%\nContrato individual\nAcceso a documentación y seguimiento', sort: 1 },
    { event_id: HOU, name: 'Participación a riesgo', modality: 'riesgo', amount: 30000, return_pct: 50, count: 0,
      benefits: 'Socio del evento (reparto 50/50)\nParticipación proporcional a tu capital\nSimulador de escenarios por asistencia', sort: 2 }
  ]);

  // Inversiones demo (enlazan por email a los perfiles demo) → edición 2027
  const fijo = await knex('users').where({ email: 'demo.fijo@soccerid.co' }).first();
  const riesgo = await knex('users').where({ email: 'demo.riesgo@soccerid.co' }).first();
  const invs = [];
  if (riesgo) invs.push({ user_id: riesgo.id, event_id: HOU, modality: 'riesgo', capital: 250000, return_pct: 50, invest_date: '2026-08-28', delivery_date: '2027-08-31', state: 'activa', notes: 'Participación variable 50–50 sobre utilidad neta; retorno con tope de 50% sobre el capital.', sort: 1 });
  if (fijo) invs.push({ user_id: fijo.id, event_id: HOU, modality: 'fijo', capital: 100000, return_pct: 25, invest_date: '2026-08-20', delivery_date: '2027-08-31', state: 'activa', notes: 'Retorno fijo conforme al contrato individual.', sort: 2 });
  if (invs.length) await knex('investments').insert(invs);

  // Cronología (2027)
  await knex('event_updates').insert([
    { event_id: HOU, update_date: '2027-04-30', phase: 'Cierre', title: 'Cierre financiero', description: 'Conciliación de ingresos, costos, retornos y reporte final para inversionistas.', sort: 1 },
    { event_id: HOU, update_date: '2027-03-27', phase: 'Evento', title: 'Día del evento', description: 'Operación deportiva, producción, hospitalidad y atención a invitados.', sort: 2 },
    { event_id: HOU, update_date: '2027-01-15', phase: 'Producción', title: 'Lanzamiento de venta', description: 'Activación de ticketing, comunicación y primera fase comercial.', sort: 3 },
    { event_id: HOU, update_date: '2026-10-30', phase: 'Negociación', title: 'Firma de acuerdos definitivos', description: 'Formalización de sede, clubes y calendario de pagos.', sort: 4 },
    { event_id: HOU, update_date: '2026-09-05', phase: 'Negociación', title: 'Avance de sede y siguiente hito', description: 'Propuesta económica de estadio en revisión.', sort: 5 }
  ]);

  // Data room (2027)
  const D = (folder, name, status, visibility, sort) => ({ event_id: HOU, folder, name, status, visibility, sort });
  await knex('event_documents').insert([
    D('Clubes', 'Carta de intención · Club A', 'revision', 'all', 1),
    D('Clubes', 'Términos comerciales · Club B', 'revision', 'riesgo', 2),
    D('Estadio', 'Propuesta económica de estadio', 'revision', 'all', 3),
    D('Estadio', 'Matriz de costos operativos', 'aprobado', 'all', 4),
    D('Evidencias', 'Reunión comercial con clubes', 'aprobado', 'all', 5),
    D('Finanzas', 'Presupuesto maestro · Versión 3', 'aprobado', 'riesgo', 6),
    D('Finanzas', 'Calendario de aplicación de capital', 'aprobado', 'riesgo', 7),
    D('General', 'Resumen ejecutivo del evento', 'aprobado', 'all', 8),
    D('Contratos de inversión', 'Contrato individual · Retorno fijo', 'firmado', 'fijo', 9),
    D('Contratos de inversión', 'Contrato individual · Participación a riesgo', 'firmado', 'riesgo', 10),
    D('Proveedores', 'Itinerario y hospedaje de clubes', 'revision', 'all', 11)
  ]);

  // En medios (2027)
  await knex('event_media').insert([
    { event_id: HOU, title: 'Houston se consolida como plaza para futbol internacional', source: 'Medio deportivo', media_date: '2026-09-04', sort: 1 },
    { event_id: HOU, title: 'Detrás de cámaras: preparación de un amistoso internacional', source: 'Canal deportivo', media_date: '2026-09-02', sort: 2 },
    { event_id: HOU, title: 'Galería: visita técnica al estadio propuesto', source: 'Agencia deportiva', media_date: '2026-08-30', sort: 3 },
    { event_id: HOU, title: 'Entrevista sobre el impacto económico del evento', source: 'Noticias Houston', media_date: '2026-08-25', sort: 4 }
  ]);

  // Comunicaciones (2027)
  await knex('event_communications').insert([
    { event_id: HOU, title: 'Avance de sede y siguiente hito', body: 'Propuesta económica de estadio en revisión; próximos pasos definidos.', audience: 'all', status: 'activo', comm_date: '2026-09-05', sort: 1 },
    { event_id: HOU, title: 'Presupuesto y escenario actualizado', body: 'Actualización de presupuesto e ingreso proyectado del evento.', audience: 'riesgo', status: 'activo', comm_date: '2026-09-04', sort: 2 },
    { event_id: HOU, title: 'Contrato y calendario de tu inversión', body: 'Documentos de tu contrato y calendario de pagos disponibles.', audience: 'fijo', status: 'concluido', comm_date: '2026-09-04', sort: 3 }
  ]);

  console.log('  ✓ Ediciones reales sembradas (2023, 2024, 2025, 2027 + paquetes)');
}

module.exports = { seedPortfolio };
