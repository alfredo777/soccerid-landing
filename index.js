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
app.get('/contents/:filename', (req, res) => {
  res.set('Cache-Control', 'no-store');
  
  let filename = req.params.filename;
  if (filename.endsWith('.json')) {
    filename = filename.slice(0, -5);
  }
  
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

app.get('/api/contents', (req, res) => {
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
    const ogImage = articulo.image || '/assets/images/share.jpg';

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
    const ogImage = galeria.banner || '/assets/images/og/share.jpg';

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
app.get('/:lang/socceridcup', (req, res, next) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;

  const galeriaPath = path.join(__dirname, 'contents', 'gallery_pages.json');
  if (!fs.existsSync(galeriaPath)) return next();

  try {
    const galleries = JSON.parse(fs.readFileSync(galeriaPath, 'utf8'));
    const langGalleries = galleries[lang] || galleries[DEFAULT_LANG] || [];
    const galeria = langGalleries.find(g => g.id === 'soccer-id-cup-2027');

    if (!galeria) return next();

    const isEs = lang === 'es';
    galeria.imageCount = galeria.images ? galeria.images.length : 0;
    const ogTitle = `${galeria.title} | SOCCER iD`;
    const ogDesc = galeria.description;
    const ogImage = galeria.banner || '/assets/images/og/share.jpg';

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
// PÁGINA SOCCER iD CUP PROJECT 2027 (socceridcup2027)
// ============================================================
app.get('/:lang/socceridcup2027', (req, res, next) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;

  const dataPath = path.join(__dirname, 'contents', 'cup_project_2027.json');
  if (!fs.existsSync(dataPath)) return next();

  try {
    const allData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
    const data = allData[lang] || allData[DEFAULT_LANG];

    const editionsPath = path.join(__dirname, 'contents', 'cup_editions.json');
    let mediaLinks = [];
    try {
      const editionsData = JSON.parse(fs.readFileSync(editionsPath, 'utf8'));
      const editions = editionsData[lang] || editionsData[DEFAULT_LANG] || {};
      ['2023', '2024', '2025'].forEach(y => {
        if (editions[y] && editions[y].mediaLinks) mediaLinks = mediaLinks.concat(editions[y].mediaLinks);
      });
    } catch (_) {}

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
      currentPath: '/socceridcup2027',
      isEs: isEs,
      isEn: lang === 'en',
      data: data,
      mediaLinks: mediaLinks,
      year: new Date().getFullYear(),
      version: APP_VERSION
    });
  } catch (e) {
    console.error('Error cargando project 2027:', e);
    next();
  }
});

app.post('/api/project2027/verify', (req, res) => {
  const { code } = req.body;
  if (!code) return res.json({ ok: false });

  const codesPath = path.join(__dirname, 'contents', 'cup_project_2027_codes.json');
  try {
    const codesData = JSON.parse(fs.readFileSync(codesPath, 'utf8'));
    if (!codesData.codes.includes(code.trim())) return res.json({ ok: false });

    const logEntry = {
      code: code.trim(),
      timestamp: new Date().toISOString(),
      ip: req.headers['x-forwarded-for'] || req.ip,
      userAgent: req.headers['user-agent']
    };

    const logPath = path.join(__dirname, 'data', 'project2027_access.json');
    const logDir = path.join(__dirname, 'data');
    if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

    let logs = [];
    if (fs.existsSync(logPath)) {
      try { logs = JSON.parse(fs.readFileSync(logPath, 'utf8')); } catch (e) { logs = []; }
    }
    logs.push(logEntry);
    fs.writeFileSync(logPath, JSON.stringify(logs, null, 2));

    const cdmxTime = new Date().toLocaleString('es-MX', { timeZone: 'America/Mexico_City', year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });

    console.log(`[PROJECT 2027] Acceso con código ${code.trim()} — ${cdmxTime}`);

    try {
      const nodemailer = require('nodemailer');
      const transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST || 'smtp.mailgun.org',
        port: parseInt(process.env.SMTP_PORT || '587'),
        secure: false,
        auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
      });

      const htmlEmail = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,Helvetica,sans-serif;">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f4;padding:32px 0;">
<tr><td align="center">
<table width="600" cellpadding="0" cellspacing="0" style="background:#111;border-radius:12px;overflow:hidden;">
  <tr><td style="background:#000;padding:32px 40px;text-align:center;">
    <img src="https://soccerid.co/assets/images/soccerid.png" alt="SOCCER iD" height="36" style="display:inline-block;">
  </td></tr>
  <tr><td style="padding:40px;">
    <table width="100%" cellpadding="0" cellspacing="0" style="background:rgba(212,175,55,0.1);border-left:4px solid #d4af37;border-radius:8px;padding:16px 20px;margin-bottom:32px;">
      <tr><td style="color:#d4af37;font-size:14px;font-weight:700;letter-spacing:1px;">ALERTA DE ACCESO — PROJECT 2027</td></tr>
    </table>
    <p style="color:rgba(255,255,255,0.7);font-size:14px;margin:0 0 24px;">Se ha registrado un nuevo acceso a la plataforma de inversión SOCCER iD CUP 2027.</p>
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:32px;">
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);font-size:12px;font-weight:700;letter-spacing:1px;width:160px;">CÓDIGO DE ACCESO</td>
        <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);color:#fff;font-size:15px;font-weight:700;letter-spacing:3px;">${code.trim()}</td>
      </tr>
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);font-size:12px;font-weight:700;letter-spacing:1px;">FECHA Y HORA (CDMX)</td>
        <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);color:#fff;font-size:15px;">${cdmxTime}</td>
      </tr>
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);font-size:12px;font-weight:700;letter-spacing:1px;">DIRECCIÓN IP</td>
        <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);color:#fff;font-size:15px;">${logEntry.ip}</td>
      </tr>
      <tr>
        <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);color:rgba(255,255,255,0.5);font-size:12px;font-weight:700;letter-spacing:1px;">NAVEGADOR</td>
        <td style="padding:14px 16px;border-bottom:1px solid rgba(255,255,255,0.08);color:#fff;font-size:14px;">${logEntry.userAgent}</td>
      </tr>
    </table>
    <p style="color:rgba(255,255,255,0.4);font-size:12px;margin:0;">Este es un correo automático generado por SOCCER iD. No responder.</p>
  </td></tr>
  <tr><td style="background:#0a0a0a;padding:20px 40px;text-align:center;">
    <span style="color:rgba(255,255,255,0.3);font-size:11px;">&copy; ${new Date().getFullYear()} SOCCER iD &mdash; Confidencial</span>
  </td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;

      transporter.sendMail({
        from: process.env.SMTP_FROM || '"SOCCER iD" <socceridco@soccerid.co>',
        to: process.env.NOTIFY_EMAILS || 'jardarubydv@gmail.com, leon@soccerid.co, 7leonr@gmail.com',
        subject: `[SOCCER iD] Acceso Project 2027 — código ${code.trim()}`,
        html: htmlEmail,
        text: `Acceso registrado — SOCCER iD CUP 2027\n\nCódigo: ${code.trim()}\nFecha (CDMX): ${cdmxTime}\nIP: ${logEntry.ip}\nNavegador: ${logEntry.userAgent}`
      }).catch(err => console.error('Error enviando notificación:', err.message));
    } catch (mailErr) {
      console.error('Error con nodemailer:', mailErr.message);
    }

    return res.json({ ok: true });
  } catch (e) {
    console.error('Error verificando código:', e);
    return res.json({ ok: false });
  }
});

