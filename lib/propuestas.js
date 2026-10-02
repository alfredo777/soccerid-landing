/**
 * Registro de propuestas de inversión (las páginas con candado de código).
 *
 * Hay una propuesta en vivo y puede haber propuestas alternas preparadas por
 * adelantado (por ejemplo, si cambia el partido). Todas comparten la MISMA
 * vista (`views/socceridcup-project2027.hbs`) y el MISMO pool de códigos
 * (`access_codes`): lo único que cambia entre una y otra es el archivo de
 * contenido y el slug. Así una mejora de diseño vale para todas y no se
 * desincronizan.
 *
 * Una propuesta marcada `oculta` no se sirve hasta que su interruptor esté
 * encendido en `app_settings`. El interruptor vive en la base de datos y no en
 * un archivo porque en Heroku el sistema de archivos es efímero: encenderla
 * desde el admin no debe requerir un despliegue.
 */
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const knex = require('../db/knex');

const DEFAULT_ID = '2027';

// Cookie de acceso a una propuesta. Es lo que sustituye al candado de
// JavaScript: el contenido no se manda al navegador hasta que el servidor ve
// esta cookie firmada, así que "ver código fuente" ya no enseña la propuesta.
// Va firmada (no cifrada): no guarda nada secreto, solo a qué propuesta se
// concedió acceso, y el servidor la valida en cada petición.
const ACCESO_SECRET = process.env.PANEL_JWT_SECRET || process.env.SESSION_SECRET || 'panel-dev-secret-change-me';
const ACCESO_HORAS = 12;

function cookieAcceso(variante) {
  return 'pp_acc_' + variante.id;
}

/** Concede acceso: cookie de sesión, httpOnly, que caduca a las 12 horas. */
function darAcceso(res, variante, isProduction) {
  const token = jwt.sign({ v: variante.id }, ACCESO_SECRET, { expiresIn: ACCESO_HORAS + 'h' });
  res.cookie(cookieAcceso(variante), token, {
    httpOnly: true,
    secure: !!isProduction,
    sameSite: 'lax'
    // Sin maxAge a propósito: muere al cerrar el navegador, como antes moría
    // el candado al cerrar la pestaña.
  });
}

/** ¿Esta petición ya pasó el candado de esta propuesta? */
function tieneAcceso(req, variante) {
  if (!variante) return false;
  const token = req.cookies ? req.cookies[cookieAcceso(variante)] : null;
  if (!token) return false;
  try {
    return jwt.verify(token, ACCESO_SECRET).v === variante.id;
  } catch (_) {
    return false;
  }
}

const VARIANTES = {
  // Propuesta en vivo. No lleva interruptor: siempre se sirve.
  '2027': {
    id: '2027',
    slug: 'socceridcup2027',
    file: 'cup_project_2027.json',
    gateKey: 'pp2027',
    label: 'Tigres vs Cruz Azul',
    // Foto del hero y del cierre. Cada propuesta lleva la del partido que
    // anuncia: si se cambia el partido, se cambia aquí la imagen.
    hero: '/assets/images/gallery/cup2027/hero.jpg',
    oculta: false,
    noindex: false,
    settingKey: null
  },
  // Propuesta alterna por si se sustituye el partido. Apagada por defecto:
  // mientras el interruptor esté en 0, la ruta responde 404 aunque se tenga
  // la URL exacta. `noindex` es independiente del interruptor: aunque se
  // encienda para revisarla, sigue sin indexarse hasta que se decida publicarla.
  '2027b': {
    id: '2027b',
    slug: 'socceridcup2027-b',
    file: 'cup_project_2027_b.json',
    gateKey: 'pp2027b',
    label: 'Cruz Azul vs Pumas',
    hero: '/assets/images/gallery/cup2027b/hero.jpg',
    oculta: true,
    noindex: true,
    settingKey: 'propuesta_2027b_visible'
  }
};

function porId(id) {
  return VARIANTES[String(id || '').trim()] || null;
}

function porSlug(slug) {
  const s = String(slug || '').trim();
  return Object.values(VARIANTES).find(v => v.slug === s) || null;
}

function listar() {
  return Object.values(VARIANTES);
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
  rutaContenido,
  leerContenido,
  visible,
  setVisible,
  darAcceso,
  tieneAcceso
};
