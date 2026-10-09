/**
 * GKrakenCMS - Servidor Node.js
 * Proyecto: soccerid-v4-landing
 * 
 * Sistema con:
 * - Rutas de idioma (/es/, /en/)
 * - Meta tags traducidas
 * - Caché inteligente
 */

const express = require('express');
const { engine } = require('express-handlebars');
const session = require('express-session');
const path = require('path');
const fs = require('fs');

const crypto = require('crypto');
const knex = require('./db/knex');
const cupEditions = require('./db/editions');
const project2027 = require('./lib/project2027');
const propuestas = require('./lib/propuestas');

const app = express();
const PORT = process.env.PORT || 3000;
const isProduction = process.env.NODE_ENV === 'production';

// ============================================================
// URL BASE - PRODUCCIÓN vs DESARROLLO
// ============================================================
const PRODUCTION_URL = 'https://soccerid.co';
const DEVELOPMENT_URL = `http://localhost:${PORT}`;

// Prioridad: Variable de entorno > URL según entorno
const BASE_URL = process.env.BASE_URL || (isProduction ? PRODUCTION_URL : DEVELOPMENT_URL);

// ============================================================
// CONFIGURACIÓN DE IDIOMAS
// ============================================================
const SUPPORTED_LANGS = ['es', 'en'];
const DEFAULT_LANG = 'es';

// Cargar traducciones al inicio
let uiTranslations = {};
function loadTranslations() {
  const translationsPath = path.join(__dirname, 'contents', 'ui_translations.json');
  if (fs.existsSync(translationsPath)) {
    try {
      uiTranslations = JSON.parse(fs.readFileSync(translationsPath, 'utf8'));
      console.log('✓ Traducciones cargadas');
    } catch (e) {
      console.error('Error cargando traducciones:', e);
    }
  }
}
loadTranslations();

// Función helper para obtener traducción
function t(lang, key) {
  const keys = key.split('.');
  let value = uiTranslations[lang] || uiTranslations[DEFAULT_LANG];
  
  for (const k of keys) {
    if (value && typeof value === 'object' && k in value) {
      value = value[k];
    } else {
      return key;
    }
  }
  
  return value;
}

// ============================================================
// VERSIÓN ÚNICA - CAMBIA EN CADA REINICIO
// ============================================================
const APP_VERSION = Date.now().toString(36);

// ============================================================
// LIMPIEZA TOTAL DE CACHÉ AL INICIAR
// ============================================================
function clearAllCache() {
  console.log('');
  console.log('🧹 LIMPIANDO TODO EL CACHÉ...');
  console.log('-'.repeat(50));
  
  let modulesCleared = 0;
  Object.keys(require.cache).forEach(key => {
    if (key.includes(__dirname) && !key.includes('node_modules')) {
      delete require.cache[key];
      modulesCleared++;
    }
  });
  console.log(`   ✓ ${modulesCleared} módulos eliminados del caché`);
  
  const cacheFolders = ['.cache', 'tmp', '.tmp', 'cache', '.parcel-cache'];
  cacheFolders.forEach(folder => {
    const folderPath = path.join(__dirname, folder);
    if (fs.existsSync(folderPath)) {
      try {
        fs.rmSync(folderPath, { recursive: true, force: true });
        console.log(`   ✓ Carpeta ${folder} eliminada`);
      } catch (e) {
        console.log(`   ⚠ No se pudo eliminar ${folder}`);
      }
    }
  });
  
  const processedCacheDir = path.join(__dirname, '.processed-cache');
  if (fs.existsSync(processedCacheDir)) {
    fs.rmSync(processedCacheDir, { recursive: true, force: true });
  }
  fs.mkdirSync(processedCacheDir, { recursive: true });
  
  console.log('-'.repeat(50));
  console.log(`✅ CACHÉ LIMPIADO - Nueva versión: ${APP_VERSION}`);
  console.log('');
}

clearAllCache();

// ============================================================
// PROCESAR CSS
// ============================================================
function processCSSWithVersion(cssContent, version) {
  return cssContent.replace(
    /url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
    (match, url) => {
      if (url.startsWith('data:') || 
          url.startsWith('http://') || 
          url.startsWith('https://') ||
          url.includes('?v=')) {
        return match;
      }
      const separator = url.includes('?') ? '&' : '?';
      return `url('${url}${separator}v=${version}')`;
    }
  );
}

// ============================================================
// SESIÓN
// ============================================================
app.use(session({
  secret: process.env.SESSION_SECRET || '9f80e68fee77eaad72fe630b5fa1631c1156fcc2f6c54421c62ea356eaf5be94',
  resave: false,
  saveUninitialized: false,
  cookie: { 
    secure: isProduction, 
    httpOnly: true, 
    maxAge: 24 * 60 * 60 * 1000,
    // Configurar dominio en producción
    domain: isProduction ? '.soccerid.co' : undefined
  }
}));

