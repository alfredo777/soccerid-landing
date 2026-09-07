#!/usr/bin/env node
/**
 * Pone en Heroku las variables que viven en los archivos `*.local.md` (gitignored),
 * para no copiarlas a mano y no equivocarse en el nombre.
 *
 *   node scripts/heroku-env.js              # muestra que haria, sin tocar nada
 *   node scripts/heroku-env.js --apply      # las setea (reinicia el dyno)
 *   node scripts/heroku-env.js --apply --google-on      # muestra el login de Google
 *   node scripts/heroku-env.js --apply --calendar-on    # enciende Google Calendar
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
// Google Calendar tiene su propio interruptor, aparte del login: usa el scope
// `calendar.events` que Google marca como sensible y exige verificacion de marca
// antes de publicar. Por eso el DEFAULT es APAGADO (GOOGLE_CALENDAR=0); se
// enciende explicitamente con --calendar-on cuando Google apruebe la marca.
const calendarOn = process.argv.includes('--calendar-on');

// Solo las variables que el codigo realmente lee. Si agregas una, ponla aqui.
const WANTED = {
  's3-keys.local.md': ['S3_BUCKET', 'AWS_REGION', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  'google-keys.local.md': ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET', 'GOOGLE_API_KEY'],
  'anthropic-key.local.md': ['ANTHROPIC_API_KEY'],
  'turnstile-keys.local.md': ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY']
};

// Turnstile se puede APAGAR para probar en produccion sin el CAPTCHA:
//   node scripts/heroku-env.js --turnstile-off   # quita las 2 vars (login sin captcha)
// y REACTIVAR despues:
//   node scripts/heroku-env.js --apply           # las repone (incluye Turnstile)
const turnstileOff = process.argv.includes('--turnstile-off');

// La `VAR` y su `valor` van entre backticks; el nombre puede estar en cualquier
// celda (unos archivos usan `| \`VAR\` | \`valor\` |`, otros meten una columna de
// descripcion antes). Se busca el primer backtick-cell que sea un NOMBRE_MAYUS y
// el siguiente como valor.
function parse(file) {
  const full = path.join(ROOT, file);
  if (!fs.existsSync(full)) {
    console.log(`  ! falta ${file} — se omite`);
    return {};
  }
  const out = {};
  fs.readFileSync(full, 'utf8').split('\n').forEach(line => {
    const m = line.match(/`([A-Z][A-Z0-9_]+)`\s*\|\s*`([^`]+)`/);
    if (m && WANTED[file].includes(m[1])) out[m[1]] = m[2];
  });
  return out;
}

// ── Apagar Turnstile (para probar en produccion sin CAPTCHA) ──
// Quita SITE_KEY y SECRET_KEY: sin SECRET el server omite la verificacion, sin
// SITE el widget no aparece. El login queda abierto. Reactivar con --apply.
if (turnstileOff) {
  const keys = ['TURNSTILE_SITE_KEY', 'TURNSTILE_SECRET_KEY'];
  console.log(`App: ${APP}`);
  console.log(`Apagando Turnstile: se quitan ${keys.join(', ')}`);
  if (!apply) {
    console.log('\nEnsayo. Agrega --apply para quitarlas de verdad (reinicia el dyno).');
    process.exit(0);
  }
  execFileSync('heroku', ['config:unset', ...keys, '--app', APP], { stdio: 'inherit', shell: process.platform === 'win32' });
  console.log('\nTurnstile APAGADO. El login ya no pide CAPTCHA.');
  console.log('Cuando termines de probar, reactivalo con: node scripts/heroku-env.js --apply');
  process.exit(0);
}

const vars = {};
Object.keys(WANTED).forEach(f => Object.assign(vars, parse(f)));
vars.GOOGLE_LOGIN = googleOn ? '1' : '0';
vars.GOOGLE_CALENDAR = calendarOn ? '1' : '0';

const faltantes = Object.values(WANTED).flat().filter(k => !(k in vars));
const nombres = Object.keys(vars).sort();

console.log(`App: ${APP}`);
console.log(`Variables encontradas (${nombres.length}): ${nombres.join(', ')}`);
if (faltantes.length) console.log(`No encontradas: ${faltantes.join(', ')}`);
console.log(`Login de Google: ${googleOn ? 'VISIBLE (GOOGLE_LOGIN=1)' : 'oculto (GOOGLE_LOGIN=0)'}`);
console.log(`Google Calendar: ${calendarOn ? 'ACTIVO (GOOGLE_CALENDAR=1)' : 'APAGADO (GOOGLE_CALENDAR=0) — requiere verificacion de marca'}`);
console.log(`Turnstile: ${vars.TURNSTILE_SECRET_KEY ? 'ACTIVO (CAPTCHA en login)' : 'no encontrado en los .local.md'}`);

if (!apply) {
  console.log('\nEnsayo. Agrega --apply para setearlas de verdad (reinicia el dyno).');
  process.exit(0);
}

const args = ['config:set', ...nombres.map(k => `${k}=${vars[k]}`), '--app', APP];
execFileSync('heroku', args, { stdio: 'inherit', shell: process.platform === 'win32' });
console.log('\nListo. Verifica con: heroku config --app ' + APP);