app.get('/socceridcup2027', (req, res) => {
  const lang = detectLanguage(req);
  res.redirect(302, `/${lang}/socceridcup2027`);
});

// ============================================================
// PÁGINA DE EDICIÓN SOCCER iD CUP (socceridcup/:year)
// ============================================================
app.get('/:lang/socceridcup/:year', (req, res, next) => {
  const lang = SUPPORTED_LANGS.includes(req.params.lang) ? req.params.lang : DEFAULT_LANG;
  const year = req.params.year;

  const editionsPath = path.join(__dirname, 'contents', 'cup_editions.json');
  if (!fs.existsSync(editionsPath)) return next();

  try {
    const editions = JSON.parse(fs.readFileSync(editionsPath, 'utf8'));
    const langEditions = editions[lang] || editions[DEFAULT_LANG] || {};
    const edition = langEditions[year];

    if (!edition) return next();

    const isEs = lang === 'es';
    edition.imageCount = edition.images ? edition.images.length : 0;
    const ogTitle = `${edition.title} | SOCCER iD`;
    const ogDesc = edition.description;
    const ogImage = edition.banner || '/assets/images/og/share.jpg';

    const allYears = Object.keys(langEditions).sort();
    const idx = allYears.indexOf(year);
    const prevEdition = idx > 0 ? { year: allYears[idx - 1], match: langEditions[allYears[idx - 1]].match } : null;
    const nextEdition = idx < allYears.length - 1 ? { year: allYears[idx + 1], match: langEditions[allYears[idx + 1]].match } : null;

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
  require('./db/schema').init().catch(err => {
    console.error('✗ Error inicializando base de datos del panel:', err.message);
  });
});