// ============================================================
// HANDLEBARS CON HELPERS DE IDIOMA
// ============================================================
const hbs = require('express-handlebars').create({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
    // Helpers existentes
    formatDate: d => d ? new Date(d).toLocaleDateString('es-MX', { year: 'numeric', month: 'long', day: 'numeric' }) : '',
    timeAgo: d => {
      if (!d) return '';
      const s = Math.floor((new Date() - new Date(d)) / 1000);
      if (s < 60) return 'hace un momento';
      if (s < 3600) return `hace ${Math.floor(s/60)} min`;
      if (s < 86400) return `hace ${Math.floor(s/3600)} horas`;
      if (s < 604800) return `hace ${Math.floor(s/86400)} días`;
      return new Date(d).toLocaleDateString('es-MX');
    },
    truncate: (s, l) => s && s.length > l ? s.substring(0, l) + '...' : s || '',
    year: () => new Date().getFullYear(),
    json: o => JSON.stringify(o, null, 2),
    join: (a, s) => Array.isArray(a) ? a.join(s || ', ') : '',
    default: (v, d) => v || d,

    /**
     * Atributos para un enlace que SACA de la propuesta.
     *
     * Quien está leyendo una propuesta de inversión no debería perderla por
     * asomarse a la historia de la copa: eso se abre en otra pestaña. Se
     * resuelve aquí y no a mano en la plantilla porque los destinos de las
     * CTAs viven en el JSON de contenido y pueden cambiar sin tocar la vista.
     *
     * No sacan de ningún lado, y por eso no llevan nada: las anclas (#), y
     * mailto:/tel:, que no navegan —con target dejarían una pestaña en blanco.
     * Las páginas de la propia propuesta (sus partidos) tampoco: son el mismo
     * recorrido. Se usa con triple llave: {{{salida url}}}
     */
    /**
     * Cuántas columnas para `n` tarjetas, sin dejar una sola huérfana en la
     * última fila. Nueve notas de prensa en cuatro columnas salen 4+4+1, y esa
     * tarjeta suelta se lee como un error de maquetación; en tres columnas son
     * 3+3+3. El número de notas sale de la base de datos y cambia, así que la
     * rejilla se calcula en vez de fijarse.
     *
     * Se prefieren más columnas, y se baja solo para evitar la huérfana. Si
     * ningún reparto la evita (13, 25...) se queda con cuatro: es raro y
     * cualquier alternativa queda peor.
     */
    columnas: function (n) {
      const total = parseInt(n, 10) || 0;
      if (total <= 0) return 1;
      for (const c of [4, 3, 2]) {
        if (total <= c) return total;
        if (total % c !== 1) return c;
      }
      return 4;
    },

    salida: function (url, options) {
      const u = String(url == null ? '' : url).trim();
      if (!u || u.charAt(0) === '#') return '';
      if (/^(mailto:|tel:)/i.test(u)) return '';
      const attrs = ' target="_blank" rel="noopener"';
      if (/^https?:\/\//i.test(u)) return attrs;
      const raiz = (options && options.data && options.data.root) || {};
      // La raíz de la familia: el tour es 'socceridcup2027' y sus partidos
      // 'socceridcup2027/partido-1'. Comparando contra el primer tramo, el
      // tour y sus partidos se reconocen entre sí en los dos sentidos.
      const base = String(raiz.slug || '').split('/')[0];
      if (!base) return attrs;
      const sinIdioma = u.replace(/^\/[a-z]{2}\//, '');
      return (sinIdioma === base || sinIdioma.indexOf(base + '/') === 0) ? '' : attrs;
    },
    
    // Helpers para cache busting
    version: () => APP_VERSION,
    asset: (url) => `${url}?v=${APP_VERSION}`,
    img: (url) => `${url}?v=${APP_VERSION}`,
    css: (url) => `${url}?v=${APP_VERSION}`,
    js: (url) => `${url}?v=${APP_VERSION}`,
    
    // Helpers de idioma
    t: function(key, options) {
      const lang = options.data.root.lang || DEFAULT_LANG;
      return t(lang, key);
    },
    
    langUrl: function(targetLang, options) {
      const currentPath = options.data.root.currentPath || '/';
      return `/${targetLang}${currentPath}`;
    },
    
    isLang: function(targetLang, options) {
      const currentLang = options.data.root.lang || DEFAULT_LANG;
      return currentLang === targetLang;
    },
    
    ogLocale: function(options) {
      const lang = options.data.root.lang || DEFAULT_LANG;
      return lang === 'es' ? 'es_ES' : 'en_US';
    },
    
    alternateUrl: function(targetLang, options) {
      const currentPath = options.data.root.currentPath || '/';
      const baseUrl = options.data.root.baseUrl || BASE_URL;
      return `${baseUrl}/${targetLang}${currentPath}`;
    },
    
    // Helper para URL canónica completa
    canonicalUrl: function(options) {
      const lang = options.data.root.lang || DEFAULT_LANG;
      const currentPath = options.data.root.currentPath || '/';
      const baseUrl = options.data.root.baseUrl || BASE_URL;
      return `${baseUrl}/${lang}${currentPath === '/' ? '' : currentPath}`;
    },
    
    // Helper para URL de imagen con dominio completo (para Open Graph)
    absoluteImg: function(url, options) {
      const baseUrl = options.data.root.baseUrl || BASE_URL;
      return `${baseUrl}${url}?v=${APP_VERSION}`;
    }
  }
});

const registerHelpers = require('./helpers');
registerHelpers(hbs.handlebars);

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', isProduction); // Habilitar cache de vistas solo en producción

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(require('cookie-parser')());

// Trust proxy para obtener IP real detrás de reverse proxy (producción)
if (isProduction) {
  app.set('trust proxy', 1);
}

// Variables globales para vistas
app.use((req, res, next) => {
  res.locals.year = new Date().getFullYear();
  res.locals.version = APP_VERSION;
  res.locals.baseUrl = BASE_URL;
  res.locals.isProduction = isProduction;
  res.locals.turnstileSiteKey = process.env.TURNSTILE_SITE_KEY || '';
  next();
});

// ============================================================
// MIDDLEWARE DE DETECCIÓN DE IDIOMA
// ============================================================
function detectLanguage(req) {
  // 1. Verificar si hay idioma en la URL
  const urlLang = req.params.lang;
  if (urlLang && SUPPORTED_LANGS.includes(urlLang)) {
    return urlLang;
  }
  
  // 2. Verificar cookie de idioma
  const cookieLang = req.cookies?.lang;
  if (cookieLang && SUPPORTED_LANGS.includes(cookieLang)) {
    return cookieLang;
  }
  
  // 3. Detectar del header Accept-Language
  const acceptLang = req.headers['accept-language'];
  if (acceptLang) {
    const browserLang = acceptLang.split(',')[0].split('-')[0].toLowerCase();
    if (SUPPORTED_LANGS.includes(browserLang)) {
      return browserLang;
    }
  }
  
  return DEFAULT_LANG;
}

// Middleware para parsear cookies (simple)
app.use((req, res, next) => {
  req.cookies = {};
  const cookieHeader = req.headers.cookie;
  if (cookieHeader) {
    cookieHeader.split(';').forEach(cookie => {
      const [name, value] = cookie.trim().split('=');
      req.cookies[name] = value;
    });
  }
  next();
});

// ============================================================
// SERVIR CSS CON VERSIÓN
// ============================================================
app.get('/assets/css/:filename', (req, res) => {
  const cssPath = path.join(__dirname, 'assets/css', req.params.filename);
  
  if (!fs.existsSync(cssPath)) {
    return res.status(404).send('CSS not found');
  }
  
  const cacheDir = path.join(__dirname, '.processed-cache');
  const cachedFile = path.join(cacheDir, `${req.params.filename}.${APP_VERSION}`);
  
  let processedCSS;
  
  if (fs.existsSync(cachedFile)) {
    processedCSS = fs.readFileSync(cachedFile, 'utf8');
  } else {
    const originalCSS = fs.readFileSync(cssPath, 'utf8');
    processedCSS = processCSSWithVersion(originalCSS, APP_VERSION);
    
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cachedFile, processedCSS);
  }
  
  res.set({
    'Content-Type': 'text/css; charset=utf-8',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'ETag': `"${APP_VERSION}"`,
    'X-CSS-Version': APP_VERSION
  });
  
  res.send(processedCSS);
});

// ============================================================
// ARCHIVOS ESTÁTICOS
// ============================================================
app.use('/assets', (req, res, next) => {
  if (req.path.startsWith('/css/')) {
    return next('route');
  }
  
  const hasVersion = req.query.v === APP_VERSION;
  
  if (hasVersion) {
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': `"${APP_VERSION}"`
    });
  } else if (req.query.v) {
    res.set({
      'Cache-Control': 'no-store, must-revalidate',
      'X-Outdated-Version': 'true'
    });
  } else {
    res.set({
      'Cache-Control': 'no-cache, must-revalidate',
      'ETag': `"${APP_VERSION}"`
    });
  }
  
  next();
}, express.static(path.join(__dirname, 'assets')));

