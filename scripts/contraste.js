#!/usr/bin/env node
/**
 * Audita el contraste de TODO el texto visible del sitio y reporta lo que no
 * cumple WCAG AA. Existe para que los choques gráficos se encuentren aquí y no
 * en el teléfono de alguien.
 *
 *   node scripts/contraste.js                       # contra localhost:3000
 *   node scripts/contraste.js http://localhost:3477
 *   node scripts/contraste.js https://soccerid.co
 *
 * Umbrales WCAG AA: 4.5 para texto normal, 3.0 para texto grande (>=24px, o
 * >=18.7px si va en negrita). Salir con código 1 si hay fallos permite
 * engancharlo a un hook antes de desplegar.
 *
 * Limitación honesta: cuando el texto va sobre una imagen o un degradado no
 * hay un color de fondo que medir, así que se reporta aparte como "sin fondo
 * sólido" en vez de inventar un número. Esos hay que mirarlos a ojo.
 *
 * La regla que esto vigila está en docs/variables-del-proyecto.md, sección 1c.
 */
const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs');

const CHROME = process.env.CHROME_PATH || 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 9433;
const BASE = (process.argv[2] || 'http://localhost:3000').replace(/\/$/, '');
// El texto sobre fotografía no tiene contraste calculable. Con --imagenes se
// lista para revisarlo a ojo (o para ponerle un velo detrás).
const LISTAR_IMAGENES = process.argv.includes('--imagenes');
// WCAG AA (4.5 / 3.0) es el suelo LEGAL, no un objetivo de diseño. Texto gris
// pequeño sobre azul saturado pasa el 4.5 y aun así se lee mal: pasó en el
// panel de medios. El estándar de la casa es 7.0 para texto normal y 4.5 para
// texto grande (equivale a AAA). Con --aa se mide contra el mínimo legal.
const SOLO_AA = process.argv.includes('--aa');

// Excepciones ASUMIDAS: pares que no llegan al mínimo por una decisión de
// marca consciente. No se ocultan —se listan aparte, con el motivo— para que
// nadie las confunda con un descuido y para que se puedan revisar.
const EXCEPCIONES = [
  { color: '#FFFFFF', fondos: ['#25D366', '#1EBE5B'],
    motivo: 'botón canónico de WhatsApp: blanco sobre su verde, como lo pinta la propia marca' },
];
const esExcepcion = f => EXCEPCIONES.some(e =>
  e.color.toUpperCase() === f.color.toUpperCase() && e.fondos.some(b => b.toUpperCase() === f.fondo.toUpperCase()));

const PAGINAS = [
  '/es', '/en',
  '/es/socceridcup',
  '/es/socceridcup/2024',          // ficha de edición: faltaba y tenía fallos
  '/es/galeria/soccer-id-cup-2027',
  '/panel/login',
];

// Los paneles bento de la landing, que solo existen en el DOM al abrirlos.
const PANELES = ['quienes', 'soccer', 'vip', 'seguros', 'copa', 'fan', 'media', 'opiniones'];

const sleep = ms => new Promise(r => setTimeout(r, ms));

/**
 * Espera a que el DOM deje de cambiar, en vez de a un tiempo fijo.
 * Los paneles que traen datos (el de medios pinta sus tarjetas con una
 * petición) tardan más que cualquier constante que uno elija a ojo.
 */
async function esperarDomQuieto(ev, { maximo = 9000, quieto = 700 } = {}) {
  const t0 = Date.now();
  let anterior = -1, estableDesde = Date.now();
  while (Date.now() - t0 < maximo) {
    const tam = await ev('document.body.innerHTML.length');
    if (tam === anterior) {
      if (Date.now() - estableDesde >= quieto) return;
    } else {
      anterior = tam; estableDesde = Date.now();
    }
    await sleep(250);
  }
}

