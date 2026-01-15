/**
 * GKrakenCMS - Servidor Node.js
 * Proyecto: soccerid-v4-landing
 * 
 * Sistema de caché inteligente:
 * - Limpia todo al reiniciar
 * - Reactiva caché con versión única
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
// VERSIÓN ÚNICA - CAMBIA EN CADA REINICIO
// ============================================================
const APP_VERSION = Date.now().toString(36); // Más corto: "m5abc123"

// ============================================================
// LIMPIEZA TOTAL DE CACHÉ AL INICIAR
// ============================================================
function clearAllCache() {
  console.log('');
  console.log('🧹 LIMPIANDO TODO EL CACHÉ...');
  console.log('-'.repeat(50));
  
  // 1. Limpiar módulos del caché de require
  let modulesCleared = 0;
  Object.keys(require.cache).forEach(key => {
    if (key.includes(__dirname) && !key.includes('node_modules')) {
      delete require.cache[key];
      modulesCleared++;
    }
  });
  console.log(`   ✓ ${modulesCleared} módulos eliminados del caché`);
  
  // 2. Limpiar carpetas de caché
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
  
  // 3. Crear carpeta de caché procesado
  const processedCacheDir = path.join(__dirname, '.processed-cache');
  if (fs.existsSync(processedCacheDir)) {
    fs.rmSync(processedCacheDir, { recursive: true, force: true });
  }
  fs.mkdirSync(processedCacheDir, { recursive: true });
  
  console.log('-'.repeat(50));
  console.log(`✅ CACHÉ LIMPIADO - Nueva versión: ${APP_VERSION}`);
  console.log('');
}

// EJECUTAR LIMPIEZA AL INICIAR
clearAllCache();

// ============================================================
// PROCESAR CSS - AGREGAR VERSIÓN A URLS DE ASSETS
// ============================================================
function processCSSWithVersion(cssContent, version) {
  // Agregar versión a todas las url() en el CSS
  return cssContent.replace(
    /url\s*\(\s*['"]?([^'")]+)['"]?\s*\)/gi,
    (match, url) => {
      // No procesar data URIs, URLs externas o que ya tienen versión
      if (url.startsWith('data:') || 
          url.startsWith('http://') || 
          url.startsWith('https://') ||
          url.includes('?v=')) {
        return match;
      }
      
      // Agregar versión
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
// HANDLEBARS
// ============================================================
const hbs = require('express-handlebars').create({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {
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
    json: o => JSON.stringify(o, null, 2),
    join: (a, s) => Array.isArray(a) ? a.join(s || ', ') : '',
    default: (v, d) => v || d,
    // Helpers para cache busting
    version: () => APP_VERSION,
    asset: (url) => `${url}?v=${APP_VERSION}`,
    img: (url) => `${url}?v=${APP_VERSION}`,
    css: (url) => `${url}?v=${APP_VERSION}`,
    js: (url) => `${url}?v=${APP_VERSION}`
  }
});

const registerHelpers = require('./helpers');
registerHelpers(hbs.handlebars);

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'views'));
app.set('view cache', false); // Siempre deshabilitado

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Variables globales para vistas
app.use((req, res, next) => {
  res.locals.year = new Date().getFullYear();
  res.locals.version = APP_VERSION;
  next();
});

// ============================================================
// SERVIR CSS CON VERSIÓN EN LAS URLS INTERNAS
// ============================================================
app.get('/assets/css/:filename', (req, res) => {
  const cssPath = path.join(__dirname, 'assets/css', req.params.filename);
  
  if (!fs.existsSync(cssPath)) {
    return res.status(404).send('CSS not found');
  }
  
  // Verificar si hay versión procesada en caché
  const cacheDir = path.join(__dirname, '.processed-cache');
  const cachedFile = path.join(cacheDir, `${req.params.filename}.${APP_VERSION}`);
  
  let processedCSS;
  
  if (fs.existsSync(cachedFile)) {
    // Usar versión cacheada
    processedCSS = fs.readFileSync(cachedFile, 'utf8');
  } else {
    // Procesar y cachear
    const originalCSS = fs.readFileSync(cssPath, 'utf8');
    processedCSS = processCSSWithVersion(originalCSS, APP_VERSION);
    
    // Guardar en caché procesado
    if (!fs.existsSync(cacheDir)) {
      fs.mkdirSync(cacheDir, { recursive: true });
    }
    fs.writeFileSync(cachedFile, processedCSS);
  }
  
  // Headers de caché: inmutable por esta versión (1 año)
  res.set({
    'Content-Type': 'text/css; charset=utf-8',
    'Cache-Control': 'public, max-age=31536000, immutable',
    'ETag': `"${APP_VERSION}"`,
    'X-CSS-Version': APP_VERSION
  });
  
  res.send(processedCSS);
});

// ============================================================
// ARCHIVOS ESTÁTICOS CON CACHÉ INTELIGENTE
// ============================================================
// Si la URL tiene ?v=VERSION, cachear por mucho tiempo
// Si no tiene versión, no cachear

app.use('/assets', (req, res, next) => {
  // Saltar si es CSS (ya procesado arriba)
  if (req.path.startsWith('/css/')) {
    return next('route');
  }
  
  const hasVersion = req.query.v === APP_VERSION;
  
  if (hasVersion) {
    // Versión correcta: cachear por 1 año (inmutable)
    res.set({
      'Cache-Control': 'public, max-age=31536000, immutable',
      'ETag': `"${APP_VERSION}"`
    });
  } else if (req.query.v) {
    // Versión incorrecta (vieja): no cachear, forzar recarga
    res.set({
      'Cache-Control': 'no-store, must-revalidate',
      'X-Outdated-Version': 'true'
    });
  } else {
    // Sin versión: caché corto
    res.set({
      'Cache-Control': 'no-cache, must-revalidate',
      'ETag': `"${APP_VERSION}"`
    });
  }
  
  next();
}, express.static(path.join(__dirname, 'assets')));

// Otros estáticos
app.use('/public', (req, res, next) => {
  const hasVersion = req.query.v === APP_VERSION;
  res.set({
    'Cache-Control': hasVersion ? 'public, max-age=31536000, immutable' : 'no-cache',
    'ETag': `"${APP_VERSION}"`
  });
  next();
}, express.static(path.join(__dirname, 'public')));

app.use('/uploads', (req, res, next) => {
  const hasVersion = req.query.v === APP_VERSION;
  res.set({
    'Cache-Control': hasVersion ? 'public, max-age=31536000, immutable' : 'no-cache',
    'ETag': `"${APP_VERSION}"`
  });
  next();
}, express.static(path.join(__dirname, 'uploads')));

app.use('/images', (req, res, next) => {
  const hasVersion = req.query.v === APP_VERSION;
  res.set({
    'Cache-Control': hasVersion ? 'public, max-age=31536000, immutable' : 'no-cache',
    'ETag': `"${APP_VERSION}"`
  });
  next();
}, express.static(path.join(__dirname, 'images')));

// ============================================================
// RUTAS
// ============================================================
const adminRoutes = require('./routes/admin');
const blogRoutes = require('./routes/blog');

app.use('/admin', adminRoutes);
app.use('/blog', blogRoutes);

// ============================================================
// API
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
      
      // Siempre devolver en formato { data: ..., _version: ... }
      res.json({ 
        data: data,  // Puede ser array u objeto
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
    uptime: process.uptime()
  });
});

app.get('/api/version', (req, res) => {
  res.set('Cache-Control', 'no-store');
  res.json({ version: APP_VERSION });
});

app.post('/api/clear-cache', (req, res) => {
  clearAllCache();
  res.json({ success: true, newVersion: APP_VERSION });
});

// ============================================================
// PÁGINAS LEGALES
// ============================================================
app.get('/terms', (req, res) => res.render('legal/terms', { layout: 'legal', title: 'Términos' }));
app.get('/privacy', (req, res) => res.render('legal/privacy', { layout: 'legal', title: 'Privacidad' }));

// ============================================================
// CARGAR DATOS PARA VISTAS
// ============================================================
function loadViewData() {
  const data = { 
    title: 'SOCCER iD', 
    year: new Date().getFullYear(),
    version: APP_VERSION
  };
  
  const dir = path.join(__dirname, 'contents');
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') && !f.startsWith('blog'))
      .forEach(f => {
        try {
          data[f.replace('.json', '').replace(/-/g, '_')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        } catch (e) {
          console.error(`Error cargando ${f}:`, e.message);
        }
      });
  }
  return data;
}

// ============================================================
// RUTAS DE PÁGINAS
// ============================================================
app.get('/', (req, res) => res.render('index', loadViewData()));

app.get('/:page', (req, res) => {
  const viewPath = path.join(__dirname, 'views', req.params.page + '.hbs');
  if (fs.existsSync(viewPath)) {
    res.render(req.params.page, loadViewData());
  } else {
    res.status(404).render('index', { ...loadViewData(), error: 'Página no encontrada' });
  }
});

// ============================================================
// ERRORES
// ============================================================
app.use((req, res) => res.status(404).json({ error: 'No encontrado' }));
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
  console.log(`  🌐 URL:         http://localhost:${PORT}`);
  console.log(`  🔐 Admin:       http://localhost:${PORT}/admin`);
  console.log(`  📝 Blog:        http://localhost:${PORT}/blog`);
  console.log(`  🔧 Entorno:     ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
  console.log('='.repeat(60));
  console.log('  📦 SISTEMA DE CACHÉ:');
  console.log('      ✓ Limpieza completa al reiniciar');
  console.log('      ✓ CSS procesado con versiones en URLs');
  console.log('      ✓ Assets con versión: caché 1 año');
  console.log('      ✓ Assets sin versión: sin caché');
  console.log('='.repeat(60));
  console.log('');
});