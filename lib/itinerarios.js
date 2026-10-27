/**
 * Itinerarios de los viajes próximos de Travel, editables desde el admin
 * (Panel › Sitio web › Itinerarios, /panel/admin/sitio/itinerarios).
 *
 * Se guardan en `app_settings` (clave `sitio_itinerarios`), como el Tour,
 * porque en Heroku el disco no persiste. Forma:
 *   { <slug del viaje>: { publicado: bool, entradas: [{ fecha, hora, concepto, detalle }] } }
 * Los viajes salen de contents/viajes.json; el slug los une.
 *
 * Un itinerario sólo se ve en la ficha pública si está marcado como
 * publicado Y tiene entradas. El de SOCCER iD TOUR arranca con el ejemplo
 * del documento de textos, que es DE MAQUETACIÓN: viene sin publicar y no
 * debe publicarse hasta sustituirlo por el real.
 */
const path = require('path');
const fs = require('fs');
const knex = require('../db/knex');

const KEY = 'sitio_itinerarios';

const DUMMY_TOUR = [
  ['26 de marzo de 2027', '', 'Salida desde CDMX', 'Encuentro en el aeropuerto y vuelo directo a la ciudad sede.'],
  ['26 de marzo de 2027', '', 'Llegada y hospedaje', 'Recepción en el aeropuerto, traslado al hotel y registro. Tarde libre para conocer la ciudad.'],
  ['26 de marzo de 2027', '', 'Cena con leyendas', 'Cena de bienvenida y convivencia con invitados especiales del fútbol.'],
  ['27 de marzo de 2027', '', 'Mañana libre', 'Tiempo para recorrer la ciudad o descansar antes del partido.'],
  ['27 de marzo de 2027', '', 'Traslado al estadio', 'Salida desde el hotel y acceso a la zona VIP para vivir el encuentro de SOCCER iD TOUR.'],
  ['27 de marzo de 2027', '', 'Regreso al hotel', 'Traslado al finalizar el partido.'],
  ['28 de marzo de 2027', '', 'Regreso a CDMX', 'Salida del hotel, traslado al aeropuerto y vuelo de regreso.']
].map(([fecha, hora, concepto, detalle]) => ({ fecha, hora, concepto, detalle }));

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

/** Todos, con su valor por defecto si no se han guardado. */
async function todos() {
  const g = await guardado();
  const out = {};
  viajes().forEach(v => {
    out[v.slug] = g[v.slug] || {
      publicado: false,
      entradas: v.slug === 'soccerid-tour-2027' ? DUMMY_TOUR.map(e => Object.assign({}, e)) : []
    };
  });
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
      publicado: d.publicado === true || d.publicado === 'true',
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
 * Lo que pinta la ficha pública: las entradas agrupadas por día
 * ([{ fecha, pasos: [...] }]), o null si no está publicado o está vacío.
 * Agrupa por días consecutivos con la misma fecha, en el orden capturado.
 */
async function publicado(slug) {
  const g = await guardado();
  const it = g[slug];
  if (!it || !it.publicado || !(it.entradas || []).length) return null;
  const dias = [];
  it.entradas.forEach(e => {
    const ultimo = dias[dias.length - 1];
    if (ultimo && ultimo.fecha === e.fecha) ultimo.pasos.push(e);
    else dias.push({ fecha: e.fecha, pasos: [e] });
  });
  return dias;
}

module.exports = { viajes, todos, guardar, publicado, KEY };