app.use('/public', express.static(path.join(__dirname, 'public')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/images', express.static(path.join(__dirname, 'images')));

// ============================================================
// RUTAS DE ADMIN Y BLOG (sin idioma)
// ============================================================
const blogRoutes = require('./routes/blog');

// El antiguo admin de Kraken CMS fue reemplazado por el panel de inversionistas.
// /admin (y cualquier sub-ruta) ahora lleva al admin del panel; si no hay sesión
// de admin, requireAdmin redirige a /panel/login.
app.get(['/admin', '/admin/*'], (req, res) => res.redirect('/panel/admin'));
app.use('/blog', blogRoutes);

// ============================================================
// API ENDPOINTS
// ============================================================
// Los archivos de `contents/` no son públicos por defecto: ahí viven las
// propuestas de inversión completas (que están detrás del candado de código) y
// el archivo semilla de códigos de acceso. Servirlos abiertos dejaba descargar
// la propuesta entera sin código.
//
// La excepción es esta lista: son los archivos que la landing pública necesita
// para pintarse —los mismos que pide loadAllData() en assets/js/main.js—. Sin
// ellos el sitio se queda sin traducciones y se ven las claves crudas
// (hero.tagline, contact.title). Nada aquí es privado: es el contenido que ya
// se muestra en pantalla.
//
// Cualquier otro archivo exige sesión de admin y responde 404 —no 403— para no
// confirmar siquiera qué archivos existen. El admin tiene además su propio
// visor en /admin/contents/preview/:name.
//
// OJO: esta lista es la otra mitad de `GKraken.dataFiles` en
// assets/js/main.js. Si agregas uno, agrégalo en los dos lados o el front se
// queda sin ese archivo en silencio. Ver docs/variables-del-proyecto.md.
const CONTENIDOS_PUBLICOS = new Set([
  'bento_items_first',
  'bento_items_second',
  'upcoming_events',
  'panel_templates',
  'panel_classes',
  'ui_translations'
]);

function normalizarNombreContenido(filename) {
  return filename.endsWith('.json') ? filename.slice(0, -5) : filename;
}

async function soloAdmin(req, res, next) {
  try {
    const user = await require('./lib/panelAuth').getUserFromRequest(req);
    if (user && user.role === 'admin') return next();
  } catch (_) {}
  res.set('Cache-Control', 'no-store');
  return res.status(404).json({ error: 'No encontrado' });
}

// Deja pasar los archivos de la lista blanca; para el resto, exige admin.
function contenidoPublicoOAdmin(req, res, next) {
  if (CONTENIDOS_PUBLICOS.has(normalizarNombreContenido(req.params.filename))) {
    return next();
  }
  return soloAdmin(req, res, next);
}

app.get('/contents/:filename', contenidoPublicoOAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');

  const filename = normalizarNombreContenido(req.params.filename);

  const jsonPath = path.join(__dirname, 'contents', filename + '.json');

  if (fs.existsSync(jsonPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      res.json({ 
        data: data,
        _version: APP_VERSION 
      });
    } catch (err) {
      console.error(`Error parsing ${filename}.json:`, err);
      res.status(500).json({ error: 'Error al parsear JSON' });
    }
  } else {
    res.status(404).json({ error: 'No encontrado', file: filename });
  }
});

app.get('/api/contents', soloAdmin, (req, res) => {
  res.set('Cache-Control', 'no-store');
  const dir = path.join(__dirname, 'contents');
  const files = fs.readdirSync(dir)
    .filter(f => f.endsWith('.json') && !f.includes('blog'))
    .map(f => ({ name: f.replace('.json', ''), url: '/contents/' + f.replace('.json', '') }));
  res.json({ contents: files, version: APP_VERSION });
});

app.get('/api/info', (req, res) => {
  res.json({ 
    nodeVersion: process.version, 
    project: 'soccerid-v4-landing',
    version: APP_VERSION,
    uptime: process.uptime(),
    supportedLangs: SUPPORTED_LANGS,
    defaultLang: DEFAULT_LANG,
    baseUrl: BASE_URL,
    environment: isProduction ? 'production' : 'development'
  });
});

app.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ version: APP_VERSION });
});

// API para obtener/establecer idioma
app.get('/api/lang', (req, res) => {
  const lang = detectLanguage(req);
  res.json({ lang, supported: SUPPORTED_LANGS, default: DEFAULT_LANG });
});

app.post('/api/lang', (req, res) => {
  const { lang } = req.body;
  if (SUPPORTED_LANGS.includes(lang)) {
    res.cookie('lang', lang, { 
      maxAge: 365 * 24 * 60 * 60 * 1000, 
      httpOnly: false,
      domain: isProduction ? '.soccerid.co' : undefined
    });
    res.json({ success: true, lang });
  } else {
    res.status(400).json({ error: 'Idioma no soportado' });
  }
});

app.post('/api/clear-cache', (req, res) => {
  clearAllCache();
  loadTranslations();
  res.json({ success: true, newVersion: APP_VERSION });
});

// ============================================================
// CARGAR DATOS PARA VISTAS
// ============================================================
function loadViewData(lang = DEFAULT_LANG, currentPath = '/') {
  const translations = uiTranslations[lang] || uiTranslations[DEFAULT_LANG];
  
  const data = { 
    title: translations?.meta?.title || 'SOCCER iD',
    description: translations?.meta?.description || '',
    keywords: translations?.meta?.keywords || 'soccer id, soccerid, soccer id cup, experiencias vip, seguros id, copa 2026, deportes, fútbol',
    ogTitle: translations?.meta?.ogTitle || translations?.meta?.title || 'SOCCER iD',
    ogDescription: translations?.meta?.ogDescription || translations?.meta?.description || '',
    ogLocale: lang === 'es' ? 'es_ES' : 'en_US',
    twitterTitle: translations?.meta?.twitterTitle || translations?.meta?.title || 'SOCCER iD',
    twitterDescription: translations?.meta?.twitterDescription || translations?.meta?.description || '',
    year: new Date().getFullYear(),
    version: APP_VERSION,
    lang: lang,
    currentPath: currentPath,
    baseUrl: BASE_URL,
    supportedLangs: SUPPORTED_LANGS,
    isEs: lang === 'es',
    isEn: lang === 'en',
    isProduction: isProduction,
    translations: translations
  };
  
  const dir = path.join(__dirname, 'contents');
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') && !f.startsWith('blog'))
      .forEach(f => {
        try {
          const content = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
          const varName = f.replace('.json', '').replace(/-/g, '_');
          
          if (content[lang]) {
            data[varName] = content[lang];
          } else if (content[DEFAULT_LANG]) {
            data[varName] = content[DEFAULT_LANG];
          } else {
            data[varName] = content;
          }
        } catch (e) {
          console.error(`Error cargando ${f}:`, e.message);
        }
      });
  }
  
  if (Array.isArray(data.upcoming_events)) {
    const today = new Date().toISOString().slice(0, 10);
    data.upcoming_events = data.upcoming_events.filter(e => !e.dateISO || e.dateISO >= today);
  }

  return data;
}

// ============================================================
// PÁGINAS LEGALES CON IDIOMA
// ============================================================
app.get('/:lang/terms', (req, res) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;
  res.render('legal/terms', { 
    layout: 'legal', 
    ...loadViewData(lang, '/terms')
  });
});

app.get('/:lang/privacy', (req, res) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;
  res.render('legal/privacy', { 
    layout: 'legal', 
    ...loadViewData(lang, '/privacy')
  });
});

// ============================================================
// PÁGINA DE PROMO POR EVENTO
// ============================================================
app.get('/:lang/evento/:id', (req, res, next) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;
  const eventId = req.params.id;

  const eventsPath = path.join(__dirname, 'contents', 'upcoming_events.json');
  if (!fs.existsSync(eventsPath)) return next();

  try {
    const events = JSON.parse(fs.readFileSync(eventsPath, 'utf8'));
    const langEvents = events[lang] || events[DEFAULT_LANG] || [];
    const evento = langEvents.find(e => e.id === eventId);

    if (!evento) return next();

    const isEs = lang === 'es';
    const ogTitle = `${evento.team1} vs ${evento.team2} | ${isEs ? 'Accesos VIP' : 'VIP Access'} | SOCCER iD`;
    const ogDesc = isEs
      ? `${evento.date} - ${evento.time} | ${evento.venue} | ${evento.badge} ${evento.torneo}`
      : `${evento.date} - ${evento.time} | ${evento.venue} | ${evento.badge} ${evento.torneo}`;

    const ogImage = evento.image
      ? '/assets/images/og/' + path.basename(evento.image).replace(/\.\w+$/, '.jpg')
      : '/assets/images/og/photo-1489944440615-453fc2b6a9a9.jpg';

    res.render('evento', {
      layout: 'promo',
      title: ogTitle,
      description: ogDesc,
      ogTitle: ogTitle,
      ogDescription: ogDesc,
      ogImage: ogImage,
      ogLocale: lang === 'es' ? 'es_ES' : 'en_US',
      lang: lang,
      baseUrl: BASE_URL,
      currentPath: `/evento/${eventId}`,
      isEs: isEs,
      isEn: lang === 'en',
      evento: evento,
      year: new Date().getFullYear(),
      version: APP_VERSION
    });
  } catch (e) {
    console.error('Error cargando evento:', e);
    next();
  }
});

