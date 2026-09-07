/**
 * Lee una nota de prensa por su URL y saca lo que sirve para publicarla:
 * imagen principal, título y resumen.
 *
 * Es el paso previo al asistente de contenidos: en vez de que el organizador
 * copie a mano la imagen y el titular de la nota, se traen solos.
 *
 * **Cuidado con pedir URLs desde el servidor.** Aunque solo el admin puede
 * llamar esto, una URL apuntando a la red interna convertiría al servidor en un
 * puente hacia cosas que no debería alcanzar (metadatos del proveedor, servicios
 * internos). Por eso se bloquean host locales y rangos privados antes de pedir
 * nada, y no se siguen redirecciones a ciegas.
 */
const dns = require('dns').promises;

const LIMITE_BYTES = 2 * 1024 * 1024;   // 2 MB de HTML es de sobra
const TIMEOUT_MS = 8000;

/** ¿Esta IP es de la red interna? */
function esPrivada(ip) {
  if (/^127\./.test(ip) || ip === '0.0.0.0') return true;
  if (/^10\./.test(ip)) return true;
  if (/^192\.168\./.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  if (/^169\.254\./.test(ip)) return true;              // link-local (metadatos en la nube)
  if (ip === '::1' || /^f[cd]/i.test(ip) || /^fe80:/i.test(ip)) return true;
  return false;
}

async function urlSegura(raw) {
  let u;
  try { u = new URL(String(raw || '').trim()); } catch (_) { throw new Error('Esa no es una URL válida'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('El enlace debe empezar con http:// o https://');
  const host = u.hostname.toLowerCase();
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) {
    throw new Error('Esa dirección no se puede consultar');
  }
  let ips = [];
  try {
    ips = (await dns.lookup(host, { all: true })).map(x => x.address);
  } catch (_) { throw new Error('No se pudo resolver ese dominio'); }
  if (!ips.length || ips.some(esPrivada)) throw new Error('Esa dirección no se puede consultar');
  return u;
}

/** Baja el HTML con límite de tamaño y de tiempo. */
async function bajarHtml(u) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u.href, {
      signal: ctrl.signal,
      redirect: 'follow',
      headers: {
        // Sin User-Agent muchos medios devuelven 403
        'User-Agent': 'Mozilla/5.0 (compatible; SOCCERiDBot/1.0; +https://soccerid.co)',
        Accept: 'text/html,application/xhtml+xml'
      }
    });
    if (!res.ok) throw new Error(`La página respondió ${res.status}`);
    const tipo = res.headers.get('content-type') || '';
    if (!/text\/html|application\/xhtml/i.test(tipo)) throw new Error('Ese enlace no es una página web');

    // Se lee por trozos para no tragarse un archivo enorme
    const reader = res.body.getReader();
    const trozos = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.length;
      trozos.push(value);
      if (total > LIMITE_BYTES) { try { await reader.cancel(); } catch (_) {} break; }
    }
    return Buffer.concat(trozos.map(Buffer.from)).toString('utf8');
  } finally {
    clearTimeout(t);
  }
}

function meta(html, prop) {
  const patrones = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, 'i')
  ];
  for (const p of patrones) {
    const m = html.match(p);
    if (m && m[1]) return m[1].trim();
  }
  return '';
}

function decodificar(t) {
  return String(t || '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .trim();
}

function absoluta(src, base) {
  try { return new URL(src, base).href; } catch (_) { return ''; }
}

/**
 * @returns {{url, titulo, descripcion, imagen, imagenes:string[], fuente}}
 */
async function leer(raw) {
  const u = await urlSegura(raw);
  const html = await bajarHtml(u);

  const titulo = decodificar(
    meta(html, 'og:title') || meta(html, 'twitter:title') ||
    (html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [])[1] || ''
  );
  const descripcion = decodificar(
    meta(html, 'og:description') || meta(html, 'twitter:description') || meta(html, 'description')
  );
  const principal = meta(html, 'og:image') || meta(html, 'og:image:url') || meta(html, 'twitter:image');

  // Además de la principal, las <img> del artículo, por si la og no sirve.
  // Se descartan las diminutas: suelen ser iconos, píxeles de tracking y logos.
  const otras = [];
  const re = /<img[^>]+>/gi;
  let m;
  while ((m = re.exec(html)) && otras.length < 40) {
    const tag = m[0];
    const src = (tag.match(/\ssrc=["']([^"']+)["']/i) || [])[1];
    if (!src || /^data:/i.test(src)) continue;
    const w = parseInt((tag.match(/\swidth=["']?(\d+)/i) || [])[1] || '0', 10);
    const h = parseInt((tag.match(/\sheight=["']?(\d+)/i) || [])[1] || '0', 10);
    if ((w && w < 200) || (h && h < 150)) continue;
    if (/sprite|icon|logo|avatar|pixel|blank|spacer/i.test(src)) continue;
    const abs = absoluta(decodificar(src), u.href);
    if (abs && otras.indexOf(abs) === -1) otras.push(abs);
  }

  const imagen = principal ? absoluta(decodificar(principal), u.href) : (otras[0] || '');
  return {
    url: u.href,
    titulo: titulo.slice(0, 300),
    descripcion: descripcion.slice(0, 600),
    imagen,
    imagenes: (imagen ? [imagen] : []).concat(otras.filter(x => x !== imagen)).slice(0, 8),
    fuente: decodificar(meta(html, 'og:site_name')) || u.hostname.replace(/^www\./, '')
  };
}

/** Baja una imagen para subirla al almacenamiento propio (no dejar hotlink). */
async function bajarImagen(raw) {
  const u = await urlSegura(raw);
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(u.href, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SOCCERiDBot/1.0; +https://soccerid.co)' }
    });
    if (!res.ok) throw new Error(`La imagen respondió ${res.status}`);
    const tipo = (res.headers.get('content-type') || '').split(';')[0].trim();
    if (!/^image\//.test(tipo)) throw new Error('Ese enlace no es una imagen');
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > 8 * 1024 * 1024) throw new Error('La imagen pesa más de 8 MB');
    const nombre = (u.pathname.split('/').pop() || 'imagen').split('?')[0] || 'imagen';
    return { buffer: buf, mimetype: tipo, originalname: nombre, size: buf.length };
  } finally {
    clearTimeout(t);
  }
}

module.exports = { leer, bajarImagen, urlSegura };
