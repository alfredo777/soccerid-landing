/**
 * Itinerarios de los viajes próximos de Travel, editables desde el admin
 * (Panel › Sitio web › Itinerarios, /panel/admin/sitio/itinerarios).
 *
 * Se guardan en `app_settings` (clave `sitio_itinerarios`), como el Tour,
 * porque en Heroku el disco no persiste. Forma:
 *   { <slug del viaje>: { estado, entradas: [{ fecha, hora, concepto, detalle }] } }
 * Los viajes salen de contents/viajes.json; el slug los une.
 *
 * `estado` dice cómo se ve en la ficha pública del viaje:
 *   oculto     no aparece
 *   ejemplo    aparece con la pastilla «Itinerario de ejemplo»: fechas,
 *              horarios y servicios por confirmar
 *   publicado  aparece como itinerario confirmado
 * Todos arrancan en «ejemplo» con el itinerario de maquetación del
 * documento de textos (27/10/2026). El del Tour es literal; en los demás
 * las fechas de marzo pasan a «Día 1, 2, 3» porque son sólo del Tour.
 * Un registro guardado antes de existir `estado` traía `publicado`: se lee
 * como «publicado» si era true y como «ejemplo» si no.
 */
const path = require('path');
const fs = require('fs');
const knex = require('../db/knex');

const KEY = 'sitio_itinerarios';
const ESTADOS = ['oculto', 'ejemplo', 'publicado'];

const PASOS = [
  ['Salida desde CDMX', 'Encuentro en el aeropuerto y vuelo directo a la ciudad sede.'],
  ['Llegada y hospedaje', 'Recepción en el aeropuerto, traslado al hotel y registro. Tarde libre para conocer la ciudad.'],
  ['Cena con leyendas', 'Cena de bienvenida y convivencia con invitados especiales del fútbol.'],
  ['Mañana libre', 'Tiempo para recorrer la ciudad o descansar antes del partido.'],
  ['Traslado al estadio', 'Salida desde el hotel y acceso a la zona VIP para vivir el encuentro de SOCCER iD TOUR.'],
  ['Regreso al hotel', 'Traslado al finalizar el partido.'],
  ['Regreso a CDMX', 'Salida del hotel, traslado al aeropuerto y vuelo de regreso.']
];
const FECHAS_TOUR = ['26 de marzo de 2027', '26 de marzo de 2027', '26 de marzo de 2027',
  '27 de marzo de 2027', '27 de marzo de 2027', '27 de marzo de 2027', '28 de marzo de 2027'];
const DIAS = ['Día 1', 'Día 1', 'Día 1', 'Día 2', 'Día 2', 'Día 2', 'Día 3'];

function ejemploPara(slug) {
  const tour = slug === 'soccerid-tour-2027';
  return PASOS.map(([concepto, detalle], i) => ({
    fecha: tour ? FECHAS_TOUR[i] : DIAS[i],
    hora: '',
    concepto,
    detalle: tour ? detalle : detalle.replace('el encuentro de SOCCER iD TOUR', 'el partido')
  }));
}

/** Los viajes próximos que pueden llevar itinerario: { slug, nombre, fechaTexto }. */
function viajes() {
  try {
    const v = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contents', 'viajes.json'), 'utf8'));
    return ((v.es || {}).proximos || []).map(x => ({ slug: x.slug, nombre: x.nombre, fechaTexto: x.fechaTexto }));
  } catch (_) { return []; }
}

async function guardado() {
  try {
    const row = await knex('app_settings').where({ key: KEY }).first();
    if (row && row.value) return JSON.parse(row.value) || {};
  } catch (_) {}
  return {};
}

// Viajes cuyo itinerario arranca oculto: la entrega del 28/10/2026 pide no
// presentar el ejemplo como definitivo en El Clásico mientras no haya el real.
const OCULTOS_DE_INICIO = ['el-clasico-2027'];

// Lo guardado de un viaje, con el ejemplo cuando no hay entradas.
function normalizar(slug, g) {
  g = g || {};
  const inicial = OCULTOS_DE_INICIO.includes(slug) ? 'oculto' : 'ejemplo';
  const estado = ESTADOS.includes(g.estado) ? g.estado : (g.publicado ? 'publicado' : inicial);
  const entradas = (g.entradas || []).length ? g.entradas : ejemploPara(slug);
  return { estado, entradas };
}

/** Todos los viajes, para el admin. */
async function todos() {
  const g = await guardado();
  const out = {};
  viajes().forEach(v => { out[v.slug] = normalizar(v.slug, g[v.slug]); });
  return out;
}

const txt = (v, max) => String(v == null ? '' : v).trim().slice(0, max);

async function guardar(datos) {
  const validos = new Set(viajes().map(v => v.slug));
  const limpio = {};
  Object.keys(datos || {}).forEach(slug => {
    if (!validos.has(slug)) return;
    const d = datos[slug] || {};
    limpio[slug] = {
      estado: ESTADOS.includes(d.estado) ? d.estado : 'oculto',
      entradas: (Array.isArray(d.entradas) ? d.entradas : []).slice(0, 60).map(e => ({
        fecha: txt(e.fecha, 60), hora: txt(e.hora, 20), concepto: txt(e.concepto, 120), detalle: txt(e.detalle, 500)
      })).filter(e => e.fecha || e.concepto)
    };
  });
  const value = JSON.stringify(limpio);
  const ex = await knex('app_settings').where({ key: KEY }).first();
  if (ex) await knex('app_settings').where({ key: KEY }).update({ value });
  else await knex('app_settings').insert({ key: KEY, value });
}

/**
 * Lo que pinta la ficha pública: { ejemplo, dias: [{ fecha, pasos }] }, o
 * null si está oculto. Agrupa por días consecutivos con la misma fecha, en
 * el orden capturado.
 */
async function paraFicha(slug) {
  const it = normalizar(slug, (await guardado())[slug]);
  if (it.estado === 'oculto' || !it.entradas.length) return null;
  const dias = [];
  it.entradas.forEach(e => {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.fecha === e.fecha) ultimo.pasos.push(e);
    else dias.push({ fecha: e.fecha, pasos: [e] });
  });
  return { ejemplo: it.estado === 'ejemplo', dias };
}

module.exports = { viajes, todos, guardar, paraFicha, ESTADOS, KEY };
