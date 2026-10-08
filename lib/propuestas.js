/**
 * Registro de propuestas de inversión (las páginas con candado de código).
 *
 * Hay una propuesta en vivo (`DEFAULT_ID`) y las demás quedan guardadas: la
 * anterior no se borra, se apaga, por si hay que volver a ella. Todas
 * comparten la MISMA vista (`views/socceridcup-project2027.hbs`) y el MISMO
 * pool de códigos (`access_codes`): lo único que cambia entre una y otra es el
 * archivo de contenido y el slug. Así una mejora de diseño vale para todas y no
 * se desincronizan.
 *
 * Una propuesta marcada `oculta` no se sirve hasta que su interruptor esté
 * encendido en `app_settings`. El interruptor vive en la base de datos y no en
 * un archivo porque en Heroku el sistema de archivos es efímero: encenderla
 * desde el admin no debe requerir un despliegue.
 *
 * Al cambiar de propuesta en vivo se mueve `DEFAULT_ID` y se apaga la saliente
 * marcándola `oculta` con su propio `settingKey`. Nada más: las rutas, el
 * candado, el correo del código y el admin leen el slug de aquí.
 */
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const knex = require('../db/knex');

// La propuesta en vivo: la que se sirve siempre y a la que apuntan los
// enlaces que no nombran una variante (el correo del código, los redirects).
const DEFAULT_ID = '2027b';

// Cookie de acceso a una propuesta. Es lo que sustituye al candado de
// JavaScript: el contenido no se manda al navegador hasta que el servidor ve
// esta cookie firmada, así que "ver código fuente" ya no enseña la propuesta.
// Va firmada (no cifrada): no guarda nada secreto, solo a qué propuesta se
// concedió acceso, y el servidor la valida en cada petición.
const ACCESO_SECRET = process.env.PANEL_JWT_SECRET || process.env.SESSION_SECRET || 'panel-dev-secret-change-me';
const ACCESO_HORAS = 12;

// Una sola cookie para todo el acceso, en vez de una por propuesta: ahora un
// código de tour abre varias páginas a la vez y el nivel tiene que viajar con
// el acceso (de él depende el mínimo de inversión que se enseña).
const COOKIE_ACCESO = 'pp_acc';

/**
 * Concede acceso: cookie de sesión, httpOnly, que caduca a las 12 horas.
 * `acceso` es lo que devuelve `alcanceDe`: el nivel y qué páginas abre.
 */
function darAcceso(res, acceso, isProduction) {
  const token = jwt.sign({ n: acceso.nivel, v: acceso.variantes }, ACCESO_SECRET, { expiresIn: ACCESO_HORAS + 'h' });
  res.cookie(COOKIE_ACCESO, token, {
    httpOnly: true,
    secure: !!isProduction,
    sameSite: 'lax'
    // Sin maxAge a propósito: muere al cerrar el navegador, como antes moría
    // el candado al cerrar la pestaña.
  });
}

/** El acceso de esta petición: `{ nivel, variantes }`, o `null` si no pasó el candado. */
function accesoDe(req) {
  const token = req.cookies ? req.cookies[COOKIE_ACCESO] : null;
  if (!token) return null;
  try {
    const p = jwt.verify(token, ACCESO_SECRET);
    // Se filtran las que ya no existen: una cookie vieja no puede abrir una
    // propuesta retirada del registro.
    const variantes = (Array.isArray(p.v) ? p.v : []).filter(id => VARIANTES[id]);
    if (!variantes.length) return null;
    return { nivel: p.n === 'tour' ? 'tour' : 'partido', variantes };
  } catch (_) {
    return null;
  }
}

/** ¿Esta petición ya pasó el candado de ESTA página? */
function tieneAcceso(req, variante) {
  if (!variante) return false;
  const a = accesoDe(req);
  return !!a && a.variantes.indexOf(variante.id) !== -1;
}

/**
 * Qué abre un código, según el nivel que le puso el organizador:
 *   tour    → la página del tour y todos los partidos
 *   partido → un solo partido, el de su columna `variante`
 * Sin nivel (o con uno que no se reconoce) no abre nada: `null`. Los códigos
 * repartidos antes de que existieran los niveles caen aquí a propósito.
 */
function alcanceDe(codeRow) {
  const nivel = String((codeRow && codeRow.nivel) || '').trim();
  if (nivel === 'tour') return { nivel: 'tour', variantes: listar().map(v => v.id) };
  if (nivel === 'partido') {
    const v = porId(codeRow.variante);
    return (v && v.tipo === 'partido') ? { nivel: 'partido', variantes: [v.id] } : null;
  }
  return null;
}

