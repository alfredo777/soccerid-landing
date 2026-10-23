#!/usr/bin/env node
/**
 * Rellena los datos de cada episodio en contents/podcast.json preguntándoselos
 * a YouTube. Nada se inventa ni se escribe a mano: título, duración y fecha
 * son los que el canal ya publicó.
 *
 *   node scripts/podcast-titulos.js            # sólo lo que falte
 *   node scripts/podcast-titulos.js --todos    # rehace todos
 *
 * De dónde sale cada cosa:
 *   · título  → oEmbed, que es una API declarada y estable.
 *   · duración, fecha y vistas → de la página del video. No hay API pública
 *     sin llave que los dé, así que se leen del JSON que YouTube incrusta en
 *     el HTML. Es frágil por naturaleza: si cambian el formato, estos tres
 *     dejan de resolverse y el episodio se queda sin ellos. Por eso la vista
 *     funciona igual sin ellos y por eso esto es un script y no una llamada
 *     al vuelo: la página nunca depende de que YouTube conteste.
 *
 * Se corre al agregar episodios. Lo que resuelve, queda guardado.
 */
const fs = require('fs');
const path = require('path');

const RUTA = path.join(__dirname, '..', 'contents', 'podcast.json');
const TODOS = process.argv.includes('--todos');
const NAVEGADOR = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  'Accept-Language': 'es-MX,es;q=0.9'
};

async function porOEmbed(videoId) {
  const url = 'https://www.youtube.com/oembed?format=json&url=' +
    encodeURIComponent('https://www.youtube.com/watch?v=' + videoId);
  const r = await fetch(url);
  if (!r.ok) throw new Error('oEmbed HTTP ' + r.status);
  const j = await r.json();
  if (!j.title) throw new Error('oEmbed sin título');
  return j.title;
}

/** Duración en segundos, fecha de publicación y vistas. Devuelve lo que encuentre. */
async function porPagina(videoId) {
  const r = await fetch('https://www.youtube.com/watch?v=' + videoId, { headers: NAVEGADOR });
  if (!r.ok) throw new Error('watch HTTP ' + r.status);
  const h = await r.text();
  const seg = h.match(/"lengthSeconds":"(\d+)"/);
  const fecha = h.match(/"publishDate":"(\d{4}-\d{2}-\d{2})/) || h.match(/"uploadDate":"(\d{4}-\d{2}-\d{2})/);
  const vistas = h.match(/"viewCount":"(\d+)"/);
  return {
    duracion: seg ? Number(seg[1]) : null,
    fecha: fecha ? fecha[1] : null,
    vistas: vistas ? Number(vistas[1]) : null
  };
}

/** 4001 → "1:06:41";  2715 → "45:15". */
function reloj(segundos) {
  const s = segundos % 60, m = Math.floor(segundos / 60) % 60, h = Math.floor(segundos / 3600);
  const dos = n => String(n).padStart(2, '0');
  return h ? `${h}:${dos(m)}:${dos(s)}` : `${m}:${dos(s)}`;
}

(async () => {
  const datos = JSON.parse(fs.readFileSync(RUTA, 'utf8'));
  const eps = datos.episodios || [];
  if (!eps.length) {
    console.log('No hay episodios en el archivo.');
    return;
  }

  let puestos = 0, saltados = 0, fallidos = 0;
  for (let i = 0; i < eps.length; i++) {
    const ep = eps[i];
    const completo = ep.titulo && ep.duracion && ep.fecha;
    if (completo && !TODOS) { saltados++; continue; }

    const n = String(i + 1).padStart(2);
    try {
      if (!ep.titulo || TODOS) ep.titulo = await porOEmbed(ep.videoId);
      const extra = await porPagina(ep.videoId);
      if (extra.duracion) { ep.duracion = extra.duracion; ep.reloj = reloj(extra.duracion); }
      if (extra.fecha) ep.fecha = extra.fecha;
      if (extra.vistas != null) ep.vistas = extra.vistas;
      puestos++;
      console.log(`  ✓ ${n}  ${ep.reloj || '--:--'}  ${ep.fecha || '----------'}  ${(ep.titulo || '').slice(0, 54)}`);
    } catch (e) {
      fallidos++;
      console.log(`  ✗ ${n}  ${ep.videoId}  (${e.message})`);
    }
    // Sin prisa: son peticiones a un servicio ajeno, no una carrera.
    await new Promise(r => setTimeout(r, 250));
  }

  fs.writeFileSync(RUTA, JSON.stringify(datos, null, 2) + '\n');
  console.log(`\n${puestos} episodio(s) actualizado(s), ${saltados} ya completo(s), ${fallidos} sin resolver.`);
  if (fallidos) process.exitCode = 1;
})();
