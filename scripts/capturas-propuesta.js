#!/usr/bin/env node
/**
 * Capturas de la propuesta, que vive detrás del candado de código.
 *
 *   node scripts/capturas-propuesta.js [base] [variante]
 *
 * Se entra firmando la cookie de acceso con el mismo secreto que usa el
 * servidor, en vez de teclear un código: así la captura no deja un lead ni
 * dispara correos.
 */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');
const jwt = require('jsonwebtoken');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9411;
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
// La variante por defecto es la que está en vivo, y su dirección sale del
// registro: así el script no se queda apuntando a la propuesta de ayer.
const propuestas = require('../lib/propuestas');
const VARIANTE = process.argv[3] || propuestas.DEFAULT_ID;
const variante = propuestas.porId(VARIANTE);
if (!variante) { console.error('No conozco la propuesta "' + VARIANTE + '"'); process.exit(1); }
const RUTA = '/es/' + variante.slug;
const OUT = path.join(__dirname, '..', 'capturas', 'propuesta');

const ESCRITORIO = { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false };
const MOVIL = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };
const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync(CHROME)) { console.error('No encuentro Chrome en ' + CHROME); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });

  const perfil = path.join(os.tmpdir(), 'cdp-propuesta-' + process.pid);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + perfil, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  process.on('exit', () => { try { chrome.kill(); } catch (_) {} });

  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch (_) {}
    await sleep(250);
  }
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  let id = 0;
  const pendientes = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pendientes.has(m.id)) {
      const p = pendientes.get(m.id); pendientes.delete(m.id);
      m.error ? p.reject(new Error(m.error.message)) : p.resolve(m.result);
    }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id; pendientes.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { if (pendientes.has(i)) { pendientes.delete(i); reject(new Error('timeout ' + method)); } }, 45000);
  });
  const ev = async expr => (await send('Runtime.evaluate',
    { expression: expr, returnByValue: true, awaitPromise: true })).result.value;

  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');

  const secreto = process.env.PANEL_JWT_SECRET || process.env.SESSION_SECRET || 'panel-dev-secret-change-me';
  // Una sola cookie para todo el acceso, con el nivel dentro: se firma con
  // nivel de tour para que la captura pueda abrir cualquier página.
  const token = jwt.sign({ n: 'tour', v: propuestas.listar().map(v => v.id) }, secreto, { expiresIn: '1h' });
  const host = new URL(BASE).hostname;
  await send('Network.setCookie', { name: 'pp_acc', value: token, domain: host, path: '/' });

  async function captura(nombre, { url, metrics = MOVIL, espera = 3000, scroll = null, antes = null }) {
    await send('Emulation.setDeviceMetricsOverride', metrics);
    if (url) { await send('Page.navigate', { url }); await sleep(espera); }
    if (antes) { await ev(antes); await sleep(1200); }
    if (scroll !== null) { await ev(`window.scrollTo(0, ${scroll})`); await sleep(1100); }
    const r = await send('Page.captureScreenshot', { format: 'png' });
    const destino = path.join(OUT, nombre + '.png');
    fs.writeFileSync(destino, Buffer.from(r.data, 'base64'));
    console.log(`  OK ${nombre}.png  (${(fs.statSync(destino).size / 1024).toFixed(0)} KB)`);
  }

  console.log(`\nCapturando ${BASE}${RUTA} -> ${OUT}\n`);

  // Movil: el recorrido completo de la propuesta
  await captura('01-movil-hero', { url: BASE + RUTA, espera: 4500, scroll: 0 });
  const alto = await ev('document.body.scrollHeight');
  for (let i = 1; i <= 7; i++) {
    await captura(`02-movil-recorrido-${i}`, { scroll: Math.round(alto * i / 8) });
  }

  // Escritorio: hero, la tarjeta de "por que este partido" abierta y la calculadora
  await captura('03-escritorio-hero', { url: BASE + RUTA, metrics: ESCRITORIO, espera: 4500, scroll: 0 });
  await captura('04-escritorio-por-que-este-partido', {
    metrics: ESCRITORIO,
    antes: "document.querySelector('.pp-why-btn') && document.querySelector('.pp-why-btn').click()",
    scroll: null
  });
  await captura('05-escritorio-calculadora', {
    metrics: ESCRITORIO,
    antes: "document.querySelector('.pp-calc-open') && document.querySelector('.pp-calc-open').click()"
  });

  console.log('\nListo.\n');
  process.exit(0);
})();