app.get('/evento/:id', (req, res) => {
  const lang = detectLanguage(req);
  res.redirect(302, `/${lang}/evento/${req.params.id}`);
});

// Ruta artículo con idioma
app.get('/:lang/articulo/:id', (req, res, next) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;
  const articleId = req.params.id;

  const panelsPath = path.join(__dirname, 'contents', 'panel_templates.json');
  if (!fs.existsSync(panelsPath)) return next();

  try {
    const panels = JSON.parse(fs.readFileSync(panelsPath, 'utf8'));
    const langPanels = panels[lang] || panels[DEFAULT_LANG] || {};
    const media = langPanels.media;
    if (!media || !media.articles) return next();

    const articulo = media.articles.find(a => a.id === articleId);
    if (!articulo) return next();

    const isEs = lang === 'es';
    const ogTitle = `${articulo.title} | SOCCER iD`;
    const ogDesc = articulo.excerpt;
    const ogImage = articulo.image || '/assets/images/og-image.jpg';

    let typeBadge = '';
    if (articulo.type === 'video') typeBadge = isEs ? 'Video' : 'Video';
    else if (articulo.type === 'magazine') typeBadge = isEs ? 'Revista' : 'Magazine';
    else typeBadge = isEs ? 'Artículo' : 'Article';

    articulo.typeBadge = typeBadge;
    if (articulo.magazineData && articulo.magazineData.pages) {
      articulo.pageCount = articulo.magazineData.pages.length;
    }

    res.render('articulo', {
      layout: 'promo',
      title: ogTitle,
      description: ogDesc,
      ogTitle: ogTitle,
      ogDescription: ogDesc,
      ogImage: ogImage,
      ogLocale: lang === 'es' ? 'es_ES' : 'en_US',
      lang: lang,
      baseUrl: BASE_URL,
      currentPath: `/articulo/${articleId}`,
      isEs: isEs,
      isEn: lang === 'en',
      articulo: articulo,
      year: new Date().getFullYear(),
      version: APP_VERSION
    });
  } catch (e) {
    console.error('Error cargando artículo:', e);
    next();
  }
});

app.get('/articulo/:id', (req, res) => {
  const lang = detectLanguage(req);
  res.redirect(302, `/${lang}/articulo/${req.params.id}`);
});

// Redirect old gallery URL to new cupid route
app.get('/:lang/galeria/soccer-id-cup-2027', (req, res) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;
  res.redirect(301, `/${lang}/socceridcup`);
});

// ============================================================
// PÁGINA DE GALERÍA
// ============================================================
app.get('/:lang/galeria/:id', (req, res, next) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;
  const galeriaId = req.params.id;

  const galeriaPath = path.join(__dirname, 'contents', 'gallery_pages.json');
  if (!fs.existsSync(galeriaPath)) return next();

  try {
    const galleries = JSON.parse(fs.readFileSync(galeriaPath, 'utf8'));
    const langGalleries = galleries[lang] || galleries[DEFAULT_LANG] || [];
    const galeria = langGalleries.find(g => g.id === galeriaId);

    if (!galeria) return next();

    const isEs = lang === 'es';
    galeria.imageCount = galeria.images ? galeria.images.length : 0;
    const ogTitle = `${galeria.title} | SOCCER iD`;
    const ogDesc = galeria.description;
    const ogImage = galeria.banner || '/assets/images/og-image.jpg';

    res.render('galeria', {
      layout: 'promo',
      title: ogTitle,
      description: ogDesc,
      ogTitle: ogTitle,
      ogDescription: ogDesc,
      ogImage: ogImage,
      ogLocale: isEs ? 'es_ES' : 'en_US',
      lang: lang,
      baseUrl: BASE_URL,
      currentPath: `/galeria/${galeriaId}`,
      isEs: isEs,
      isEn: lang === 'en',
      galeria: galeria,
      year: new Date().getFullYear(),
      version: APP_VERSION
    });
  } catch (e) {
    console.error('Error cargando galería:', e);
    next();
  }
});

app.get('/galeria/:id', (req, res) => {
  const lang = detectLanguage(req);
  res.redirect(302, `/${lang}/galeria/${req.params.id}`);
});

// ============================================================
// PÁGINA SOCCER iD CUP (socceridcup)
// ============================================================
app.get('/:lang/socceridcup', async (req, res, next) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;

  const galeriaPath = path.join(__dirname, 'contents', 'gallery_pages.json');
  if (!fs.existsSync(galeriaPath)) return next();

  try {
    const galleries = JSON.parse(fs.readFileSync(galeriaPath, 'utf8'));
    const langGalleries = galleries[lang] || galleries[DEFAULT_LANG] || [];
    const galeria = langGalleries.find(g => g.id === 'soccer-id-cup-2027');

    if (!galeria) return next();

    // El timeline de ediciones se administra desde la base de datos (con respaldo al JSON)
    galeria.highlights = await cupEditions.timeline(lang);

    const isEs = lang === 'es';
    galeria.imageCount = galeria.images ? galeria.images.length : 0;
    const ogTitle = `${galeria.title} | SOCCER iD`;
    const ogDesc = galeria.description;
    const ogImage = galeria.banner || '/assets/images/og-image.jpg';

    res.render('socceridcup', {
      layout: 'promo',
      title: ogTitle,
      description: ogDesc,
      ogTitle: ogTitle,
      ogDescription: ogDesc,
      ogImage: ogImage,
      ogLocale: isEs ? 'es_ES' : 'en_US',
      lang: lang,
      baseUrl: BASE_URL,
      currentPath: '/socceridcup',
      isEs: isEs,
      isEn: lang === 'en',
      galeria: galeria,
      year: new Date().getFullYear(),
      version: APP_VERSION
    });
  } catch (e) {
    console.error('Error cargando socceridcup:', e);
    next();
  }
});

app.get('/socceridcup', (req, res) => {
  const lang = detectLanguage(req);
  res.redirect(302, `/${lang}/socceridcup`);
});

// ============================================================
// PÁGINAS DE PROPUESTA DE INVERSIÓN (con candado de código)
// ============================================================
// Todas las propuestas —la que está en vivo y las alternas preparadas por
// adelantado— comparten esta vista y este handler. Lo único que cambia entre
// una y otra es el archivo de contenido y el slug, que vienen de
// `lib/propuestas.js`. Ver también el endpoint POST /api/project2027/verify.
// Las tarjetas de "LOS PARTIDOS" del perfil anual: el texto sale del archivo
// de contenido y la dirección del registro, que es quien sabe dónde vive cada
// partido y si todavía se está negociando. Así no hay URLs escritas a mano en
// el contenido.
function navPartidos(data, lang) {
  // En la estructura v2 del tour las tarjetas viven bajo `proyecto`; el
  // nombre viejo se conserva por si otra propuesta lo usa.
  const cards = ((data && (data.proyecto || data.partidos)) || {}).cards || [];
  return cards.map((c) => {
    const v = propuestas.porId(c.variante);
    if (!v) return null;
    return Object.assign({}, c, {
      url: `/${lang}/${v.slug}`,
      abierto: !propuestas.enNegociacion(v)
    });
  }).filter(Boolean);
}

/**
 * La dona del destino del capital. Se calcula aquí y no en el contenido para
 * que siga a las cifras: cambiar un importe del desglose recalcula el gráfico
 * y la leyenda, sin tocar porcentajes a mano.
 *
 * Los colores salen de la familia del logo (el azul aclarado y sus tonos) más
 * dos grises; todos pasan de 3.0 de contraste sobre la tarjeta, que es lo que
 * pide un gráfico.
 */
