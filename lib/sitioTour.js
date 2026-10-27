/**
 * Contenido de la página pública /:lang/tour, editable desde el admin
 * (Panel › Sitio web › Tour, ruta /panel/admin/sitio/tour).
 *
 * Se guarda en `app_settings` (clave `sitio_tour`) y no en los JSON de
 * contents/, por lo mismo que la configuración del dashboard: en Heroku el
 * disco es efímero y lo escrito en runtime se pierde al redesplegar.
 *
 * Forma de lo guardado:
 *   { comun: { fotos y logos, iguales en los dos idiomas },
 *     es:    { textos en español },
 *     en:    { textos en inglés } }
 * Lo que no esté guardado sale de DEFAULTS. Los objetos se mezclan campo a
 * campo; las listas (cifras, partidos, fotos...) se reemplazan enteras: si
 * el admin borra una cifra, tiene que desaparecer, no volver del default.
 *
 * Las EDICIONES jugadas (partido, sede, asistencia) no viven aquí: son filas
 * de `portfolio_events`, las mismas que pintan su ficha /socceridcup/:año.
 * El admin del Tour las edita sobre esa fila (ver `guardarEdicion`).
 */
const path = require('path');
const fs = require('fs');
const knex = require('../db/knex');
const cupEditions = require('../db/editions');

const KEY = 'sitio_tour';

function galeriaCup(lang) {
  try {
    const g = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contents', 'gallery_pages.json'), 'utf8'));
    return ((g[lang] || g.es || []).find(x => x.id === 'soccer-id-cup-2027')) || {};
  } catch (_) { return {}; }
}

// Fotos, logos y notas de arranque: los que la página ya enseñaba.
function comunPorDefecto() {
  const g = galeriaCup('es');
  return {
    fotoPortada: g.banner || '/assets/images/gallery/socceridcup/5.jpg',
    fotoProximos: '/assets/images/gallery/cup2025/1.jpg',
    fotoCierre: '/assets/images/gallery/cup2025/5.jpg',
    momentos: (g.images || []).map(i => ({ src: i.src, alt: i.alt || '' })),
    logos: [
      { src: '/assets/images/sponsors/caliente.png', alt: 'Caliente MX' },
      { src: '/assets/images/sponsors/fox-sports.png', alt: 'Fox Sports' },
      { src: '/assets/images/sponsors/voit.png', alt: 'Voit' },
      { src: '/assets/images/sponsors/nuestra-vision.png', alt: 'Nuestra Visión' }
    ]
  };
}

// Prensa de arranque: las notas de la página del Tour más las de cada
// edición jugada, sin repetir enlaces. Los medios grandes van destacados
// (arriba); el resto, detrás de «Ver más». En el admin se cambia nota por
// nota con la casilla «Destacada».
const MEDIOS_DESTACADOS = /tudn|medio ?tiempo|r[eé]cord|espn|fox/i;

async function notasDe(lang) {
  let deEdiciones = [];
  try { deEdiciones = await cupEditions.mediaLinks(lang); } catch (_) {}
  const vistas = new Set();
  const todas = deEdiciones.slice().sort((a, b) => Number(b.year || 0) - Number(a.year || 0))
    .concat(galeriaCup(lang).mediaLinks || [])
    .filter(m => m.url && !vistas.has(m.url) && vistas.add(m.url))
    .map(m => ({
      fuente: m.source || '', titulo: m.title || '', url: m.url || '', imagen: m.image || '',
      destacada: MEDIOS_DESTACADOS.test(m.source || '')
    }));
  return todas.filter(n => n.destacada).concat(todas.filter(n => !n.destacada));
}

