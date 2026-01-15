/**
 * GKrakenCMS - Servidor Node.js
 * Proyecto: soccerid-v4-landing
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
// LIMPIEZA DE CACHÉ AL INICIAR
// ============================================================
function clearCache() {
  console.log('🧹 Limpiando caché del servidor...');
  
  // 1. Limpiar caché de require de Node.js para módulos del proyecto
  Object.keys(require.cache).forEach(key => {
    // Solo limpiar módulos del proyecto, no node_modules
    if (key.includes(__dirname) && !key.includes('node_modules')) {
      delete require.cache[key];
      console.log('   ✓ Cache eliminado:', path.basename(key));
    }
  });
  
  // 2. Limpiar carpeta de caché temporal si existe
  const tempCacheDir = path.join(__dirname, '.cache');
  if (fs.existsSync(tempCacheDir)) {
    fs.rmSync(tempCacheDir, { recursive: true, force: true });
    console.log('   ✓ Carpeta .cache eliminada');
  }
  
  // 3. Limpiar carpeta tmp si existe
  const tmpDir = path.join(__dirname, 'tmp');
  if (fs.existsSync(tmpDir)) {
    fs.readdirSync(tmpDir).forEach(file => {
      const filePath = path.join(tmpDir, file);
      fs.unlinkSync(filePath);
    });
    console.log('   ✓ Carpeta tmp limpiada');
  }
  
  console.log('✅ Caché limpiado correctamente\n');
}

// Ejecutar limpieza al iniciar
clearCache();

// ============================================================
// GENERAR VERSION ÚNICA PARA CACHE BUSTING
// ============================================================
const APP_VERSION = Date.now(); // Cambia en cada reinicio

// Sesión
app.use(session({
  secret: process.env.SESSION_SECRET || '9f80e68fee77eaad72fe630b5fa1631c1156fcc2f6c54421c62ea356eaf5be94',
  resave: false,
  saveUninitialized: false,
  cookie: { secure: isProduction, httpOnly: true, maxAge: 24 * 60 * 60 * 1000 }
}));

// Handlebars
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
    // Helper para cache busting en assets
    version: () => APP_VERSION,
    asset: (url) => `${url}?v=${APP_VERSION}`
  }
});

// Helpers adicionales
const registerHelpers = require('./helpers');
registerHelpers(hbs.handlebars);

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'views'));

// Deshabilitar caché de vistas en desarrollo
if (!isProduction) {
  app.set('view cache', false);
}

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ============================================================
// MIDDLEWARE ANTI-CACHÉ PARA DESARROLLO
// ============================================================
app.use((req, res, next) => {
  res.locals.year = new Date().getFullYear();
  res.locals.version = APP_VERSION; // Disponible en todas las vistas
  
  // Headers anti-caché en desarrollo
  if (!isProduction) {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });
  }
  
  next();
});

// ============================================================
// ESTÁTICOS CON CONTROL DE CACHÉ
// ============================================================
const staticOptions = isProduction 
  ? { maxAge: '1d' } // 1 día en producción
  : { 
      maxAge: 0,
      etag: false,
      lastModified: false,
      setHeaders: (res) => {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate');
        res.set('Pragma', 'no-cache');
      }
    };

app.use('/assets', express.static(path.join(__dirname, 'assets'), staticOptions));
app.use('/public', express.static(path.join(__dirname, 'public'), staticOptions));

// Rutas
const adminRoutes = require('./routes/admin');
const blogRoutes = require('./routes/blog');

app.use('/admin', adminRoutes);
app.use('/blog', blogRoutes);

// ============================================================
// API - SERVIR ARCHIVOS JSON (SIN CACHÉ)
// ============================================================
app.get('/contents/:filename', (req, res) => {
  // Headers anti-caché para JSON
  res.set({
    'Cache-Control': 'no-store, no-cache, must-revalidate',
    'Pragma': 'no-cache',
    'Expires': '0'
  });
  
  let filename = req.params.filename;
  if (filename.endsWith('.json')) {
    filename = filename.slice(0, -5);
  }
  
  const jsonPath = path.join(__dirname, 'contents', filename + '.json');
  
  if (fs.existsSync(jsonPath)) {
    try {
      // Leer siempre fresco del disco, sin caché
      const data = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      res.json(data);
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

// Endpoint para forzar limpieza de caché (útil para desarrollo)
app.post('/api/clear-cache', (req, res) => {
  if (!isProduction) {
    clearCache();
    res.json({ success: true, message: 'Caché limpiado', newVersion: Date.now() });
  } else {
    res.status(403).json({ error: 'No disponible en producción' });
  }
});

// Páginas legales
app.get('/terms', (req, res) => res.render('legal/terms', { layout: 'legal', title: 'Términos' }));
app.get('/privacy', (req, res) => res.render('legal/privacy', { layout: 'legal', title: 'Privacidad' }));

// Cargar datos para vistas (siempre fresco)
function loadViewData() {
  const data = { 
    title: 'SOCCER iD', 
    year: new Date().getFullYear(),
    version: APP_VERSION // Para cache busting en vistas
  };
  
  const dir = path.join(__dirname, 'contents');
  if (fs.existsSync(dir)) {
    fs.readdirSync(dir)
      .filter(f => f.endsWith('.json') && !f.startsWith('blog'))
      .forEach(f => {
        try {
          // Leer siempre del disco
          data[f.replace('.json', '').replace(/-/g, '_')] = JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
        } catch (e) {
          console.error(`Error cargando ${f}:`, e.message);
        }
      });
  }
  return data;
}

// Página principal
app.get('/', (req, res) => res.render('index', loadViewData()));

// Otras páginas
app.get('/:page', (req, res) => {
  const viewPath = path.join(__dirname, 'views', req.params.page + '.hbs');
  if (fs.existsSync(viewPath)) {
    res.render(req.params.page, loadViewData());
  } else {
    res.status(404).render('index', { ...loadViewData(), error: 'Página no encontrada' });
  }
});

// Errores
app.use((req, res) => res.status(404).json({ error: 'No encontrado' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Error del servidor' });
});

// Iniciar
app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('  GKRAKEN CMS - SERVIDOR INICIADO');
  console.log('='.repeat(60));
  console.log(`  🆔 Versión:  ${APP_VERSION}`);
  console.log(`  🌐 URL:      http://localhost:${PORT}`);
  console.log(`  🔐 Admin:    http://localhost:${PORT}/admin`);
  console.log(`  📝 Blog:     http://localhost:${PORT}/blog`);
  console.log(`  🔧 Entorno:  ${isProduction ? 'PRODUCCIÓN' : 'DESARROLLO'}`);
  console.log('='.repeat(60));
  if (!isProduction) {
    console.log('  ⚠️  Caché deshabilitado (modo desarrollo)');
    console.log('='.repeat(60));
  }
  console.log('');
});