// Azul y gris alternados: tres azules seguidos no se distinguían entre sí en
// la dona. Así cada segmento contrasta con el de al lado.
const DONUT_COLORES = ['#6B93EC', '#C9CCD4', '#8AADF4', '#8A93A6', '#A8C2F8', '#6E7689'];
function donutCostos(data) {
  const lineas = ((data && data.costos) || {}).lineas || [];
  const valores = lineas.map(l => Number(String(l.monto).replace(/[^0-9.]/g, '')) || 0);
  const total = valores.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const R = 60, C = 2 * Math.PI * R;
  let acumulado = 0;
  const segmentos = lineas.map((l, i) => {
    const frac = valores[i] / total;
    const largo = frac * C;
    const seg = {
      concepto: l.concepto,
      monto: l.monto,
      color: DONUT_COLORES[i % DONUT_COLORES.length],
      pct: (frac * 100).toFixed(frac * 100 >= 10 ? 0 : 1),
      dash: largo.toFixed(2) + ' ' + (C - largo).toFixed(2),
      offset: (-acumulado).toFixed(2)
    };
    acumulado += largo;
    return seg;
  });
  return { segmentos, total };
}

/**
 * Las gráficas del perfil anual. Se calculan aquí, a partir de los números del
 * contenido, para que una cifra que cambie mueva su gráfica sola. Nada se
 * inventa: la única cifra derivada es la cobertura del costo (costo ÷ ticket =
 * boletos), que ya se publicaba en el perfil del partido 1.
 */
function graficosTour(data) {
  const num = v => Number(String(v == null ? '' : v).replace(/[^0-9.]/g, '')) || 0;
  const usd = n => 'USD ' + Math.round(n).toLocaleString('en-US');
  const g = {};

  // 70 / 30: la barra partida.
  g.reparto = (((data.participacion || {}).partes) || []).map(p => ({ pct: num(p.pct), quien: p.quien }));

  // Capital: la barra apilada, cada tramo a su medida. Antes los tres iban
  // iguales porque no había cifras; ahora el partido 1 pesa el 71 % y cada
  // anticipo el 14 %. El mínimo de 10 % evita que un tramo quede ilegible.
  const tramos = ((data.capital || {}).items) || [];
  const totalCapital = tramos.reduce((a, t) => a + num(t.monto), 0);
  g.capital = tramos.map(t => {
    const pct = totalCapital ? Math.max(10, Math.round(num(t.monto) / totalCapital * 100)) : Math.round(100 / (tramos.length || 1));
    // En un tramo estrecho el rótulo no cabe y se recorta a "PARTI…": se
    // deja solo la cifra, que es lo que importa; las tarjetas de debajo ya
    // dicen de qué partido es cada una.
    return { label: t.label, value: t.value, pct, conRotulo: pct >= 25 };
  });

  // 10 % → 70 % → 7 %: tres barras encadenadas.
  g.ejemplo = (((data.ejemplo || {}).pasos) || []).map(p => ({ pct: num(p.value), value: p.value, label: p.label }));

  // Referencia de marzo: la ecuación y la cobertura del costo.
  const r = ((data.referencia || {}).numeros) || {};
  const col1 = (((data.potencial || {}).columnas) || [])[0] || {};
  const costo1 = num(col1.numeros && col1.numeros.costo);
  if (r.boletos && r.ticket) {
    g.taquilla = { boletos: r.boletos.toLocaleString('en-US'), ticket: usd(r.ticket), total: usd(r.boletos * r.ticket) };
    if (costo1) {
      const boletosEq = Math.ceil(costo1 / r.ticket);
      g.equilibrio = {
        boletos: boletosEq.toLocaleString('en-US'),
        pct: Math.round(boletosEq / r.boletos * 1000) / 10,
        pctEntero: Math.round(boletosEq / r.boletos * 100)
      };
    }
  }

  // Potencial: costo vs. taquilla a lleno del partido 1, en la misma escala.
  if (costo1 && r.taquilla) {
    const tope = Math.max(costo1, r.taquilla);
    g.potencial = {
      barras: [
        { label: (data.potencial || {}).barraCosto || 'Costo', valor: usd(costo1), pct: Math.round(costo1 / tope * 100) },
        { label: (data.potencial || {}).barraTaquilla || 'Taquilla', valor: usd(r.taquilla), pct: Math.round(r.taquilla / tope * 100) }
      ],
      veces: (r.taquilla / costo1).toFixed(2) + 'x'
    };
  }

  // Calendario: dónde cae cada hito en la regla del año (13 casillas: 2026 + 12 meses).
  const hitos = ((data.calendario || {}).hitos) || [];
  g.regla = hitos.map(h => {
    const m = Array.isArray(h.mes) ? h.mes : [0, 0];
    const ini = Math.max(0, Math.min(12, m[0])), fin = Math.max(ini, Math.min(12, m[1]));
    return { etapa: h.etapa, cuando: h.cuando, left: (ini / 13 * 100).toFixed(2), width: ((fin - ini + 1) / 13 * 100).toFixed(2) };
  });

  return g;
}

/**
 * La propuesta de un partido, ajustada al NIVEL del código con que se entró.
 *
 * La regla: con un código de TOUR toda la participación es a riesgo y el
 * mínimo del partido sube a USD $100,000. Con un código de ese solo partido no
 * cambia nada: las dos modalidades y el mínimo de USD $30,000 de siempre.
 *
 * Lo que cambia no se escribe aquí, se lee del bloque `nivelTour` del archivo
 * de contenido: son cifras y mensajes de negocio y se ajustan sin desplegar.
 * Este código solo sabe aplicar un parche por rutas.
 *
 * El bloque `nivelTour` se quita SIEMPRE antes de devolver los datos, también
 * cuando no se aplica: lo que no se ofrece tampoco tiene por qué viajar.
 */
function vistaDeNivel(data, acceso) {
  if (!data || !data.nivelTour) return data;
  const esTour = !!acceso && acceso.nivel === 'tour';
  const d = JSON.parse(JSON.stringify(data));
  const parche = d.nivelTour;
  delete d.nivelTour;
  if (!esTour) return d;

  const tramos = ruta => String(ruta).split('.');
  const padre = (obj, ruta) => {
    const t = tramos(ruta);
    const ultimo = t.pop();
    const p = t.reduce((o, k) => (o == null ? undefined : o[k]), obj);
    return [p, ultimo];
  };

  for (const ruta of parche.quitar || []) {
    const [p, k] = padre(d, ruta);
    if (p && typeof p === 'object') delete p[k];
  }
  for (const ruta of Object.keys(parche.cambios || {})) {
    const [p, k] = padre(d, ruta);
    // Si la ruta no existe se avisa en vez de crear un campo fantasma que
    // nadie pinta: sería un cambio de negocio perdido en silencio.
    if (!p || typeof p !== 'object') {
      console.error('nivelTour: ruta inexistente, no se aplicó -> ' + ruta);
      continue;
    }
    p[k] = parche.cambios[ruta];
  }
  return d;
}

/**
 * La dirección de vuelta al tour desde un partido, o `null`.
 *
 * Solo para quien entró con un código de NIVEL TOUR: con un código de partido
 * el tour no se abre, así que ofrecer la liga sería mandarlo a un candado que
 * su código no levanta. Desde el propio tour tampoco se ofrece, claro.
 */
async function vueltaAlTour(req, variante, lang) {
  if (!variante || variante.tipo === 'tour') return null;
  const acceso = propuestas.accesoDe(req);
  if (!acceso || acceso.nivel !== 'tour') return null;
  const tour = propuestas.porTipo('tour');
  if (!tour || !(await propuestas.visible(tour))) return null;
  return `/${lang}/${tour.slug}`;
}

