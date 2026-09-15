/**
 * Recursos de una cuenta en modo demostración.
 *
 * Una cuenta recién invitada abre con su sección de Documentos vacía, que para
 * enseñar el panel es justo lo que no se quiere: se ve como si faltara algo.
 * En modo demo se le siembran unos documentos de ejemplo para que luzca como la
 * cuenta de alguien que ya lleva tiempo dentro.
 *
 * Van marcados con `is_demo` porque hay que poder quitarlos: al salir del modo
 * demostración la cuenta se queda con lo suyo y lo de mentira se va. Sin la
 * marca habría que adivinar cuál documento subió el admin y cuál sembramos, y
 * esa adivinanza se equivoca justo con el documento que importaba.
 */
const knex = require('../db/knex');

// El enlace apunta a la presentación del panel, que existe siempre: un
// documento de ejemplo con una URL inventada se ve bien hasta que alguien lo
// abre y se topa con un 404 durante la demostración.
const URL_EJEMPLO = '/panel/presentacion';

const DOCS_DEMO = [
  { name: 'Contrato de inversión · ejemplo', category: 'Legal' },
  { name: 'Estado de cuenta del trimestre · ejemplo', category: 'Financiero' },
  { name: 'Comprobante de transferencia · ejemplo', category: 'Evidencia' }
];

function hoyISO() {
  return new Date().toISOString().slice(0, 10);
}

// Siembra los recursos de demostración de una cuenta. Idempotente: si ya los
// tiene no los duplica, así que se puede llamar en cada arranque sin pensarlo.
async function sembrarRecursosDemo(userId) {
  if (!userId) return 0;
  const ya = await knex('user_documents').where({ user_id: userId, is_demo: true }).first();
  if (ya) return 0;
  const doc_date = hoyISO();
  await knex('user_documents').insert(DOCS_DEMO.map(d => ({
    user_id: userId, name: d.name, category: d.category,
    url: URL_EJEMPLO, meta: 'Documento de demostración', ext: null,
    doc_date, is_demo: true
  })));
  return DOCS_DEMO.length;
}

// Quita SOLO lo sembrado como demostración. Lo que el admin haya subido a esa
// cuenta se queda: es el caso de una cuenta que empezó como demo y se volvió
// real, donde ya conviven documentos de verdad con los de ejemplo.
async function limpiarRecursosDemo(userId) {
  if (!userId) return 0;
  return knex('user_documents').where({ user_id: userId, is_demo: true }).del();
}

async function contarRecursosDemo(userId) {
  if (!userId) return 0;
  const r = await knex('user_documents').where({ user_id: userId, is_demo: true }).count({ n: '*' }).first();
  return Number(r && r.n) || 0;
}

module.exports = { sembrarRecursosDemo, limpiarRecursosDemo, contarRecursosDemo, DOCS_DEMO };
