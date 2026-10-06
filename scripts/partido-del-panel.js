#!/usr/bin/env node
/**
 * Pone al día el nombre del partido de 2027 en el contenido del panel.
 *
 *   node scripts/partido-del-panel.js            # en seco: solo dice qué cambiaría
 *   node scripts/partido-del-panel.js --aplicar  # escribe
 *
 * Por qué un script y no una edición a mano: ese nombre quedó escrito en
 * noticias, FAQ, agenda del partido, capital y la ficha de la edición, y ese
 * contenido vive en la base de datos (en Heroku los JSON no sobreviven al
 * despliegue), así que corregir el sembrado no arregla lo que ya está guardado.
 *
 * Es idempotente: busca textos exactos del partido anterior, así que la segunda
 * corrida no encuentra nada. No toca las menciones de Tigres de la edición 2025
 * (Austin), que son ciertas y se quedan: solo se reemplaza lo que nombra el
 * partido de 2027.
 *
 * Para producción: heroku run node scripts/partido-del-panel.js --app soccerid-landing
 * (y luego con --aplicar).
 */
const knex = require('../db/knex');

const APLICAR = process.argv.includes('--aplicar');

// Texto exacto de antes → texto de ahora. Nada de expresiones regulares: lo
// que no esté en esta lista no se toca.
const CAMBIOS = [
  ['Tigres vs Cruz Azul', 'Cruz Azul vs Pumas'],
  ['Tigres y Cruz Azul', 'Cruz Azul y Pumas'],
  ['Tigres vs. Cruz Azul', 'Cruz Azul vs. Pumas'],
  // El apodo del partido anterior (regio = Tigres) ya no describe a estos clubes.
  ['El clásico regio-cementero se jugará', 'Cruz Azul y Pumas se verán'],
  ['The Monterrey-Cruz Azul clash will be played', 'Cruz Azul and Pumas will meet'],
  // Antecedentes de convocatoria: los de los clubes que ahora juegan, con las
  // cifras de la propuesta en vivo (Cruz Azul en Los Ángeles, Pumas en Seattle).
  ['Tigres 21,792 en Houston 2025; Cruz Azul 25,405 en LA 2024',
   'Cruz Azul 25,405 en Los Ángeles 2024; Pumas 68,741 en Seattle 2022'],
  ['Tigres 21,792 in Houston 2025; Cruz Azul 25,405 in LA 2024',
   'Cruz Azul 25,405 in Los Angeles 2024; Pumas 68,741 in Seattle 2022']
];

function convertir(valor) {
  let out = valor;
  for (const [de, a] of CAMBIOS) out = out.split(de).join(a);
  return out;
}

/** Columnas de texto de una tabla (las únicas donde puede estar el nombre). */
async function columnasDeTexto(tabla) {
  const info = await knex(tabla).columnInfo();
  return Object.keys(info).filter(c => /char|text|string/i.test(info[c].type || ''));
}

async function tablas() {
  if (knex.client.config.client === 'pg') {
    const r = await knex('information_schema.tables')
      .where({ table_schema: 'public', table_type: 'BASE TABLE' }).select('table_name');
    return r.map(x => x.table_name);
  }
  const r = await knex('sqlite_master').where({ type: 'table' }).select('name');
  return r.map(x => x.name).filter(n => !n.startsWith('sqlite_'));
}

(async () => {
  let tocados = 0;
  for (const tabla of await tablas()) {
    let cols;
    try { cols = await columnasDeTexto(tabla); } catch (_) { continue; }
    if (!cols.length) continue;
    let filas;
    try { filas = await knex(tabla).select('*'); } catch (_) { continue; }
    for (const fila of filas) {
      const patch = {};
      for (const col of cols) {
        const v = fila[col];
        if (typeof v !== 'string' || !v) continue;
        const nuevo = convertir(v);
        if (nuevo !== v) patch[col] = nuevo;
      }
      if (!Object.keys(patch).length) continue;
      if (fila.id == null) {
        console.log(`  ! ${tabla}: fila sin id, se omite (${Object.keys(patch).join(', ')})`);
        continue;
      }
      tocados++;
      for (const col of Object.keys(patch)) {
        console.log(`  · ${tabla}.${col} (id ${fila.id})`);
        console.log(`      antes: ${fila[col].replace(/\s+/g, ' ').slice(0, 120)}`);
        console.log(`      ahora: ${patch[col].replace(/\s+/g, ' ').slice(0, 120)}`);
      }
      if (APLICAR) await knex(tabla).where({ id: fila.id }).update(patch);
    }
  }
  console.log(tocados
    ? `\n${APLICAR ? 'Actualizadas' : 'Por actualizar'}: ${tocados} filas.${APLICAR ? '' : ' Vuelve a correrlo con --aplicar para escribir.'}`
    : '\nNada que cambiar: el panel ya nombra el partido en vivo.');
  process.exit(0);
})().catch(e => { console.error('Falló:', e.message); process.exit(1); });