/** Qué partial va detrás del candado: el perfil anual, un aviso o la propuesta. */
function partialDe(variante) {
  if (variante.tipo === 'tour') return 'partials/proyecto-anual';
  if (propuestas.enNegociacion(variante)) return 'partials/propuesta-negociacion';
  return 'partials/propuesta-contenido';
}

function renderPropuesta(variante) {
  return async (req, res, next) => {
    const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;

    // Las propuestas ocultas responden 404 mientras su interruptor esté apagado
    if (!(await propuestas.visible(variante))) return next();

    // Regla de acceso: desde un partido no se ve el tour. Quien ya entró con
    // un código de partido y abre la página del tour vuelve a la suya, en vez
    // de quedarse mirando un candado que su código no abre.
    if (variante.tipo === 'tour') {
      const acceso = propuestas.accesoDe(req);
      if (acceso && acceso.nivel !== 'tour') {
        const suyo = await propuestas.destino(acceso);
        if (suyo) return res.redirect(302, `/${lang}/${suyo.slug}`);
      }
    }

    // Idioma. `leerContenido` cae al idioma por defecto cuando falta el que se
    // pide, y lo hace en silencio: eso dejaba /en/socceridcup2027 marcando
    // "EN" como activo mientras servía el español entero.
    //
    // La puerta y lo que hay detrás se tratan distinto, porque no son lo
    // mismo. El CANDADO se sirve siempre en el idioma que se pide, aunque la
    // propuesta de dentro no esté traducida: es lo primero que ve alguien que
    // llega por un enlace, antes de teclear nada, y dejarlo sin su idioma es
    // cerrarle la puerta en la cara. El CONTENIDO, en cambio, solo existe en
    // los idiomas que existen: una vez dentro se corrige la dirección, para
    // que la URL diga lo que de verdad se está sirviendo.
    const idiomas = propuestas.idiomasDe(variante, SUPPORTED_LANGS);
    const autorizado = propuestas.tieneAcceso(req, variante);
    if (autorizado && !idiomas.includes(lang)) {
      return res.redirect(302, `/${idiomas[0]}/${variante.slug}`);
    }

    try {
      const langContenido = idiomas.includes(lang) ? lang : idiomas[0];
      const crudo = propuestas.leerContenido(variante, langContenido, DEFAULT_LANG);
      if (!crudo) return next();
      // Qué se ofrece depende del nivel del código con que se entró.
      const data = vistaDeNivel(crudo, propuestas.accesoDe(req));
      // Los textos de la puerta, en el idioma pedido pase lo que pase.
      const lock = propuestas.textosCandado(variante, lang, DEFAULT_LANG);

      // Notas de medios agregadas de las ediciones pasadas (desde la base de
      // datos). Aqui va SOLO la cobertura de nuestros eventos: una nota de
      // prensa sobre un club, aunque sostenga el argumento de la propuesta, va
      // enlazada en su tarjeta de antecedente, no en esta seccion.
      const mediaLinks = await cupEditions.mediaLinks(lang);

      const isEs = lang === 'es';
      const ogTitle = isEs ? 'SOCCER iD CUP — Confidencial Inversión' : 'SOCCER iD CUP — Confidential Investment';
      const ogDesc = isEs ? 'Acceso restringido. Se requiere código de autorización.' : 'Restricted access. Authorization code required.';

      res.render('socceridcup-project2027', {
        layout: 'promo',
        title: ogTitle,
        description: ogDesc,
        ogTitle: ogTitle,
        ogDescription: ogDesc,
        ogImage: '/assets/images/iconsoccerid.png',
        ogLocale: isEs ? 'es_ES' : 'en_US',
        lang: lang,
        baseUrl: BASE_URL,
        currentPath: '/' + variante.slug,
        isEs: isEs,
        isEn: lang === 'en',
        data: data,
        mediaLinks: mediaLinks,
        // Identidad de la propuesta: la vista la usa para sus enlaces de idioma,
        // la llave de sesión del candado y el campo `variant` del formulario.
        slug: variante.slug,
        gateKey: variante.gateKey,
        variantId: variante.id,
        // Foto del hero y del cierre: la del partido de esta propuesta.
        heroImage: variante.hero,
        robots: variante.noindex ? 'noindex,nofollow' : null,
        // Solo con la cookie de acceso se manda el contenido de la propuesta.
        // Sin ella la página es únicamente el candado.
        autorizado: autorizado,
        // Un partido que todavía se negocia enseña el aviso en lugar de la
        // propuesta: la página existe, el contenido todavía no.
        enNegociacion: propuestas.enNegociacion(variante),
        esTour: variante.tipo === 'tour',
        urlTour: await vueltaAlTour(req, variante, langContenido),
        // El candado se lee en los dos idiomas siempre. Dentro, en cambio,
        // solo se ofrece el idioma que existe: un conmutador que lleva a la
        // misma página en el mismo idioma es peor que no tenerlo.
        lock: lock,
        hayEn: idiomas.includes('en'),
        logo: variante.logo || null,
        ventana: variante.ventana || null,
        partidosNav: navPartidos(data, lang),
        donut: donutCostos(data),
        graficos: graficosTour(data),
        urlPartido1: `/${lang}/${propuestas.porDefecto().slug}`,
        year: new Date().getFullYear(),
        version: APP_VERSION
      });
    } catch (e) {
      console.error('Error cargando la propuesta ' + variante.id + ':', e);
      next();
    }
  };
}

// Contenido de la propuesta, ya sin el candado. Es lo que pide la página justo
// después de validar el código, para mostrarla sin recargar. Vuelve a
// comprobar la cookie de acceso: no basta con conocer la dirección.
app.get('/api/propuesta/:id/contenido', async (req, res, next) => {
  const variante = propuestas.porId(req.params.id);
  if (!variante) return next();
  if (!(await propuestas.visible(variante))) return next();
  if (!propuestas.tieneAcceso(req, variante)) return res.status(403).send('');

  const pedido = SUPPORTED_LANGS.includes(req.query.lang) ? req.query.lang : DEFAULT_LANG;
  // El contenido se INYECTA en la página, no se navega: aquí no sirve el
  // redirect de la ruta normal. Si la propuesta no existe en el idioma que se
  // pide se manda el que hay, y se dice cuál en la cabecera para que el
  // navegador corrija la dirección en vez de seguir anunciando un idioma que
  // no se está viendo.
  const idiomas = propuestas.idiomasDe(variante, SUPPORTED_LANGS);
  const lang = idiomas.includes(pedido) ? pedido : idiomas[0];
  try {
    const crudo = propuestas.leerContenido(variante, lang, DEFAULT_LANG);
    if (!crudo) return next();
    const data = vistaDeNivel(crudo, propuestas.accesoDe(req));
    res.set('Cache-Control', 'no-store');
    res.set('X-Idioma-Servido', lang);
    res.render(partialDe(variante), {
      layout: false,
      ventana: variante.ventana || null,
      heroImage: variante.hero,
      logo: variante.logo || null,
      partidosNav: navPartidos(data, lang),
      donut: donutCostos(data),
      graficos: graficosTour(data),
      urlPartido1: `/${lang}/${propuestas.porDefecto().slug}`,
      lang: lang,
      isEs: lang === 'es',
      isEn: lang === 'en',
      // Faltaba: sin esto el conmutador de dentro desaparecía también en las
      // propuestas que SÍ están en los dos idiomas.
      hayEn: idiomas.includes('en'),
      urlTour: await vueltaAlTour(req, variante, lang),
      data: data,
      mediaLinks: await cupEditions.mediaLinks(lang),
      slug: variante.slug,
      baseUrl: BASE_URL,
      year: new Date().getFullYear()
    });
  } catch (e) {
    console.error('Error sirviendo el contenido de ' + variante.id + ':', e);
    next();
  }
});

