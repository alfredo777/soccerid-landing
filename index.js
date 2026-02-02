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
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

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
      return key; // Retornar la clave si no se encuentra
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
  cookie: { secure: isProduction, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
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
    eq: (a, b) => a === b,
    neq: (a, b) => a !== b,
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
    }
  }
});

const registerHelpers = require('./helpers');
registerHelpers(hbs.handlebars);

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', false);

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Variables globales para vistas
app.use((req, res, next) => {
  res.locals.year = new Date().getFullYear();
  res.locals.version = APP_VERSION;
  res.locals.baseUrl = BASE_URL;
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
const adminRoutes = require('./routes/admin');
const blogRoutes = require('./routes/blog');

app.use('/admin', adminRoutes);
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
    defaultLang: DEFAULT_LANG
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
    res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
    res.json({ success: true, lang });
  } else {
    res.status(400).json({ error: 'Idioma no soportado' });
  }
});

app.post('/api/clear-cache', (req, res) => {
  clearAllCache();
  loadTranslations(); // Recargar traducciones
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
    ogTitle: translations?.meta?.ogTitle || translations?.meta?.title || 'SOCCER iD',
    ogDescription: translations?.meta?.ogDescription || translations?.meta?.description || '',
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
          
          // Si el contenido tiene estructura de idiomas, extraer el idioma actual
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
  
  // Verificar si es un idioma soportado
  if (!SUPPORTED_LANGS.includes(lang)) {
    return next(); // Pasar al siguiente middleware
  }
  
  // Establecer cookie de idioma
  res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
  
  res.render('index', loadViewData(lang, '/'));
});

// Otras páginas con idioma
app.get('/:lang/:page', (req, res, next) => {
  const { lang, page } = req.params;
  
  // Verificar si es un idioma soportado
  if (!SUPPORTED_LANGS.includes(lang)) {
    return next();
  }
  
  // Ignorar rutas especiales
  if (['admin', 'blog', 'api', 'assets', 'public', 'uploads', 'images', 'contents'].includes(page)) {
    return next();
  }
  
  const viewPath = path.join(__dirname, 'views', page + '.hbs');
  
  if (fs.existsSync(viewPath)) {
    res.cookie('lang', lang, { maxAge: 365 * 24 * 60 * 60 * 1000, httpOnly: false });
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
  
  // Ignorar rutas especiales
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
  console.log(`  🌐 URL:         ${BASE_URL}`);
  console.log(`  🌍 Idiomas:     ${SUPPORTED_LANGS.join(', ')} (default: ${DEFAULT_LANG})`);
  console.log(`  🔐 Admin:       ${BASE_URL}/admin`);
  console.log(`  📝 Blog:        ${BASE_URL}/blog`);
  console.log(`  🔧 Entorno:     ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
  console.log('='.repeat(60));
  console.log('  📦 RUTAS DE IDIOMA:');
  console.log(`      ${BASE_URL}/es  → Español`);
  console.log(`      ${BASE_URL}/en  → English`);
  console.log('='.repeat(60));
  console.log('');
});