// Español: los textos aprobados en «Textos y cambios del sitio web» (27/10/2026).
// Inglés: los que ya tenía el sitio, sin los equipos. El documento no aprueba
// inglés todavía; cuando llegue la traducción se captura en el admin.
const TEXTOS = {
  es: () => ({
    portada: {
      marca: 'SOCCER iD TOUR',
      titulo: 'Tour',
      descripcion: 'Organizamos partidos entre clubes de Latinoamérica en Estados Unidos.',
      etiquetas: ['2027', 'Estados Unidos'],
      boton: 'Colabora con nosotros'
    },
    eventos: {
      titulo: 'Nuestros eventos',
      texto: 'Organizamos partidos entre clubes de Latinoamérica en Estados Unidos, acercando a los equipos a su afición y conectando a marcas y comunidades a través del fútbol.',
      cifras: [
        { valor: '3', etiqueta: 'Ediciones', sub: '2023–2025' },
        { valor: '5', etiqueta: 'Equipos', sub: 'Primera División' },
        { valor: '3', etiqueta: 'Ciudades', sub: 'San José · Orlando · Austin' }
      ]
    },
    alcance: {
      titulo: 'Nuestro alcance',
      cifras: [
        { valor: '80K+', etiqueta: 'Asistentes en estadios', icono: 'stadium' },
        { valor: '5M+', etiqueta: 'Televidentes', icono: 'tv' },
        { valor: '40M+', etiqueta: 'Alcance digital', icono: 'social' }
      ],
      nota: 'Cifras acumuladas de las ediciones 2023–2025.'
    },
    proximos: {
      titulo: 'Próximos eventos',
      nombre: 'SOCCER iD TOUR ’27',
      descripcion: 'Tres partidos internacionales en Estados Unidos durante 2027.',
      boton: 'Colabora con nosotros',
      partidos: [
        { nombre: 'Partido 1 · Equipos por anunciar', fecha: '27 de marzo de 2027', estado: 'Confirmado · Anuncio oficial en diciembre de 2026' },
        { nombre: 'Partido 2 · Equipos por anunciar', fecha: 'Julio / agosto de 2027', estado: 'Confirmado' },
        { nombre: 'Partido 3 · Equipos por anunciar', fecha: 'Septiembre / octubre de 2027', estado: 'Confirmado' }
      ],
      aviso: 'En 2027, SOCCER iD CUP evoluciona a SOCCER iD TOUR: tres partidos internacionales en una misma temporada.'
    },
    ediciones: {
      titulo: 'Ediciones anteriores',
      boton: 'Ver edición',
      asistentes: 'asistentes',
      filas: [
        { anio: '2026', titulo: 'Pausa por el Mundial', sub: 'FIFA World Cup 2026' },
        { anio: '2027', titulo: 'SOCCER iD TOUR', sub: 'Tres partidos' }
      ]
    },
    momentos: { titulo: 'Momentos' },
    patrocinadores: { titulo: 'Patrocinadores' },
    medios: { titulo: 'En los medios', verMas: 'Ver más notas', verMenos: 'Ver menos', notas: [] },
    cierre: {
      titulo: 'Sé parte de la experiencia',
      descripcion: 'Invierte o crea una alianza para el Tour 2027.',
      boton: 'Colabora con nosotros'
    },
    mensajeWhatsapp: 'Hola! Quiero colaborar con el SOCCER iD TOUR 2027'
  }),
  en: () => ({
    portada: {
      marca: 'SOCCER iD TOUR',
      titulo: 'Tour',
      descripcion: 'We organize matches between Latin American clubs in the United States.',
      etiquetas: ['2027', 'United States'],
      boton: 'Partner with us'
    },
    eventos: {
      titulo: 'Our events',
      texto: 'We bring together the top clubs from Latin America in the United States, producing world-class football experiences for fans, sponsors, and host cities.',
      cifras: [
        { valor: '3', etiqueta: 'Editions', sub: '2023–2025' },
        { valor: '5', etiqueta: 'Teams', sub: 'First Division' },
        { valor: '3', etiqueta: 'Cities', sub: 'San José · Orlando · Austin' }
      ]
    },
    alcance: {
      titulo: 'Our reach',
      cifras: [
        { valor: '80K+', etiqueta: 'Stadium attendance', icono: 'stadium' },
        { valor: '5M+', etiqueta: 'TV viewers', icono: 'tv' },
        { valor: '40M+', etiqueta: 'Digital reach', icono: 'social' }
      ],
      nota: 'Combined figures for the 2023–2025 editions.'
    },
    proximos: {
      titulo: 'Upcoming events',
      nombre: 'SOCCER iD TOUR ’27',
      descripcion: 'Three international matches in the United States during 2027.',
      boton: 'Partner with us',
      partidos: [
        { nombre: 'Match 1 · Teams to be announced', fecha: 'March 27, 2027', estado: 'Confirmed · Official announcement in December 2026' },
        { nombre: 'Match 2 · Teams to be announced', fecha: 'July / August 2027', estado: 'Confirmed' },
        { nombre: 'Match 3 · Teams to be announced', fecha: 'September / October 2027', estado: 'Confirmed' }
      ],
      aviso: 'In 2027, SOCCER iD CUP becomes SOCCER iD TOUR: three international matches in one season.'
    },
    ediciones: {
      titulo: 'Past editions',
      boton: 'View edition',
      asistentes: 'attendees',
      filas: [
        { anio: '2026', titulo: 'Paused for the World Cup', sub: 'FIFA World Cup 2026' },
        { anio: '2027', titulo: 'SOCCER iD TOUR', sub: 'Three matches' }
      ]
    },
    momentos: { titulo: 'Moments' },
    patrocinadores: { titulo: 'Sponsors' },
    medios: { titulo: 'In the media', verMas: 'More coverage', verMenos: 'Show less', notas: [] },
    cierre: {
      titulo: 'Be part of the experience',
      descripcion: 'Invest or partner with us for Tour 2027.',
      boton: 'Partner with us'
    },
    mensajeWhatsapp: "Hi! I'd like to partner with the SOCCER iD TOUR 2027"
  })
};