// Rutas de TODAS las propuestas: la que está en vivo y las que quedan
// guardadas por si se vuelve al partido anterior. El enrutador no decide quién
// se sirve —eso lo dice el interruptor de `lib/propuestas.js`—, así que
// cambiar de propuesta en vivo no toca este bloque. Queda registrado aquí,
// antes del catch-all /:lang/:page.
propuestas.listar().forEach((variante) => {
  app.get('/:lang/' + variante.slug, renderPropuesta(variante));
  // El redirect sin idioma también comprueba el interruptor: si redirigiera
  // siempre, el 302 confirmaría que el slug existe.
  app.get('/' + variante.slug, async (req, res, next) => {
    if (!(await propuestas.visible(variante))) return next();
    res.redirect(302, `/${detectLanguage(req)}/${variante.slug}`);
  });
});

// Una propuesta guardada presta su dirección mientras está apagada: los
// enlaces que ya se mandaron llevan a la propuesta en vivo en vez de morir en
// un 404. Si se vuelve a encender, su dirección vuelve a ser suya: estos
// handlers se registran después y solo corren cuando el de arriba, al estar
// apagada, responde `next()`.
propuestas.listar().filter(v => v.oculta).forEach((variante) => {
  const aLaPropuestaViva = async (req, res, next) => {
    const viva = propuestas.porDefecto();
    if (viva.id === variante.id || !(await propuestas.visible(viva))) return next();
    const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : detectLanguage(req);
    res.redirect(302, `/${lang}/${viva.slug}`);
  };
  app.get('/:lang/' + variante.slug, aLaPropuestaViva);
  app.get('/' + variante.slug, aLaPropuestaViva);
});

// Rate-limit simple del acceso público (anti fuerza-bruta de códigos de 7
// dígitos): máx 30 intentos por IP cada 10 minutos. En memoria; suficiente para
// frenar enumeración sin infra extra.
const _verifyHits = new Map();
function verifyThrottled(ip) {
  const now = Date.now(), win = 10 * 60 * 1000, max = 30;
  const arr = (_verifyHits.get(ip) || []).filter(t => now - t < win);
  arr.push(now);
  _verifyHits.set(ip, arr);
  if (_verifyHits.size > 5000) { for (const [k, v] of _verifyHits) { if (!v.length || now - v[v.length - 1] > win) _verifyHits.delete(k); } }
  return arr.length > max;
}

app.post('/api/project2027/verify', async (req, res) => {
  try {
    const ipReq = String(req.headers['x-forwarded-for'] || req.ip || '').split(',')[0].trim();
    if (verifyThrottled(ipReq)) return res.status(429).json({ ok: false, throttled: true });
    const code = (req.body.code || '').trim().slice(0, 40);
    if (!code) return res.json({ ok: false });

    // Desde qué propuesta se está entrando. Nunca se confía en lo que manda el
    // cliente: si no coincide con el registro, cae en la propuesta en vivo.
    const variante = propuestas.desdeCliente(req.body.variant);

    const codeRow = await knex('access_codes').where({ code }).first();
    if (!codeRow) return res.json({ ok: false });
    // Código bloqueado por el organizador (control de filtraciones): se niega la
    // entrada, pero queda registrado el intento para el mapa.
    if (codeRow.revoked) {
      const ip = req.headers['x-forwarded-for'] || req.ip;
      await knex('access_log').insert({ code, name: (req.body.name || '').trim().slice(0, 120) || null, email: (req.body.email || '').trim().toLowerCase().slice(0, 160) || null, ip, user_agent: (req.headers['user-agent'] || '').slice(0, 400), new_device: false, matched_owner: null, blocked: true }).catch(() => {});
      return res.json({ ok: false, revoked: true });
    }
    const isTest = codeRow.note === 'test';

    // Hasta dónde llega este código: el tour entero o un solo partido. Los
    // códigos sin nivel —los repartidos antes de que existieran los niveles—
    // no abren nada hasta que el organizador se lo ponga en el admin. Se
    // responde antes de registrar nada: no hay entrada que apuntar.
    const alcance = propuestas.alcanceDe(codeRow);
    if (!alcance) return res.json({ ok: false, sinNivel: true });

    // Identificación de dispositivo por cookie
    let deviceId = req.cookies && req.cookies.p2027_device;
    const knownDevice = !!deviceId;

    let name = (req.body.name || '').trim().slice(0, 120);
    let email = (req.body.email || '').trim().toLowerCase().slice(0, 160);
    const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);

    // Dispositivo nuevo → se exige nombre y email antes de dar acceso
    if (!knownDevice) {
      if (!name || !validEmail) return res.json({ ok: false, needLead: true });
      deviceId = crypto.randomBytes(16).toString('hex');
      res.cookie('p2027_device', deviceId, { httpOnly: true, secure: isProduction, sameSite: 'lax', maxAge: 365 * 24 * 60 * 60 * 1000 });
    }

    // Registro / actualización del prospecto (lead)
    let leadId = null;
    if (email && validEmail) {
      const existing = await knex('leads').where({ email }).first();
      if (existing) {
        leadId = existing.id;
        if (name && !existing.name) await knex('leads').where({ id: leadId }).update({ name, updated_at: knex.fn.now() });
      } else {
        const ins = await knex('leads').insert({ name: name || null, email }).returning('id');
        leadId = Array.isArray(ins) ? (ins[0] && ins[0].id != null ? ins[0].id : ins[0]) : ins;
      }
    } else if (knownDevice) {
      const last = await knex('access_log').where({ device_id: deviceId }).whereNotNull('lead_id').orderBy('id', 'desc').first();
      if (last) {
        leadId = last.lead_id;
        if (!name) name = last.name || '';
        if (!email) email = last.email || '';
      }
    }

    const ip = String(req.headers['x-forwarded-for'] || req.ip || '').slice(0, 100);
    const userAgent = (req.headers['user-agent'] || '').slice(0, 400);
    // ¿Entró el dueño del código o alguien más? (null si no se puede saber)
    const matchedOwner = require('./lib/codeMap').matchOwner(codeRow, { name, email });
    await knex('access_log').insert({
      code, lead_id: leadId, device_id: deviceId,
      name: name || null, email: email || null, ip, user_agent: userAgent, new_device: !knownDevice,
      matched_owner: matchedOwner
    });

    // Marca el código como usado (salvo el de prueba)
    if (codeRow.status === 'unused' && !isTest) {
      await knex('access_codes').where({ id: codeRow.id }).update({ status: 'used', updated_at: knex.fn.now() });
    }

    const cdmxTime = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', hour12: true });
    console.log(`[PROJECT 2027] Acceso código ${code}${isTest ? ' (PRUEBA)' : ''} — ${name || '—'} / ${email || '—'} — ${cdmxTime}`);

    // Notificación por email a los administradores (el código de prueba NO envía correo)
    if (!isTest) {
      project2027.sendAccessNotification({ code, ip, userAgent, name, email, newDevice: !knownDevice }).catch(() => {});
      // Además queda en el log de notificaciones del admin. Sin email: ya salió
      // arriba y no tiene caso mandar el mismo aviso dos veces.
      const quien = matchedOwner === false
        ? ' · OTRA PERSONA, no el dueño del código'
        : (matchedOwner === true ? ' · es el dueño del código' : '');
      require('./lib/panelNotify').notifyAdmins({
        type: 'codigo',
        title: `Acceso con el código ${code}`,
        body: `${name || 'Sin nombre'} · ${email || 'sin correo'}${knownDevice ? '' : ' · dispositivo nuevo'}${quien}`,
        channels: []
      }).catch(() => {});
    }

    // Cookie de acceso firmada: a partir de aquí el servidor sí manda el
    // contenido de la propuesta. Antes de esto el candado era solo de
    // presentación y la propuesta viajaba igual en el HTML. La cookie carga el
    // nivel: de él depende qué páginas se abren.
    propuestas.darAcceso(res, alcance, isProduction);

    // Si el código no abre la página desde la que se escribió —un código de
    // partido tecleado en el tour—, se le dice al navegador a dónde sí puede
    // ir, en vez de dejarlo atorado.
    const lang = SUPPORTED_LANGS.includes(req.body.lang) ? req.body.lang : detectLanguage(req);
    if (alcance.variantes.indexOf(variante.id) === -1 || !(await propuestas.visible(variante))) {
      const suyo = await propuestas.destino(alcance);
      if (!suyo) return res.json({ ok: false });
      return res.json({ ok: true, ir: `/${lang}/${suyo.slug}` });
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('Error verificando código 2027:', e.message);
    return res.json({ ok: false });
  }
});

