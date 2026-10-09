#!/usr/bin/env node
/**
 *   node scripts/contenido-tour.js
 *
 * Escribe contents/cup_tour_2027.json a partir del brief "SOCCER iD TOUR 2027
 * · Estructura del sitio" (cinco bloques compactos).
 *
 * Una sola fuente para los dos idiomas: cada texto es un par {es, en} y las
 * cifras se escriben UNA vez. Así es imposible que el inglés y el español
 * digan números distintos, que es el error que más cuesta ver.
 *
 * Lo pendiente en el brief (mínimo de inversión, rendimiento estimado) NO se
 * publica: queda con `pendiente: true` y valor vacío. Al cerrar la cifra se
 * escribe el valor y se quita la marca, en los dos idiomas a la vez (sale de
 * aquí).
 */
const fs = require('fs');
const path = require('path');
const ARCHIVO = path.join(__dirname, '..', 'contents', 'cup_tour_2027.json');

const T = (es, en) => ({ __t: true, es, en });

const FUENTE = {
  pageTitle: T("SOCCER iD TOUR '27 — Tres partidos, una inversión", "SOCCER iD TOUR '27 — Three matches, one investment"),
  marca: "SOCCER iD TOUR '27",
  confidencial: T('CONFIDENCIAL', 'CONFIDENTIAL'),
  lock: {
    badge: T('CONFIDENCIAL', 'CONFIDENTIAL'),
    title: T('ACCESO RESTRINGIDO', 'RESTRICTED ACCESS'),
    subtitle: T('Ingresa tu código personalizado', 'Enter your personalized code'),
    placeholder: T('Código de acceso', 'Access code'),
    button: T('Acceder', 'Access'),
    error: T('Código incorrecto. Intenta de nuevo.', 'Incorrect code. Please try again.')
  },

  hero: {
    badge: T('PROYECTO ANUAL', 'ANNUAL PROJECT'),
    title: "SOCCER iD TOUR '27",
    lead: T('Tres partidos internacionales. Una inversión en la temporada.', 'Three international matches. One investment in the season.'),
    meta: T('Estados Unidos · Marzo a octubre 2027', 'United States · March to October 2027'),
    cifras: [
      { label: T('CAPITAL REQUERIDO', 'CAPITAL REQUIRED'), value: 'USD 1.4 M', note: T('Partido 1 completo + anticipos de 2 y 3', 'Match 1 in full + advances for 2 and 3'), icon: 'dinero' },
      { label: T('UTILIDADES PARA INVERSIONISTAS', 'PROFITS FOR INVESTORS'), value: '70%', note: T('30% para SOCCER iD', '30% for SOCCER iD'), icon: 'reparto' },
      { label: T('DEVOLUCIÓN PREVISTA', 'EXPECTED RETURN OF CAPITAL'), value: T('DIC 2027', 'DEC 2027'), note: T('Sujeto a cobranza y liquidación', 'Subject to collection and settlement'), icon: 'calendario-ok' }
    ]
  },

  proyecto: {
    kicker: T('01 · EL PROYECTO', '01 · THE PROJECT'),
    title: T('Tres partidos, un resultado.', 'Three matches, one result.'),
    sub: T('Participa en los resultados de tres partidos en Estados Unidos. Ingresos por boletaje, patrocinios y acuerdos comerciales.',
           'Take part in the results of three matches in the United States. Revenue from ticketing, sponsorships and commercial agreements.'),
    estados: { previsto: T('Previsto', 'Scheduled'), proceso: T('En proceso', 'In progress') },
    cta: T('Ver partido', 'View match'),
    cards: [
      { n: '01', variante: '2027b',    cuando: T('27 marzo', '27 March'),             titulo: 'Cruz Azul vs. Pumas', lugar: T('Houston, Texas', 'Houston, Texas'), estado: 'previsto' },
      { n: '02', variante: 'partido2', cuando: T('Julio / agosto', 'July / August'),  titulo: T('Segundo partido', 'Second match'), lugar: T('Estados Unidos', 'United States'), estado: 'proceso' },
      { n: '03', variante: 'partido3', cuando: T('Septiembre / octubre', 'September / October'), titulo: T('Tercer partido', 'Third match'), lugar: T('Estados Unidos', 'United States'), estado: 'proceso' }
    ]
  },

  capital: {
    kicker: T('02 · CAPITAL Y DESTINO', '02 · CAPITAL AND USE OF FUNDS'),
    title: T('USD 1,400,000 para toda la temporada.', 'USD 1,400,000 for the whole season.'),
    // Pendiente en el brief: no se publica hasta que haya cifra.
    minimo: { label: T('Participa desde', 'Participate from'), value: '', pendiente: true },
    items: [
      { label: T('PARTIDO 1', 'MATCH 1'), note: T('Presupuesto completo', 'Full budget'),   value: 'USD 1,000,000', monto: 1000000 },
      { label: T('PARTIDO 2', 'MATCH 2'), note: T('Anticipos', 'Advances'),                 value: 'USD 200,000',   monto: 200000 },
      { label: T('PARTIDO 3', 'MATCH 3'), note: T('Anticipos', 'Advances'),                 value: 'USD 200,000',   monto: 200000 }
    ],
    barraLabel: T('CÓMO SE REPARTE EL CAPITAL', 'HOW THE CAPITAL IS ALLOCATED'),
    totalLabel: T('CAPITAL REQUERIDO', 'CAPITAL REQUIRED'),
    totalValue: 'USD 1,400,000',
    nota: T('El capital cubre el primer partido y los anticipos de los otros dos. Los anticipos se descuentan del costo de cada evento; no se contabilizan dos veces.',
            'The capital covers the first match and the advances for the other two. Advances are deducted from each event\u2019s cost; they are not counted twice.'),
    cta: T('Ver presupuesto', 'View budget'),
    cajon: {
      title: T('Presupuesto del primer partido', 'First match budget'),
      sub: T('Cruz Azul vs. Pumas · Shell Energy Stadium, Houston · Cifras del perfil del partido.', 'Cruz Azul vs. Pumas · Shell Energy Stadium, Houston · Figures from the match profile.'),
      totalLabel: 'TOTAL / USD',
      totalValue: '1.0 M',
      anticiposTitle: T('Anticipos de los otros dos partidos', 'Advances for the other two matches'),
      anticiposNota: T('USD 200,000 por partido, previstos. Cada uno tendrá su presupuesto completo en su propio perfil cuando se cierre.',
                       'USD 200,000 per match, projected. Each will have its full budget on its own profile once it is closed.')
    }
  },

  // Alimenta la dona del cajón de presupuesto (lo lee donutCostos en index.js).
  costos: {
    moneda: 'USD',
    lineas: [
      { concepto: T('Fee de clubes', 'Club fees'),                 monto: '400,000' },
      { concepto: T('Estadio y operación', 'Stadium and operations'), monto: '200,000' },
      { concepto: T('Transporte y hospedaje', 'Travel and lodging'), monto: '250,000' },
      { concepto: 'Marketing',                                      monto: '100,000' },
      { concepto: T('Producción de TV', 'TV production'),          monto: '15,000' },
      { concepto: T('Permisos y seguros', 'Permits and insurance'), monto: '35,000' }
    ]
  },

  participacion: {
    kicker: T('03 · PARTICIPACIÓN Y RETORNO', '03 · PARTICIPATION AND RETURN'),
    title: T('70% de las utilidades para inversionistas.', '70% of the profits for investors.'),
    partes: [
      { pct: '70%', quien: T('INVERSIONISTAS', 'INVESTORS') },
      { pct: '30%', quien: 'SOCCER iD' }
    ],
    lineas: [
      T('Tu aportación determina tu participación en las utilidades de la temporada.', 'Your contribution determines your share of the season\u2019s profits.'),
      T('Devolución prevista: diciembre de 2027, tras el cierre financiero de los tres partidos.', 'Expected return of capital: December 2027, after the financial close of the three matches.')
    ],
    // Pendiente en el brief: se sustituirá por tres escenarios cuando se valide la proyección.
    rendimiento: { label: T('Rendimiento estimado', 'Estimated return'), value: '', pendiente: true },
    devolucion: { label: T('DEVOLUCIÓN PREVISTA', 'EXPECTED RETURN OF CAPITAL'), value: T('Diciembre 2027', 'December 2027') },
    nota: T('El reparto del 70% no equivale a un rendimiento del 70%. Las utilidades dependen del resultado real de los tres partidos.',
            'The 70% split is not a 70% return. Profits depend on the actual result of the three matches.')
  },

  respaldo: {
    kicker: T('04 · RESPALDO Y SEGUIMIENTO', '04 · BACKING AND FOLLOW-UP'),
    title: T('Contrato, panel privado y documentación.', 'Contract, private panel and documentation.'),
    items: [
      { title: T('Contrato de inversión', 'Investment contract'),    icon: 'escudo' },
      { title: T('Panel privado', 'Private panel'),                  icon: 'ojo' },
      { title: T('Documentación del proyecto', 'Project documentation'), icon: 'caja' }
    ],
    lead: T('Experiencias y beneficios según tu participación.', 'Experiences and benefits according to your participation.'),
    cta: T('Consultar detalles', 'See details'),
    aviso: T('Inversión a riesgo, sin garantía de rendimiento ni de recuperación íntegra del capital.',
             'At-risk investment, with no guarantee of return or of full recovery of capital.'),
    cajon: {
      title: T('Respaldo y seguimiento', 'Backing and follow-up'),
      sub: T('La participación se formaliza mediante contrato. Esto es lo que tienes durante el proyecto.',
             'Participation is formalized through a contract. This is what you have throughout the project.'),
      items: [
        { title: T('Contrato de inversión', 'Investment contract'), body: T('Participación en el resultado conjunto de los tres partidos, con reglas de distribución, pérdidas y cambios de calendario por escrito.', 'Participation in the combined result of the three matches, with the rules for distribution, losses and calendar changes in writing.'), icon: 'escudo' },
        { title: T('Panel privado', 'Private panel'), body: T('Información sobre recursos, eventos y cierre financiero conforme a lo pactado.', 'Reporting on funds, events and the financial close as agreed.'), icon: 'ojo' },
        { title: T('Documentación del proyecto', 'Project documentation'), body: T('Acceso a los documentos del proyecto según tu nivel de participación.', 'Access to the project documents according to your level of participation.'), icon: 'caja' },
        { title: T('Uso de recursos', 'Use of funds'), body: T("Capital destinado exclusivamente al proyecto SOCCER iD TOUR '27.", "Capital allocated exclusively to the SOCCER iD TOUR '27 project."), icon: 'candado' },
        { title: T('Experiencias y beneficios', 'Experiences and benefits'), body: T('Disponibles según tu participación y los permisos de cada evento. Se detallan en la propuesta.', 'Available according to your participation and each event\u2019s permits. Detailed in the proposal.'), icon: 'boleto' }
      ],
      aviso: T('No se ofrece rendimiento fijo ni recuperación íntegra garantizada. La inversión puede presentar pérdida parcial o total. El contrato establecerá reglas de distribución, pérdidas y cambios de calendario.',
               'No fixed return or guaranteed full recovery is offered. The investment may result in partial or total loss. The contract will set out the rules for distribution, losses and calendar changes.')
    }
  },

  trayectoria: {
    kicker: T('05 · TRAYECTORIA', '05 · TRACK RECORD'),
    title: T('Tres ediciones realizadas.', 'Three editions delivered.'),
    sub: T('2023 · 2024 · 2025. Clubes, aficionados, sedes y marcas conectados a través del futbol.', '2023 · 2024 · 2025. Clubs, fans, venues and brands connected through football.'),
    ediciones: [
      { anio: '2023', match: 'Pumas vs. Comunicaciones',      sede: 'San José, California' },
      { anio: '2024', match: 'América vs. Atlético Nacional', sede: 'Orlando, Florida' },
      { anio: '2025', match: 'Pumas vs. Tigres',              sede: 'Austin, Texas' }
    ],
    cta: T('Ver trayectoria', 'View track record'),
    cajon: {
      title: T('Trayectoria', 'Track record'),
      sub: T('Tres ediciones de la SOCCER iD CUP como antecedente directo del tour.', 'Three editions of the SOCCER iD CUP as the direct precedent for the tour.'),
      capacidades: T('Relación con clubes · Comercialización · Producción · Broadcast · Operación internacional', 'Club relations · Commercialization · Production · Broadcast · International operations'),
      mediosTitle: T('Cobertura en medios', 'Media coverage'),
      mediosSub: T('Notas de prensa de las ediciones anteriores, en medios de cada plaza.', 'Press coverage of previous editions, in each market\u2019s media.'),
      ctaHistoria: T('Conoce la historia de la copa', 'Discover the cup\u2019s history'),
      ctaHistoriaUrl: T('/es/socceridcup', '/en/socceridcup')
    }
  },

  contacto: {
    kicker: T('CONTACTO', 'CONTACT'),
    title: T("Sé parte de SOCCER iD TOUR '27.", "Be part of SOCCER iD TOUR '27."),
    body: T('Solicita la propuesta de inversión y nuestro equipo te acompaña a revisar el proyecto y resolver tus preguntas.',
            'Request the investment proposal and our team will walk you through the project and answer your questions.'),
    cta: T('Solicitar propuesta de inversión', 'Request the investment proposal'),
    ctaUrl: 'mailto:socceridco@soccerid.co?subject=SOCCER%20iD%20TOUR%2027'
  },

  cajon: { cerrar: T('Cerrar', 'Close') },
  pendienteLabel: T('POR DEFINIR', 'TBD')
};