// Se ejecuta dentro de la página. Recorre cada nodo de texto visible, busca el
// primer ancestro con fondo opaco y calcula el contraste.
const SONDA = () => `(() => {
  const SOLO_AA = ${SOLO_AA};
  const lum = (r, g, b) => {
    const f = c => { c /= 255; return c <= 0.03928 ? c/12.92 : Math.pow((c+0.055)/1.055, 2.4); };
    return 0.2126*f(r) + 0.7152*f(g) + 0.0722*f(b);
  };
  const parse = s => {
    const m = String(s).match(/rgba?\\(([^)]+)\\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const mezclar = (frente, fondo) => ({
    r: frente.r*frente.a + fondo.r*(1-frente.a),
    g: frente.g*frente.a + fondo.g*(1-frente.a),
    b: frente.b*frente.a + fondo.b*(1-frente.a),
    a: 1
  });
  const hex = c => '#' + [c.r,c.g,c.b].map(v => Math.round(v).toString(16).padStart(2,'0')).join('').toUpperCase();

  // Un degradado NO es una imagen: sus paradas son colores conocidos y se
  // pueden medir una a una. Solo cuando hay un url() real nos quedamos sin
  // fondo que calcular.
  const paradasDeGradiente = bi => {
    if (!bi || bi === 'none' || bi.includes('url(')) return null;
    if (!bi.includes('gradient(')) return null;
    const cols = [...bi.matchAll(/rgba?\\(([^)]+)\\)/g)].map(m => {
      const p = m[1].split(',').map(x => parseFloat(x));
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    }).filter(c => c.a > 0.5);
    return cols.length ? cols : null;
  };

  // Fondo efectivo: apila las capas semitransparentes hasta dar con una opaca.
  const fondoDe = el => {
    const capas = [];
    let n = el;
    while (n && n !== document.documentElement) {
      const cs = getComputedStyle(n);
      if (cs.backgroundImage && cs.backgroundImage !== 'none') {
        const paradas = paradasDeGradiente(cs.backgroundImage);
        if (paradas) return { gradiente: paradas, capas };
        return { imagen: true };
      }
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { capas.push(c); if (c.a === 1) break; }
      n = n.parentElement;
    }
    let base = parse(getComputedStyle(document.documentElement).backgroundColor);
    if (!base || base.a === 0) base = { r:255, g:255, b:255, a:1 };
    let acc = base;
    for (let i = capas.length - 1; i >= 0; i--) acc = mezclar(capas[i], acc);
    return { color: acc };
  };

  const ruta = el => {
    const partes = [];
    let n = el;
    for (let i = 0; n && i < 3; i++, n = n.parentElement) {
      let s = n.tagName.toLowerCase();
      if (n.id) { partes.unshift(s + '#' + n.id); break; }
      const cls = (n.className && typeof n.className === 'string') ? n.className.trim().split(/\\s+/).slice(0,2) : [];
      if (cls.length) s += '.' + cls.join('.');
      partes.unshift(s);
    }
    return partes.join(' > ');
  };

  const fallos = [], sinFondo = [];
  const vistos = new Set();

  for (const el of document.querySelectorAll('body *')) {
    // Solo elementos que pintan texto propio.
    const texto = [...el.childNodes].filter(n => n.nodeType === 3).map(n => n.textContent.trim()).join(' ').trim();
    if (!texto) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none') continue;
    if (parseFloat(cs.opacity) < 0.1) continue;
    const caja = el.getBoundingClientRect();
    if (caja.width < 2 || caja.height < 2) continue;
    // El texto con degradado recortado no tiene color sólido que medir.
    if (cs.webkitTextFillColor === 'rgba(0, 0, 0, 0)' || cs.backgroundClip === 'text') continue;

    const col = parse(cs.color);
    if (!col || col.a === 0) continue;
    const f = fondoDe(el);

    const px = parseFloat(cs.fontSize);
    const negrita = parseInt(cs.fontWeight, 10) >= 700;
    const grande = px >= 24 || (px >= 18.66 && negrita);
    // Estándar de la casa: cuanto más pequeño el texto, más contraste se le
    // exige. Perseguir 7.0 en TODO deja la interfaz lavada en grises pálidos;
    // el problema real está en el texto chico, que es donde se perdía la
    // descripción de las tarjetas (12.8px). Por debajo de 16px pedimos 7.0;
    // de ahí para arriba basta con 4.5.
    const minimo = SOLO_AA ? (grande ? 3.0 : 4.5) : (px < 16 ? 7.0 : 4.5);

    if (f.imagen) {
      const k = 'img|' + hex(col) + '|' + ruta(el);
      if (!vistos.has(k)) { vistos.add(k); sinFondo.push({ color: hex(col), sel: ruta(el), texto: texto.slice(0,42) }); }
      continue;
    }

    // Sobre un degradado se mide contra cada parada y manda la peor: si el
    // texto se pierde en un extremo, se pierde.
    const fondos = f.gradiente
      ? f.gradiente.map(c => { let acc = c; for (let i = f.capas.length-1; i >= 0; i--) acc = mezclar(f.capas[i], acc); return acc; })
      : [f.color];

    let ratio = Infinity, peorFondo = fondos[0], frente = col;
    for (const bg of fondos) {
      const fr = col.a < 1 ? mezclar(col, bg) : col;
      const l1 = lum(fr.r, fr.g, fr.b), l2 = lum(bg.r, bg.g, bg.b);
      const r = (Math.max(l1,l2) + 0.05) / (Math.min(l1,l2) + 0.05);
      if (r < ratio) { ratio = r; peorFondo = bg; frente = fr; }
    }
    const f_color = peorFondo;

    if (ratio < minimo) {
      const k = hex(frente) + '|' + hex(f_color) + '|' + ruta(el);
      if (vistos.has(k)) continue;
      vistos.add(k);
      fallos.push({
        color: hex(frente), fondo: hex(f_color),
        ratio: Math.round(ratio*100)/100, minimo,
        px: Math.round(px), sel: ruta(el), texto: texto.slice(0,42)
      });
    }
  }
  fallos.sort((a,b) => a.ratio - b.ratio);
  return JSON.stringify({ fallos, sinFondo });
})()`;