/**
 * A qué página mandar a quien tiene este acceso: la primera que puede ver y
 * está encendida. Quien entra con nivel de partido aterriza en su partido
 * aunque haya pedido el tour.
 */
async function destino(acceso) {
  if (!acceso) return null;
  const orden = acceso.nivel === 'tour'
    ? [porTipo('tour')].concat(listar().filter(v => v.tipo === 'partido'))
    : acceso.variantes.map(porId);
  for (const v of orden) {
    if (v && acceso.variantes.indexOf(v.id) !== -1 && await visible(v)) return v;
  }
  return null;
}

const VARIANTES = {
  // La página del tour: el paraguas de la edición 2027, del que cuelgan los
  // partidos. Apagada hasta que tenga contenido; mientras tanto su dirección
  // lleva a la propuesta en vivo, que es lo que hacía antes.
  'tour27': {
    id: 'tour27',
    tipo: 'tour',
    orden: 1,
    slug: 'socceridcup2027',
    file: 'cup_tour_2027.json',
    gateKey: 'pptour',
    label: "SOCCER iD TOUR '27",
    hero: '/assets/images/gallery/cup2027b/hero.jpg',
    // El tour tiene marca propia y su página toma de ella los colores. Los
    // partidos no llevan logo: conservan el diseño de la propuesta.
    logo: '/assets/images/logos/id-tour27.png',
    oculta: true,
    noindex: true,
    settingKey: 'tour_2027_visible'
  },
  // Los otros dos partidos del tour. Existen como página desde ya —tienen su
  // dirección, su candado y pueden llevar códigos propios— pero todavía no hay
  // propuesta que enseñar: se están negociando con los clubes. `estado` es lo
  // que decide qué se sirve detrás del candado; el día que se cierre el
  // partido se le pone su archivo de contenido, se quita el `estado` y la
  // dirección y los códigos repartidos siguen sirviendo igual.
  'partido2': {
    id: 'partido2',
    tipo: 'partido',
    orden: 3,
    estado: 'negociacion',
    // Lo unico que distingue al partido 2 del 3 mientras no esten cerrados.
    // Sale de la lamina 3 y de la 14 de la presentacion.
    ventana: 'Julio / agosto 2027',
    slug: 'socceridcup2027/partido-2',
    file: 'cup_partido_negociacion.json',
    gateKey: 'ppp2',
    label: 'Partido 2 · julio/agosto',
    hero: '/assets/images/gallery/cup2027b/hero.jpg',
    oculta: false,
    noindex: true,
    settingKey: null
  },
  'partido3': {
    id: 'partido3',
    tipo: 'partido',
    orden: 4,
    estado: 'negociacion',
    ventana: 'Septiembre / octubre 2027',
    slug: 'socceridcup2027/partido-3',
    file: 'cup_partido_negociacion.json',
    gateKey: 'ppp3',
    label: 'Partido 3 · septiembre/octubre',
    hero: '/assets/images/gallery/cup2027b/hero.jpg',
    oculta: false,
    noindex: true,
    settingKey: null
  },
  // Propuesta anterior (Pumas vs Cruz Azul). Ya no está en vivo: se guarda
  // apagada por si se vuelve a ella, con su dirección de siempre reservada.
  // Mientras el interruptor esté en 0 esa dirección lleva a la propuesta en
  // vivo (ver el bloque de rutas en index.js).
  '2027': {
    id: '2027',
    tipo: 'partido',
    orden: 9,
    // Ya no vive en /socceridcup2027: esa dirección es la del tour. No se
    // numera como `partido-N` porque no forma parte del tour, es el archivo.
    slug: 'socceridcup2027/anterior',
    file: 'cup_project_2027.json',
    gateKey: 'pp2027',
    // La etiqueta sale del hero de su archivo de contenido: ese partido pasó de
    // Tigres a Pumas y la etiqueta se había quedado atrás.
    label: 'Pumas vs Cruz Azul',
    // Foto del hero y del cierre. Cada propuesta lleva la del partido que
    // anuncia: si se cambia el partido, se cambia aquí la imagen.
    hero: '/assets/images/gallery/cup2027/hero.jpg',
    oculta: true,
    noindex: true,
    settingKey: 'propuesta_2027_visible'
  },
  // Propuesta en vivo. Vive bajo la dirección de la anterior, en un segmento
  // numerado: los equipos son confidenciales y la URL viaja por correo, se queda
  // en el historial del navegador y en los registros del servidor, así que no
  // puede nombrarlos. El siguiente partido sería `partido-2`, no su nombre.
  '2027b': {
    id: '2027b',
    tipo: 'partido',
    orden: 2,
    slug: 'socceridcup2027/partido-1',
    file: 'cup_project_2027_b.json',
    gateKey: 'pp2027b',
    label: 'Cruz Azul vs Pumas',
    hero: '/assets/images/gallery/cup2027b/hero.jpg',
    oculta: false,
    noindex: false,
    settingKey: null
  }
};