function enIdioma(x, lang) {
  if (x && typeof x === 'object' && x.__t) return x[lang];
  if (Array.isArray(x)) return x.map(v => enIdioma(v, lang));
  if (x && typeof x === 'object') {
    const o = {};
    for (const k of Object.keys(x)) o[k] = enIdioma(x[k], lang);
    return o;
  }
  return x;
}

const es = enIdioma(FUENTE, 'es');
const en = enIdioma(FUENTE, 'en');

// Las cifras tienen que ser idénticas en los dos idiomas: aquí se comprueba.
const nums = o => { const out = []; const r = (x, p) => { if (typeof x === 'number' || typeof x === 'boolean') { out.push(p + '=' + x); return; } if (Array.isArray(x)) { x.forEach((v, i) => r(v, p + '[' + i + ']')); return; } if (x && typeof x === 'object') { Object.keys(x).forEach(k => r(x[k], p + '.' + k)); } }; r(o, ''); return out.join('|'); };
if (nums(es) !== nums(en)) { console.error('Las cifras no coinciden entre es y en'); process.exit(1); }

// Y ningún par {es,en} con uno de los dos vacío.
const huecos = []; const rev = (x, p) => { if (x && typeof x === 'object' && x.__t) { if (!x.es || !x.en) huecos.push(p); return; } if (Array.isArray(x)) x.forEach((v, i) => rev(v, p + '[' + i + ']')); else if (x && typeof x === 'object') Object.keys(x).forEach(k => rev(x[k], p + '.' + k)); };
rev(FUENTE, ''); if (huecos.length) { console.error('Pares incompletos: ' + huecos.join(', ')); process.exit(1); }

const salida = {
  _nota: "Estructura del sitio v2 (brief 'SOCCER iD TOUR 2027 · Estructura del sitio'): cinco bloques compactos; presupuesto, condiciones y trayectoria van en cajones laterales fuera del recorrido principal. Este archivo lo GENERA scripts/contenido-tour.js desde una sola fuente con pares {es,en}: edita la fuente, no este JSON, para que los dos idiomas no se desincronicen. Pendientes del brief que NO se publican hasta tener cifra: capital.minimo (inversion minima) y participacion.rendimiento (escenarios bajo/base/favorable). Las cifras de anticipos (USD 200,000 por partido) y el capital requerido (USD 1.4 M) vienen del brief.",
  es, en
};
fs.writeFileSync(ARCHIVO, JSON.stringify(salida, null, 2) + '\n', 'utf8');
const cuenta = o => { let n = 0; const r = x => { if (typeof x === 'string') { n++; return; } if (Array.isArray(x)) x.forEach(r); else if (x && typeof x === 'object') Object.values(x).forEach(r); }; r(o); return n; };
console.log('escrito ' + ARCHIVO);
console.log('cadenas: es ' + cuenta(es) + ' · en ' + cuenta(en) + ' · cifras idénticas: sí');