(async () => {
  if (!fs.existsSync(CHROME)) {
    console.error(`No encuentro Chrome en ${CHROME}. Usa CHROME_PATH=... para indicarlo.`);
    process.exit(2);
  }
  const profile = path.join(os.tmpdir(), 'cdp-contraste-' + process.pid);
  const chrome = spawn(CHROME, ['--headless=new', '--remote-debugging-port=' + PORT,
    '--user-data-dir=' + profile, '--no-first-run', '--hide-scrollbars', 'about:blank'], { stdio: 'ignore' });
  const cerrar = () => { try { chrome.kill(); } catch (_) {} };
  process.on('exit', cerrar);

  for (let i = 0; i < 80; i++) {
    try { if ((await fetch(`http://127.0.0.1:${PORT}/json/version`)).ok) break; } catch (_) {}
    await sleep(250);
  }
  const target = await (await fetch(`http://127.0.0.1:${PORT}/json/new?about:blank`, { method: 'PUT' })).json();
  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.addEventListener('open', res); ws.addEventListener('error', rej); });

  let id = 0; const pend = new Map();
  ws.addEventListener('message', e => {
    const m = JSON.parse(e.data);
    if (m.id && pend.has(m.id)) { const q = pend.get(m.id); pend.delete(m.id); m.error ? q.reject(new Error(m.error.message)) : q.resolve(m.result); }
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const i = ++id; pend.set(i, { resolve, reject });
    ws.send(JSON.stringify({ id: i, method, params }));
    setTimeout(() => { if (pend.has(i)) { pend.delete(i); reject(new Error('timeout ' + method)); } }, 40000);
  });
  const ev = async x => {
    const r = await send('Runtime.evaluate', { expression: x, returnByValue: true });
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
    return r.result.value;
  };

  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 950, deviceScaleFactor: 1, mobile: false });

  console.log(`
Contraste — ${SOLO_AA ? 'mínimo legal AA (4.5 / 3.0)' : 'estándar de la casa (7.0 bajo 16px, 4.5 encima)'}`);
  console.log(`${BASE}
`);
  let totalFallos = 0, totalImagen = 0, totalAsumidos = 0;

  for (const ruta of PAGINAS) {
    await send('Page.navigate', { url: BASE + ruta });
    await sleep(2500);
    await esperarDomQuieto(ev);
    await ev('window.scrollTo(0, document.body.scrollHeight/3)');
    await esperarDomQuieto(ev);
    let r;
    try { r = JSON.parse(await ev(SONDA())); }
    catch (e) { console.log(`  ${ruta}  — no se pudo sondear: ${e.message}`); continue; }

    const asumidos = r.fallos.filter(esExcepcion);
    r.fallos = r.fallos.filter(f => !esExcepcion(f));
    totalAsumidos += asumidos.length;
    totalFallos += r.fallos.length; totalImagen += r.sinFondo.length;
    const marca = r.fallos.length ? `${r.fallos.length} fallo(s)` : 'sin fallos';
    console.log(`${ruta}  —  ${marca}${r.sinFondo.length ? `, ${r.sinFondo.length} sobre imagen/degradado` : ''}`);
    for (const f of r.fallos) {
      console.log(`   ${String(f.ratio).padStart(5)} (min ${f.minimo})  ${f.color} sobre ${f.fondo}  ${f.px}px`);
      console.log(`          ${f.sel}`);
      console.log(`          "${f.texto}"`);
    }

    // Los paneles bento viven ocultos hasta que se tocan, así que la pasada
    // normal no los ve. Aquí se abren uno a uno: es justo donde aparecieron
    // los choques que motivaron este script.
    if (ruta === '/es' && await ev('typeof openPanel === "function"')) {
      for (const panel of PANELES) {
        await ev(`openPanel(${JSON.stringify(panel)})`);
        // Esperar a que el DOM se calme, no un tiempo fijo. El panel de medios
        // pinta sus tarjetas de forma asíncrona: con 900ms fijos se auditaba un
        // panel vacío y salía "sin fallos" mintiendo.
        await esperarDomQuieto(ev);
        let rp;
        try { rp = JSON.parse(await ev(SONDA())); } catch (_) { continue; }
        await ev('typeof closePanel === "function" && closePanel()');
        await sleep(400);
        // Mismo filtro de excepciones que en el barrido de página: el botón de
        // WhatsApp vive en la sección de contacto y reaparece detrás de cada panel.
        const asumidosPanel = rp.fallos.filter(esExcepcion);
        rp.fallos = rp.fallos.filter(f => !esExcepcion(f));
        totalAsumidos += asumidosPanel.length;
        if (!rp.fallos.length) continue;
        totalFallos += rp.fallos.length;
        console.log(`   panel "${panel}"  —  ${rp.fallos.length} fallo(s)`);
        for (const f of rp.fallos) {
          console.log(`      ${String(f.ratio).padStart(5)} (min ${f.minimo})  ${f.color} sobre ${f.fondo}  ${f.px}px`);
          console.log(`             ${f.sel}`);
          console.log(`             "${f.texto}"`);
        }
      }
    }
    for (const a of asumidos) {
      console.log(`   (asumido) ${a.ratio}  ${a.color} sobre ${a.fondo}  —  ${EXCEPCIONES.find(e => e.fondos.some(b => b.toUpperCase() === a.fondo.toUpperCase())).motivo}`);
    }
    if (LISTAR_IMAGENES && r.sinFondo.length) {
      console.log('   sobre imagen (revisar a ojo):');
      for (const f of r.sinFondo) console.log(`      ${f.color}  ${f.sel}  "${f.texto}"`);
    }
    console.log('');
  }

  const cola = `(+${totalImagen} sobre imagen, revisar a ojo${totalAsumidos ? `; ${totalAsumidos} excepción(es) de marca asumida(s)` : ''})`;
  console.log(totalFallos
    ? `TOTAL: ${totalFallos} fallo(s) de contraste ${cola}`
    : `Sin fallos de contraste ${cola}`);

  cerrar();
  process.exit(totalFallos ? 1 : 0);
})().catch(e => { console.error('Falló:', e.message); process.exit(2); });