// Los textos por defecto con la prensa, que se lee de la base.
async function textosPorDefecto(lang) {
  const t = TEXTOS[lang]();
  t.medios.notas = await notasDe(lang);
  return t;
}

const IDIOMAS = ['es', 'en'];
const esObjeto = v => v && typeof v === 'object' && !Array.isArray(v);

// Mezcla lo guardado sobre el default: objetos campo a campo, listas enteras.
function mezclar(base, encima) {
  if (!esObjeto(encima)) return base;
  const out = Object.assign({}, base);
  Object.keys(encima).forEach(k => {
    out[k] = esObjeto(base[k]) && esObjeto(encima[k]) ? mezclar(base[k], encima[k]) : encima[k];
  });
  return out;
}

async function guardado() {
  try {
    const row = await knex('app_settings').where({ key: KEY }).first();
    if (row && row.value) return JSON.parse(row.value) || {};
  } catch (_) {}
  return {};
}

/** Lo que pinta la página en `lang`: { t: textos, c: fotos y logos }. */
async function leer(lang) {
  lang = IDIOMAS.includes(lang) ? lang : 'es';
  const g = await guardado();
  return {
    t: mezclar(await textosPorDefecto(lang), g[lang]),
    c: mezclar(comunPorDefecto(), g.comun)
  };
}

// ── Limpieza de lo que llega del admin ────────────────────────────────
// Sólo se guarda la forma conocida: un campo de más no se cuela en la página
// y uno de menos se queda con su default.
const txt = (v, max = 600) => String(v == null ? '' : v).trim().slice(0, max);
const lista = (v, fn, max = 40) => (Array.isArray(v) ? v : []).slice(0, max).map(fn);
const ruta = v => {
  const s = txt(v, 500);
  return /^(https?:\/\/|\/)/i.test(s) ? s : '';
};
const ICONOS = ['stadium', 'tv', 'social'];

function limpiarTextos(b) {
  b = esObjeto(b) ? b : {};
  const p = b.portada || {}, e = b.eventos || {}, a = b.alcance || {}, x = b.proximos || {},
        d = b.ediciones || {}, ci = b.cierre || {};
  return {
    portada: {
      marca: txt(p.marca, 80), titulo: txt(p.titulo, 80), descripcion: txt(p.descripcion, 400),
      etiquetas: lista(p.etiquetas, s => txt(s, 60), 4).filter(Boolean),
      boton: txt(p.boton, 60)
    },
    eventos: {
      titulo: txt(e.titulo, 80), texto: txt(e.texto, 800),
      cifras: lista(e.cifras, f => ({ valor: txt(f.valor, 20), etiqueta: txt(f.etiqueta, 60), sub: txt(f.sub, 80) }), 6)
        .filter(f => f.valor || f.etiqueta)
    },
    alcance: {
      titulo: txt(a.titulo, 80),
      cifras: lista(a.cifras, f => ({ valor: txt(f.valor, 20), etiqueta: txt(f.etiqueta, 60),
        icono: ICONOS.includes(f.icono) ? f.icono : 'stadium' }), 6).filter(f => f.valor || f.etiqueta),
      nota: txt(a.nota, 200)
    },
    proximos: {
      titulo: txt(x.titulo, 80), nombre: txt(x.nombre, 80), descripcion: txt(x.descripcion, 400),
      boton: txt(x.boton, 60),
      partidos: lista(x.partidos, f => ({ nombre: txt(f.nombre, 120), fecha: txt(f.fecha, 80), estado: txt(f.estado, 120) }), 8)
        .filter(f => f.nombre || f.fecha),
      aviso: txt(x.aviso, 300)
    },
    ediciones: {
      titulo: txt(d.titulo, 80), boton: txt(d.boton, 40), asistentes: txt(d.asistentes, 40),
      filas: lista(d.filas, f => ({ anio: txt(f.anio, 10), titulo: txt(f.titulo, 80), sub: txt(f.sub, 80) }), 6)
        .filter(f => f.anio || f.titulo)
    },
    momentos: { titulo: txt((b.momentos || {}).titulo, 80) },
    patrocinadores: { titulo: txt((b.patrocinadores || {}).titulo, 80) },
    medios: {
      titulo: txt((b.medios || {}).titulo, 80),
      verMas: txt((b.medios || {}).verMas, 40), verMenos: txt((b.medios || {}).verMenos, 40),
      notas: lista((b.medios || {}).notas, n => ({ fuente: txt(n.fuente, 80), titulo: txt(n.titulo, 240),
        url: ruta(n.url), imagen: ruta(n.imagen), destacada: n.destacada === true }), 30).filter(n => n.titulo && n.url)
    },
    cierre: { titulo: txt(ci.titulo, 120), descripcion: txt(ci.descripcion, 300), boton: txt(ci.boton, 60) },
    mensajeWhatsapp: txt(b.mensajeWhatsapp, 300)
  };
}

