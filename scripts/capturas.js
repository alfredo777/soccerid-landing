#!/usr/bin/env node
/**
 * Capturas de la landing y del panel, para revisar un cambio visual antes de
 * desplegarlo. Usa Chrome headless por CDP: no instala nada.
 *
 *   node scripts/capturas.js                      # contra http://localhost:3000
 *   node scripts/capturas.js http://localhost:3477
 *   node scripts/capturas.js <base> <carpeta>     # destino de los PNG
 *
 * El login del panel necesita el CAPTCHA apagado (sin TURNSTILE_SITE_KEY),
 * que es lo normal en local. Ver docs/variables-del-proyecto.md.
 */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9315;
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
const OUT = process.argv[3] || path.join(__dirname, '..', 'capturas');

const ADMIN = { email: process.env.ADMIN_EMAIL || 'admin@soccerid.co',
                pass: process.env.ADMIN_PASSWORD || 'socceridcup2027' };
const INVER = { email: 'demo.fijo@soccerid.co', pass: process.env.DEMO_PASSWORD || 'demo1234' };

const ESCRITORIO = { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false };
const MOVIL = { width: 390, height: 844, deviceScaleFactor: 2, mobile: true };

const sleep = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  if (!fs.existsSync(CHROME)) {
    console.error(`No encuentro Chrome en ${CHROME}. Usa CHROME_PATH=... para indicarlo.`);
    process.exit(1);
  }
  fs.mkdirSync(OUT, { recursive: true });

  const profile = path.join(os.tmpdir(), 'cdp-capturas-' + process.pid);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', '--force-device-scale-factor=1', 'about:blank'], { stdio: 'ignore' });
  const cerrar = () => { try { chrome.kill(); } catch (_) {} };
  process.on('exit', cerrar);

  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch (_) {}
    await sleep(250);
  }

  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  let id = 0;
  const pendientes = new Map();
  const erroresJS = [];
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.method === 'Runtime.exceptionThrown') {
      erroresJS.push(m.params.exceptionDetails.exception?.description || m.params.exceptionDetails.text);
    }
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
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
    if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };

  await send('Page.enable');
  await send('Network.enable');
  await send('Runtime.enable');

  async function captura(nombre, { url, metrics = ESCRITORIO, espera = 2600, scroll = 0, completa = false }) {
    await send('Emulation.setDeviceMetricsOverride', metrics);
    if (url) { await send('Page.navigate', { url }); await sleep(espera); }
    if (scroll) { await ev(`window.scrollTo(0, ${scroll})`); await sleep(900); }
    const r = await send('Page.captureScreenshot', {
      format: 'png', captureBeyondViewport: completa,
      ...(completa ? { clip: await clipCompleto(metrics) } : {})
    });
    const destino = path.join(OUT, nombre + '.png');
    fs.writeFileSync(destino, Buffer.from(r.data, 'base64'));
    const kb = (fs.statSync(destino).size / 1024).toFixed(0);
    console.log(`  ✓ ${nombre}.png  (${kb} KB)`);
  }

  async function clipCompleto(metrics) {
    const h = await ev('Math.min(document.body.scrollHeight, 6000)');
    return { x: 0, y: 0, width: metrics.width, height: h, scale: 1 };
  }

  async function login(email, pass) {
    await send('Emulation.setDeviceMetricsOverride', ESCRITORIO);
    // Sin esto, la sesión anterior sigue viva y /panel/login redirige al panel
    // en vez de mostrar el formulario.
    await send('Network.clearBrowserCookies');
    await send('Page.navigate', { url: BASE + '/panel/login' });
    await sleep(2200);
    await ev(`(() => {
      const f = document.querySelector('form');
      f.querySelector('[name=email]').value = ${JSON.stringify(email)};
      f.querySelector('[name=password]').value = ${JSON.stringify(pass)};
      f.submit();
    })()`);
    await sleep(3200);
    return await ev('location.pathname');
  }

  console.log(`\nCapturando ${BASE} → ${OUT}\n`);

  console.log('Landing pública');
  await captura('01-landing-hero-escritorio', { url: BASE + '/es', espera: 4200 });
  await captura('02-landing-paneles', { scroll: 1400 });
  await captura('03-landing-eventos', { scroll: 3000 });
  await captura('04-landing-contacto-pie', { scroll: 99999 });
  // Recorrido por toda la página: con tres posiciones se perdían secciones
  // enteras. (Una captura de página completa expira: la landing es muy alta.)
  const alto = await ev('document.body.scrollHeight');
  for (let i = 1; i <= 6; i++) {
    await captura(`04b-landing-recorrido-${i}`, { scroll: Math.round(alto * i / 7) });
  }
  await captura('05-landing-hero-movil', { url: BASE + '/es', metrics: MOVIL, espera: 4200 });
  await captura('06-landing-movil-scroll', { metrics: MOVIL, scroll: 1500 });

  // Estas páginas llevan el isotipo BLANCO: si alguna tuviera fondo claro, el
  // logo desaparecería. Se capturan para verlo.
  console.log('Páginas con logo blanco');
  await captura('06b-socceridcup', { url: BASE + '/es/socceridcup', espera: 3400 });
  await captura('06c-galeria', { url: BASE + '/es/galeria/soccer-id-cup-2027', espera: 3400 });

  console.log('Panel');
  await captura('07-panel-login', { url: BASE + '/panel/login', espera: 2400 });

  const destinoInv = await login(INVER.email, INVER.pass);
  if (destinoInv.startsWith('/panel') && !destinoInv.includes('login')) {
    await captura('08-panel-inversionista', { espera: 500 });
    await captura('09-panel-inversionista-scroll', { scroll: 1200 });
  } else {
    console.log(`  ! login de inversionista no entró (quedó en ${destinoInv})`);
  }

  const destinoAdmin = await login(ADMIN.email, ADMIN.pass);
  if (destinoAdmin.startsWith('/panel') && !destinoAdmin.includes('login')) {
    await send('Page.navigate', { url: BASE + '/panel/admin' });
    await sleep(3000);
    await captura('10-admin', { espera: 400 });
    await captura('11-admin-scroll', { scroll: 1100 });
  } else {
    console.log(`  ! login de admin no entró (quedó en ${destinoAdmin})`);
  }

  if (erroresJS.length) {
    console.log(`\n⚠ ${erroresJS.length} error(es) de JS durante las capturas:`);
    [...new Set(erroresJS)].slice(0, 8).forEach(e => console.log('   ' + String(e).split('\n')[0]));
  } else {
    console.log('\n✓ Sin errores de JS');
  }

  cerrar();
  process.exit(0);
})().catch(e => { console.error('Falló:', e.message); process.exit(1); });
