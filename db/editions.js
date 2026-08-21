/**
 * Lectura de ediciones de la SOCCER iD CUP para las páginas públicas.
 * Fuente principal: tabla `editions` (Postgres/SQLite). Respaldo: archivos JSON
 * (cup_editions.json / gallery_pages.json) por si la DB está vacía o falla, para
 * que el sitio público nunca deje de renderizar.
 */
const path = require('path');
const fs = require('fs');
const knex = require('./knex');

function readJson(file) {
  try { return JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'contents', file), 'utf8')); }
  catch (_) { return null; }
}

function parse(row, lang) {
  try { return JSON.parse((lang === 'en' ? row.data_en : row.data_es) || row.data_es || '{}') || {}; }
  catch (_) { return {}; }
}

// Timeline de la página /socceridcup — { year, match, city, link, tone }
async function timeline(lang) {
  try {
    const rows = await knex('editions').orderBy([{ column: 'sort' }, { column: 'year' }]);
    if (rows && rows.length) {
      return rows.map(r => {
        const d = parse(r, lang);
        return {
          year: r.year, match: d.match || '', city: d.city || '',
          link: r.status === 'past',
          tone: r.status === 'pause' ? 'pause' : (r.status === 'upcoming' ? 'soon' : '')
        };
      });
    }
  } catch (_) {}
  // Respaldo: gallery_pages.json
  const gp = readJson('gallery_pages.json') || {};
  const g = ((gp[lang] || gp.es || []).find(x => x.id === 'soccer-id-cup-2027')) || {};
  return (g.highlights || []).map(h => {
    const s = (h.city + ' ' + h.match).toLowerCase();
    const pause = /fifa|world cup|pausa|mundial/.test(s);
    const soon = /confirmar|tba|soon|próxim|proxim/.test(s);
    return { year: h.year, match: h.match, city: h.city, link: !pause && !soon, tone: pause ? 'pause' : (soon ? 'soon' : '') };
  });
}

// Detalle de /socceridcup/:year — { edition, prev, next } o null (solo ediciones 'past')
async function detail(year, lang) {
  year = String(year);
  try {
    const rows = await knex('editions').where({ status: 'past' }).orderBy([{ column: 'sort' }, { column: 'year' }]);
    if (rows && rows.length) {
      const idx = rows.findIndex(r => String(r.year) === year);
      if (idx === -1) return null;
      return {
        edition: parse(rows[idx], lang),
        prev: idx > 0 ? { year: rows[idx - 1].year, match: parse(rows[idx - 1], lang).match } : null,
        next: idx < rows.length - 1 ? { year: rows[idx + 1].year, match: parse(rows[idx + 1], lang).match } : null
      };
    }
  } catch (_) {}
  // Respaldo: cup_editions.json
  const ed = readJson('cup_editions.json');
  if (!ed) return null;
  const le = ed[lang] || ed.es || {};
  const edition = le[year];
  if (!edition) return null;
  const years = Object.keys(le).sort();
  const i = years.indexOf(year);
  return {
    edition,
    prev: i > 0 ? { year: years[i - 1], match: le[years[i - 1]].match } : null,
    next: i < years.length - 1 ? { year: years[i + 1], match: le[years[i + 1]].match } : null
  };
}

// Notas de medios agregadas de las ediciones pasadas (para /socceridcup2027)
/**
 * Etiqueta la primera nota de cada edicion como destacada, para que la
 * propuesta 2027 muestre una por año y colapse el resto.
 */
function marcarDestacada(links, year) {
  return links.map((m, i) => Object.assign({}, m, { year: year, featured: i === 0 }));
}

async function mediaLinks(lang) {
  try {
    const rows = await knex('editions').where({ status: 'past' }).orderBy('year');
    if (rows && rows.length) {
      let out = [];
      rows.forEach(r => {
        const d = parse(r, lang);
        if (d && d.mediaLinks) out = out.concat(marcarDestacada(d.mediaLinks, r.year));
      });
      return out;
    }
  } catch (_) {}
  const ed = readJson('cup_editions.json') || {};
  const le = ed[lang] || ed.es || {};
  let out = [];
  Object.keys(le).forEach(y => { if (le[y].mediaLinks) out = out.concat(marcarDestacada(le[y].mediaLinks, y)); });
  return out;
}

module.exports = { timeline, detail, mediaLinks };