function limpiarComun(c) {
  c = esObjeto(c) ? c : {};
  const foto = f => ({ src: ruta(f.src), alt: txt(f.alt, 160) });
  return {
    fotoPortada: ruta(c.fotoPortada), fotoProximos: ruta(c.fotoProximos), fotoCierre: ruta(c.fotoCierre),
    momentos: lista(c.momentos, foto, 40).filter(f => f.src),
    logos: lista(c.logos, foto, 30).filter(f => f.src)
  };
}

/** Guarda los textos de un idioma y lo común. Devuelve lo guardado. */
async function guardar(lang, textos, comun) {
  if (!IDIOMAS.includes(lang)) throw new Error('Idioma no válido');
  const actual = await guardado();
  const sig = Object.assign({}, actual, { [lang]: limpiarTextos(textos) });
  if (comun) sig.comun = limpiarComun(comun);
  const value = JSON.stringify(sig);
  const ex = await knex('app_settings').where({ key: KEY }).first();
  if (ex) await knex('app_settings').where({ key: KEY }).update({ value });
  else await knex('app_settings').insert({ key: KEY, value });
  return sig;
}

/** Vuelve un idioma (y, si se pide, lo común) a los valores por defecto. */
async function restablecer(lang, tambienComun) {
  const actual = await guardado();
  delete actual[lang];
  if (tambienComun) delete actual.comun;
  await knex('app_settings').where({ key: KEY }).update({ value: JSON.stringify(actual) });
}

// ── Ediciones jugadas, sobre `portfolio_events` ───────────────────────
const parseData = s => { try { return JSON.parse(s || '{}') || {}; } catch (_) { return {}; } };

/** Las ediciones pasadas reales, con lo que la tarjeta del Tour enseña. */
async function ediciones(lang) {
  const rows = await knex('portfolio_events').where({ status: 'past' })
    .where(b => b.where('is_demo', false).orWhereNull('is_demo')).orderBy('year');
  return rows.map(r => {
    const d = parseData(lang === 'en' ? r.data_en : r.data_es);
    return {
      id: r.id, year: r.year,
      match: d.match || r.match || '', venue: d.venue || r.venue || '', city: d.city || r.city || '',
      asistencia: (d.attendance || {}).value || ''
    };
  });
}

/**
 * Partido, sede, ciudad y asistencia de una edición. El partido se escribe en
 * el idioma que se está editando; sede, ciudad y asistencia son las mismas en
 * los dos idiomas y se copian a ambos, para que no haya dos cifras del mismo año.
 */
async function guardarEdicion(id, lang, campos) {
  const row = await knex('portfolio_events').where({ id }).first();
  if (!row) throw new Error('Edición no encontrada');
  const venue = txt(campos.venue, 120), city = txt(campos.city, 120), valor = txt(campos.asistencia, 20);
  const cambio = {};
  IDIOMAS.forEach(l => {
    const col = l === 'en' ? 'data_en' : 'data_es';
    // Sin datos en inglés, la ficha en inglés usa los de español: se parte
    // de esa copia para no dejarla sin fotos ni textos al guardar.
    const d = parseData(row[col] || row.data_es);
    if (l === lang) d.match = txt(campos.match, 160);
    d.venue = venue;
    d.city = city;
    d.attendance = Object.assign({}, d.attendance || {}, { value: valor });
    cambio[col] = JSON.stringify(d);
  });
  await knex('portfolio_events').where({ id }).update(cambio);
}

module.exports = { leer, guardar, restablecer, ediciones, guardarEdicion, IDIOMAS, KEY };