// ============================================================
// PÁGINA DE EDICIÓN SOCCER iD CUP (socceridcup/:year)
// ============================================================
app.get('/:lang/socceridcup/:year', async (req, res, next) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;
  const year = req.params.year;

  try {
    const nav = await cupEditions.detail(year, lang);
    if (!nav || !nav.edition) return next();
    const edition = nav.edition;

    const isEs = lang === 'es';
    edition.imageCount = edition.images ? edition.images.length : 0;
    const ogTitle = `${edition.title} | SOCCER iD`;
    const ogDesc = edition.description;
    const ogImage = edition.banner || '/assets/images/og-image.jpg';

    const prevEdition = nav.prev;
    const nextEdition = nav.next;

    res.render('socceridcup-edition', {
      layout: 'promo',
      title: ogTitle,
      description: ogDesc,
      ogTitle: ogTitle,
      ogDescription: ogDesc,
      ogImage: ogImage,
      ogLocale: isEs ? 'es_ES' : 'en_US',
      lang: lang,
      baseUrl: BASE_URL,
      currentPath: `/socceridcup/${year}`,
      isEs: isEs,
      isEn: lang === 'en',
      edition: edition,
      prevEdition: prevEdition,
      nextEdition: nextEdition,
      year: new Date().getFullYear(),
      version: APP_VERSION
    });
  } catch (e) {
    console.error('Error cargando edición:', e);
    next();
  }
});

app.get('/socceridcup/:year', (req, res) => {
  const lang = detectLanguage(req);
  res.redirect(302, `/${lang}/socceridcup/${req.params.year}`);
});

app.get('/cupid', (req, res) => {
  const lang = detectLanguage(req);
  res.redirect(301, `/${lang}/socceridcup`);
});

// ============================================================
// PANEL DE INVERSIONISTAS / PATROCINADORES (Fase 2: login + BD + admin)
// ============================================================
app.use('/panel', require('./routes/panel'));

// Rutas legales sin idioma (redirigen)
app.get('/terms', (req, res) => {
  const lang = detectLanguage(req);
  res.redirect(301, `/${lang}/terms`);
});

app.get('/privacy', (req, res) => {
  const lang = detectLanguage(req);
  res.redirect(301, `/${lang}/privacy`);
});

// ============================================================
// RUTAS PRINCIPALES CON IDIOMA
// ============================================================

// Ruta raíz - redirige al idioma detectado
app.get('/', (req, res) => {
  const lang = detectLanguage(req);
  res.redirect(302, `/${lang}`);
});

// Página principal con idioma
app.get('/:lang', (req, res, next) => {
  const lang = req.params.lang;
  
  if (!SUPPORTED_LANGS.includes(lang)) {
    return next();
  }
  
  res.cookie('lang', lang, { 
    maxAge: 365 * 24 * 60 * 60 * 1000, 
    httpOnly: false,
    domain: isProduction ? '.soccerid.co' : undefined
  });
  
  res.render('index', loadViewData(lang, '/'));
});

// Otras páginas con idioma
app.get('/:lang/:page', (req, res, next) => {
  const { lang, page } = req.params;
  
  if (!SUPPORTED_LANGS.includes(lang)) {
    return next();
  }
  
  if (['admin', 'blog', 'api', 'assets', 'public', 'uploads', 'images', 'contents'].includes(page)) {
    return next();
  }
  
  const viewPath = path.join(__dirname, 'views', page + '.hbs');
  
  if (fs.existsSync(viewPath)) {
    res.cookie('lang', lang, { 
      maxAge: 365 * 24 * 60 * 60 * 1000, 
      httpOnly: false,
      domain: isProduction ? '.soccerid.co' : undefined
    });
    res.render(page, loadViewData(lang, `/${page}`));
  } else {
    res.status(404).render('index', { 
      ...loadViewData(lang, '/'), 
      error: 'Página no encontrada' 
    });
  }
});

// Páginas sin prefijo de idioma - redirigen
app.get('/:page', (req, res, next) => {
  const page = req.params.page;
  
  if (['admin', 'blog', 'api', 'assets', 'public', 'uploads', 'images', 'contents', 'favicon.ico', 'robots.txt', 'sitemap.xml'].includes(page)) {
    return next();
  }
  
  const viewPath = path.join(__dirname, 'views', page + '.hbs');
  
  if (fs.existsSync(viewPath)) {
    const lang = detectLanguage(req);
    res.redirect(302, `/${lang}/${page}`);
  } else {
    next();
  }
});

// ============================================================
// ERRORES
// ============================================================
app.use((req, res) => {
  const lang = detectLanguage(req);
  res.status(404).json({ error: 'No encontrado', lang });
});

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error del servidor' });
});

// ============================================================
// INICIAR SERVIDOR
// ============================================================
app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('  GKRAKEN CMS - SERVIDOR INICIADO');
  console.log('='.repeat(60));
  console.log(`  🆔 Versión:     ${APP_VERSION}`);
  console.log(`  🌐 URL Local:   http://localhost:${PORT}`);
  console.log(`  🌐 URL Base:    ${BASE_URL}`);
  console.log(`  🌍 Idiomas:     ${SUPPORTED_LANGS.join(', ')} (default: ${DEFAULT_LANG})`);
  console.log(`  🔐 Admin:       ${BASE_URL}/panel/admin`);
  console.log(`  📝 Blog:        ${BASE_URL}/blog`);
  console.log(`  🔧 Entorno:     ${isProduction ? '🔴 PRODUCCIÓN' : '🟢 DESARROLLO'}`);
  console.log('='.repeat(60));
  console.log('  📦 RUTAS DE IDIOMA:');
  console.log(`      ${BASE_URL}/es  → Español`);
  console.log(`      ${BASE_URL}/en  → English`);
  console.log('='.repeat(60));
  if (isProduction) {
    console.log('  ⚠️  MODO PRODUCCIÓN ACTIVO');
    console.log('      - Cookies con dominio .soccerid.co');
    console.log('      - Cache de vistas habilitado');
    console.log('      - Trust proxy activado');
  }
  console.log('='.repeat(60));
  console.log('');

  // Inicializar base de datos del panel de inversionistas
  require('./db/schema').init().then(() => {
    // Recordatorios de fecha de entrega: una pasada al arrancar y otra cada 24 h.
    // No hay cron en Heroku sin add-on, y el dyno se reinicia al menos a diario,
    // así que esto basta. La marca `reminded_at` evita repetir el mismo aviso.
    const { recordarEntregas } = require('./lib/panelNotify');
    const revisar = () => recordarEntregas().catch(e => console.error('✗ Recordatorios de entrega:', e.message));
    setTimeout(revisar, 30000);
    setInterval(revisar, 24 * 60 * 60 * 1000).unref();
  }).catch(err => {
    console.error('✗ Error inicializando base de datos del panel:', err.message);
  });
});
