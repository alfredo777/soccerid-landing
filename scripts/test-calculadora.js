/**
 * Prueba de la calculadora de utilidades de /es/socceridcup2027
 *
 * Abre el modal en Chrome headless y verifica los numeros contra los
 * valores esperados. Sale con codigo 1 si alguno no cuadra.
 *
 *   node scripts/test-calculadora.js                    (contra localhost:3000)
 *   node scripts/test-calculadora.js https://soccerid.co
 *
 * No necesita dependencias: usa el protocolo de DevTools por WebSocket,
 * que ya viene en Node 22+.
 */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9241;
const BASE = process.argv[2] || 'http://localhost:3000';
const URL = BASE.replace(/\/$/, '') + '/es/socceridcup2027';

const sleep = ms => new Promise(r => setTimeout(r, ms));
const profile = path.join(os.tmpdir(), 'cdp-calc-' + process.pid);
let fallos = 0;

function check(nombre, real, esperado) {
  const ok = String(real) === String(esperado);
  if (!ok) fallos++;
  console.log(`  ${ok ? 'OK ' : 'FALLA'}  ${nombre}: ${real}${ok ? '' : `  (esperado ${esperado})`}`);
}

(async () => {
  if (!fs.existsSync(CHROME)) {
    console.error('No encuentro Chrome en ' + CHROME + '. Usa CHROME_PATH=... para indicar la ruta.');
    process.exit(1);
  }

  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile, '--no-first-run', '--no-default-browser-check',
    '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });

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
    setTimeout(() => { if (pendientes.has(i)) { pendientes.delete(i); reject(new Error('timeout ' + method)); } }, 40000);
  });
  const ev = async expr => {
    const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
    if (r.exceptionDetails) throw new Error('JS: ' + (r.exceptionDetails.exception?.description || r.exceptionDetails.text));
    return r.result.value;
  };

  await send('Page.enable');
  await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false });

  // La propuesta esta detras del candado: se desbloquea marcando la sesion.
  await send('Page.navigate', { url: URL });
  await sleep(2000);
  await ev(`sessionStorage.setItem('pp2027','granted')`);
  await send('Page.navigate', { url: URL });
  await sleep(BASE.includes('localhost') ? 3000 : 6000);

  // Devuelve el resultado como objeto { etiqueta: valor }.
  // Incluye tanto los renglones como la tira compacta de pasos intermedios.
  const resultado = () => ev(`Object.fromEntries([]
    .concat([...document.querySelectorAll('#ppCalcResult .pp-calc__row')]
      .map(r => [r.querySelector('span').textContent, r.querySelector('strong').textContent]))
    .concat([...document.querySelectorAll('#ppCalcResult .pp-calc__math > div')]
      .map(d => [d.querySelector('span').textContent, d.querySelector('b').textContent])))`);
  const aviso = () => ev(`(document.querySelector('#ppCalcResult .pp-calc__warn')||{}).textContent || ''`);
  const tipo = t => ev(`document.querySelector('#ppCalcType button[data-val=${t}]').click()`);
  const moneda = m => ev(`document.querySelector('#ppCalcCurrency button[data-val=${m}]').click()`);
  const monto = n => ev(`(() => { const i = document.getElementById('ppCalcAmount');
    i.value = '${n}'; i.dispatchEvent(new Event('input', {bubbles:true})); i.dispatchEvent(new Event('blur')); })()`);
  const asistencia = n => ev(`(() => { const s = document.getElementById('ppCalcAtt');
    s.value = ${n}; s.dispatchEvent(new Event('input', {bubbles:true})); })()`);

  await ev(`document.getElementById('ppCalcOpen').click()`);
  await sleep(300);
  check('el modal abre', await ev(`!document.getElementById('ppCalc').hidden`), 'true');

  console.log('\nRETORNO FIJO · USD 100,000');
  await moneda('usd'); await tipo('fixed'); await monto(100000); await sleep(150);
  let r = await resultado();
  check('Tu inversion', r['Tu inversión'], 'USD $100,000');
  check('Utilidad maxima', r['Utilidad máxima (25%)'], 'USD $25,000');
  check('Rendimiento', r['Rendimiento'], '25%');
  check('Capital + retorno', r['Capital + retorno'], 'USD $125,000');

  console.log('\nRIESGO · USD 100,000 · 15,000 asistentes (el caso de la tarjeta)');
  await tipo('risk'); await asistencia(15000); await sleep(150);
  r = await resultado();
  check('Participacion', r['Tu participación en el proyecto'], '10%');
  check('Taquilla', r['Ingreso de taquilla'], 'USD $1,500,000');
  check('Utilidad del proyecto', r['Utilidad del proyecto'], 'USD $500,000');
  check('Tu utilidad', r['Tu utilidad'], 'USD $50,000');
  check('Rendimiento', r['Rendimiento'], '50%');
  check('Capital + utilidad', r['Capital + utilidad'], 'USD $150,000');
  check('sin aviso de perdida', (await aviso()) === '', 'true');

  console.log('\nRIESGO · USD 100,000 · estadio lleno (21,800)');
  await asistencia(21800); await sleep(150);
  r = await resultado();
  check('Taquilla', r['Ingreso de taquilla'], 'USD $2,180,000');
  check('Tu utilidad', r['Tu utilidad'], 'USD $118,000');
  check('Capital + utilidad', r['Capital + utilidad'], 'USD $218,000');
  check('etiqueta de lleno', await ev(`document.getElementById('ppCalcOcc').textContent`), 'estadio lleno');

  console.log('\nRIESGO · USD 100,000 · 5,000 asistentes (bajo punto de equilibrio)');
  await asistencia(5000); await sleep(150);
  r = await resultado();
  check('Utilidad del proyecto', r['Utilidad del proyecto'], '-USD $500,000');
  check('Tu utilidad', r['Tu utilidad'], '-USD $50,000');
  check('Rendimiento', r['Rendimiento'], '-50%');
  check('Capital + utilidad', r['Capital + utilidad'], 'USD $50,000');
  check('avisa del punto de equilibrio', (await aviso()).includes('10,000'), 'true');
  check('la perdida se marca en rojo',
    await ev(`!!document.querySelector('#ppCalcResult .pp-calc__row--neg')`), 'true');

  console.log('\nCAMBIO A PESOS · debe conservar el 10% del proyecto');
  await moneda('mxn'); await asistencia(15000); await sleep(150);
  check('monto convertido', await ev(`document.getElementById('ppCalcAmount').value`), '1,800,000');
  r = await resultado();
  check('Participacion', r['Tu participación en el proyecto'], '10%');
  check('Taquilla', r['Ingreso de taquilla'], 'MXN $27,000,000');
  check('Tu utilidad', r['Tu utilidad'], 'MXN $900,000');
  check('Rendimiento', r['Rendimiento'], '50%');

  console.log('\nLIMITES');
  await ev(`(() => { const i = document.getElementById('ppCalcAmount');
    i.value = '999'; i.dispatchEvent(new Event('input', {bubbles:true})); })()`);
  await sleep(150);
  check('marca error bajo el minimo',
    await ev(`document.getElementById('ppCalcErr').classList.contains('is-visible')`), 'true');
  await monto(99000000); await sleep(150);
  check('recorta al maximo', await ev(`document.getElementById('ppCalcAmount').value`), '18,000,000');
  await moneda('usd'); await monto(1); await sleep(150);
  check('sube al minimo en USD', await ev(`document.getElementById('ppCalcAmount').value`), '30,000');

  console.log('\nCERRAR');
  await ev(`document.querySelector('.pp-calc__x').click()`);
  await sleep(200);
  check('el modal cierra', await ev(`document.getElementById('ppCalc').hidden`), 'true');
  check('devuelve el scroll al body', await ev(`document.body.style.overflow === ''`), 'true');

  check('sin errores de JS', erroresJS.length === 0 ? 'true' : erroresJS.join(' | '), 'true');

  console.log(fallos === 0 ? '\nTodo correcto.' : `\n${fallos} verificacion(es) fallaron.`);
  ws.close();
  cerrar();
  process.exit(fallos === 0 ? 0 : 1);
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
