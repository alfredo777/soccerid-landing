/**
 * GKrakenCMS - Servidor Node.js
 * Proyecto: soccerid-v4-landing
 * 
 * ⚠️ CACHÉ COMPLETAMENTE DESHABILITADO - Recarga todo en cada reinicio
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
const APP_VERSION = Date.now();

// ============================================================
// LIMPIEZA TOTAL DE CACHÉ AL INICIAR (SIEMPRE)
// ============================================================
function clearAllCache() {
  console.log('');
  console.log('🧹 LIMPIANDO TODO EL CACHÉ DEL SERVIDOR...');
  console.log('-'.repeat(50));
  
  // 1. Limpiar TODOS los módulos del proyecto del caché de require
  let modulesCleared = 0;
  Object.keys(require.cache).forEach(key => {
    if (key.includes(__dirname) && !key.includes('node_modules')) {
      delete require.cache[key];
      modulesCleared++;
    }
  });
  console.log(`   ✓ ${modulesCleared} módulos eliminados del caché de require`);
  
  // 2. Limpiar carpeta .cache
  const cacheDir = path.join(__dirname, '.cache');
  if (fs.existsSync(cacheDir)) {
    fs.rmSync(cacheDir, { recursive: true, force: true });
    console.log('   ✓ Carpeta .cache eliminada');
  }
  
  // 3. Limpiar carpeta tmp
  const tmpDir = path.join(__dirname, 'tmp');
  if (fs.existsSync(tmpDir)) {
    const files = fs.readdirSync(tmpDir);
    files.forEach(file => {
      try {
        fs.unlinkSync(path.join(tmpDir, file));
      } catch (e) {}
    });
    console.log(`   ✓ Carpeta tmp limpiada (${files.length} archivos)`);
  }
  
  // 4. Limpiar cualquier carpeta de caché común
  const cacheFolders = ['.tmp', 'cache', '.parcel-cache', '.webpack-cache'];
  cacheFolders.forEach(folder => {
    const folderPath = path.join(__dirname, folder);
    if (fs.existsSync(folderPath)) {
      fs.rmSync(folderPath, { recursive: true, force: true });
      console.log(`   ✓ Carpeta ${folder} eliminada`);
    }
  });
  
  console.log('-'.repeat(50));
  console.log('✅ CACHÉ LIMPIADO - Todo se recargará desde cero');
  console.log(`🆔 Nueva versión: ${APP_VERSION}`);
  console.log('');
}

// EJECUTAR LIMPIEZA SIEMPRE AL INICIAR
clearAllCache();

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
// HANDLEBARS - SIN CACHÉ DE VISTAS
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
    // Helper para imágenes con versión
    img: (url) => `${url}?v=${APP_VERSION}`
  }
});

// Helpers adicionales
const registerHelpers = require('./helpers');
registerHelpers(hbs.handlebars);

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'views'));

// SIEMPRE deshabilitar caché de vistas (desarrollo Y producción)
app.set('view cache', false);

// ============================================================
// MIDDLEWARE
// ============================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// MIDDLEWARE ANTI-CACHÉ GLOBAL (SIEMPRE ACTIVO)
// ============================================================
app.use((req, res, next) => {
  res.locals.year = new Date().getFullYear();
  res.locals.version = APP_VERSION;
  
  // Headers anti-caché para TODAS las respuestas
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
    'Pragma': 'no-cache',
    'Expires': '0',
    'Surrogate-Control': 'no-store',
    'Clear-Site-Data': '"cache"'
  });
  
  next();
});

// ============================================================
// ARCHIVOS ESTÁTICOS - SIN CACHÉ (SIEMPRE)
// ============================================================
const staticOptions = {
  maxAge: 0,
  etag: false,
  lastModified: false,
  cacheControl: false,
  setHeaders: (res, filePath) => {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate, max-age=0',
      'Pragma': 'no-cache',
      'Expires': '0'
    });
  }
};

app.use('/assets', express.static(path.join(__dirname, 'assets'), staticOptions));
app.use('/public', express.static(path.join(__dirname, 'public'), staticOptions));
app.use('/images', express.static(path.join(__dirname, 'images'), staticOptions));
app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticOptions));

// ============================================================
// RUTAS
// ============================================================
const adminRoutes = require('./routes/admin');
const blogRoutes = require('./routes/blog');

app.use('/admin', adminRoutes);
app.use('/blog', blogRoutes);

// ============================================================
// API - ARCHIVOS JSON (SIN CACHÉ)
// ============================================================
app.get('/contents/:filename', (req, res) => {
  let filename = req.params.filename;
  if (filename.endsWith('.json')) {
    filename = filename.slice(0, -5);
  }
  
  const jsonPath = path.join(__dirname, 'contents', filename + '.json');
  
  if (fs.existsSync(jsonPath)) {
    try {
      // SIEMPRE leer fresco del disco
      delete require.cache[jsonPath]; // Por si acaso
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      res.json({ ...data, _version: APP_VERSION });
    } catch (err) {
      console.error(`Error parsing ${filename}.json:`, err);
      res.status(500).json({ error: 'Error al parsear JSON' });
    }
  } else {
    console.log(`[404] Archivo no encontrado: ${jsonPath}`);
    res.status(404).json({ error: 'No encontrado', file: filename });
  }
});

app.get('/api/contents', (req, res) => {
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
    cacheDisabled: true
  });
});

// Endpoint para forzar limpieza de caché manual
app.post('/api/clear-cache', (req, res) => {
  clearAllCache();
  res.json({ success: true, message: 'Caché limpiado', newVersion: APP_VERSION });
});

// Endpoint para verificar versión actual
app.get('/api/version', (req, res) => {
  res.json({ version: APP_VERSION, timestamp: new Date(APP_VERSION).toISOString() });
});

// ============================================================
// PÁGINAS LEGALES
// ============================================================
app.get('/terms', (req, res) => res.render('legal/terms', { layout: 'legal', title: 'Términos' }));
app.get('/privacy', (req, res) => res.render('legal/privacy', { layout: 'legal', title: 'Privacidad' }));

// ============================================================
// CARGAR DATOS PARA VISTAS (SIEMPRE FRESCO)
// ============================================================
function loadViewData() {
  const data = { 
    title: 'SOCCER iD', 
    year: new Date().getFullYear(),
    version: APP_VERSION,
    _nocache: Date.now() // Extra para asegurar que siempre es único
  };
  
  const dir = path.join(__dirname, 'contents');
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') && !f.startsWith('blog'))
      .forEach(f => {
        try {
          const filePath = path.join(dir, f);
          // Eliminar del caché de require si existe
          delete require.cache[filePath];
          // Leer siempre del disco
          data[f.replace('.json', '').replace(/-/g, '_')] = JSON.parse(fs.readFileSync(filePath, 'utf8'));
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
// MANEJO DE ERRORES
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
  console.log(`  📅 Fecha:       ${new Date(APP_VERSION).toLocaleString('es-MX')}`);
  console.log(`  🌐 URL:         http://localhost:${PORT}`);
  console.log(`  🔐 Admin:       http://localhost:${PORT}/admin`);
  console.log(`  📝 Blog:        http://localhost:${PORT}/blog`);
  console.log(`  🔧 Entorno:     ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
  console.log('='.repeat(60));
  console.log('  🚫 CACHÉ:       COMPLETAMENTE DESHABILITADO');
  console.log('  🔄 TODO se recarga desde cero en cada reinicio');
  console.log('='.repeat(60));
  console.log('');
});