function porId(id) {
  return VARIANTES[String(id || '').trim()] || null;
}

function porSlug(slug) {
  const s = String(slug || '').trim();
  return Object.values(VARIANTES).find(v => v.slug === s) || null;
}

// Ojo con el orden: JavaScript coloca primero las llaves que parecen números,
// así que '2027' se adelantaría a 'tour27' por mucho que esté escrito después.
// De ahí el campo `orden`, que es el que manda.
function listar() {
  return Object.values(VARIANTES).slice().sort((a, b) => (a.orden || 99) - (b.orden || 99));
}

/** La primera entrada de este tipo ('tour' o 'partido'). */
function porTipo(tipo) {
  return listar().find(v => v.tipo === tipo) || null;
}

/** Los partidos, en el orden del registro. Es lo que lista el tour y el admin. */
function partidos() {
  return listar().filter(v => v.tipo === 'partido');
}

/** ¿Este partido todavía se está negociando? Entonces no hay propuesta detrás. */
function enNegociacion(variante) {
  return !!variante && variante.estado === 'negociacion';
}

/** La propuesta en vivo; sirve de respaldo cuando no se indica ninguna. */
function porDefecto() {
  return VARIANTES[DEFAULT_ID];
}

/**
 * Normaliza lo que llegue del cliente (por ejemplo el campo `variant` del
 * formulario de acceso) a una propuesta conocida. Nunca confía en el valor
 * recibido: si no coincide con el registro, cae en la propuesta en vivo.
 */
function desdeCliente(valor) {
  return porId(valor) || porDefecto();
}

/** Ruta absoluta al archivo de contenido de la propuesta. */
function rutaContenido(variante) {
  return path.join(__dirname, '..', 'contents', variante.file);
}

/** Lee el contenido de la propuesta en el idioma pedido. `null` si no existe. */
function leerContenido(variante, lang, defaultLang) {
  const file = rutaContenido(variante);
  if (!fs.existsSync(file)) return null;
  const todo = JSON.parse(fs.readFileSync(file, 'utf8'));
  return todo[lang] || todo[defaultLang || 'es'] || null;
}

/**
 * Los idiomas que esta propuesta tiene DE VERDAD, leídos del archivo de
 * contenido. `leerContenido` cae al idioma por defecto cuando falta el pedido,
 * y esa caída es silenciosa: sin esto la página marcaba "EN" como activo y
 * servía el español, que es peor que no ofrecer el inglés.
 *
 * Devuelve las claves de idioma en el orden en que se quieren pintar, nunca
 * vacío: si el archivo no se puede leer, al menos queda el idioma por defecto.
 */
function idiomasDe(variante, soportados) {
  const orden = soportados || ['es', 'en'];
  try {
    const file = rutaContenido(variante);
    if (!fs.existsSync(file)) return [orden[0]];
    const todo = JSON.parse(fs.readFileSync(file, 'utf8'));
    const hay = orden.filter(l => todo[l]);
    return hay.length ? hay : [orden[0]];
  } catch (_) {
    return [orden[0]];
  }
}

/**
 * ¿Se puede servir esta propuesta? Las que no están ocultas, siempre. Las
 * ocultas, solo con su interruptor encendido. Ante cualquier error de base de
 * datos se responde `false`: más vale un 404 de más que filtrar una propuesta
 * que todavía no se decide.
 */
async function visible(variante) {
  if (!variante) return false;
  if (!variante.oculta) return true;
  try {
    const row = await knex('app_settings').where({ key: variante.settingKey }).first();
    return !!row && String(row.value) === '1';
  } catch (_) {
    return false;
  }
}

/** Enciende o apaga una propuesta oculta. */
async function setVisible(variante, encendida) {
  if (!variante || !variante.settingKey) return false;
  const value = encendida ? '1' : '0';
  const ex = await knex('app_settings').where({ key: variante.settingKey }).first();
  if (ex) await knex('app_settings').where({ key: variante.settingKey }).update({ value });
  else await knex('app_settings').insert({ key: variante.settingKey, value });
  return encendida;
}

module.exports = {
  VARIANTES,
  DEFAULT_ID,
  porId,
  porSlug,
  porDefecto,
  desdeCliente,
  listar,
  porTipo,
  partidos,
  enNegociacion,
  alcanceDe,
  accesoDe,
  destino,
  rutaContenido,
  leerContenido,
  idiomasDe,
  visible,
  setVisible,
  darAcceso,
  tieneAcceso
};
