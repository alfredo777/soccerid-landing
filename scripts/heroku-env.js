#!/usr/bin/env node
/**
 * Pone en Heroku las variables que viven en los archivos `*.local.md` (gitignored),
 * para no copiarlas a mano y no equivocarse en el nombre.
 *
 *   node scripts/heroku-env.js              # muestra que haria, sin tocar nada
 *   node scripts/heroku-env.js --apply      # las setea (reinicia el dyno)
 *   node scripts/heroku-env.js --apply --google-on
 *
 * Por defecto el login de Google queda OCULTO (GOOGLE_LOGIN=0), aunque suba las
 * credenciales: la pantalla de consentimiento sigue en Testing y quien no sea test
 * user recibe un error. Con --google-on se enciende (ver docs/google-auth.md).
 *
 * Nunca imprime valores, solo nombres.
 */
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const APP = process.env.HEROKU_APP || 'soccerid-landing';
const ROOT = path.join(__dirname, '..');
const apply = process.argv.includes('--apply');
const googleOn = process.argv.includes('--google-on');

// Solo las variables que el codigo realmente lee. Si agregas una, ponla aqui.
const WANTED = {
  's3-keys.local.md': ['S3_BUCKET', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  'google-keys.local.md': ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_API_KEY']
};

// Las tablas son `| \`VAR\` | \`valor\` (comentario) |`: tomamos el primer
// fragmento entre backticks de cada celda.
function parse(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    console.log(`  ! falta ${file} — se omite`);
    return {};
  }
  const out = {};
  fs.readFileSync(full, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^\|\s*`([A-Z][A-Z0-9_]+)`\s*\|\s*`([^`]+)`/);
    if (m && WANTED[file].includes(m[1])) out[m[1]] = m[2];
  });
  return out;
}

const vars = {};
Object.keys(WANTED).forEach(f => Object.assign(vars, parse(f)));
vars.GOOGLE_LOGIN = googleOn ? '1' : '0';

const faltantes = Object.values(WANTED).flat().filter(k => !(k in vars));
const nombres = Object.keys(vars).sort();

console.log(`App: ${APP}`);
console.log(`Variables encontradas (${nombres.length}): ${nombres.join(', ')}`);
if (faltantes.length) console.log(`No encontradas: ${faltantes.join(', ')}`);
console.log(`Login de Google: ${googleOn ? 'VISIBLE (GOOGLE_LOGIN=1)' : 'oculto (GOOGLE_LOGIN=0)'}`);

if (!apply) {
  console.log('\nEnsayo. Agrega --apply para setearlas de verdad (reinicia el dyno).');
  process.exit(0);
}

const args = ['config:set', ...nombres.map(k => `${k}=${vars[k]}`), '--app', APP];
execFileSync('heroku', args, { stdio: 'inherit', shell: process.platform === 'win32' });
console.log('\nListo. Verifica con: heroku config --app ' + APP);
