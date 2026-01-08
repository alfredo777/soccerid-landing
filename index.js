/**
 * Servidor Node.js con Express y Handlebars
 * Proyecto: landing-soccerid-v2_0
 */

const express = require('express');
const { engine } = require('express-handlebars');
const path = require('path');
const fs = require('fs');
const config = require('./config');

const app = express();
const PORT = process.env.PORT || config.port || 3000;

// ==========================================================================
// CONFIGURACIÓN DE ENTORNO
// ==========================================================================

const isProduction = process.env.NODE_ENV === 'production';

// ==========================================================================
// CONFIGURACIÓN DE HANDLEBARS
// ==========================================================================

// Crear instancia de Handlebars con helpers
const hbs = require('express-handlebars').create({
  extname: '.hbs',
  defaultLayout: 'main',
  layoutsDir: path.join(__dirname, 'views/layouts'),
  partialsDir: path.join(__dirname, 'views/partials'),
  helpers: {}
});

// Registrar helpers personalizados
const registerHelpers = require('./helpers');
registerHelpers(hbs.handlebars);

app.engine('.hbs', hbs.engine);
app.set('view engine', '.hbs');
app.set('views', path.join(__dirname, 'views'));

// ==========================================================================
// MIDDLEWARE
// ==========================================================================

app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// ==========================================================================
// MIDDLEWARE DE CONTROL DE CACHE (PRODUCCIÓN)
// ==========================================================================

/**
 * En producción, deshabilita el cache para archivos JS, CSS, JSON y HTML
 * Esto asegura que Heroku siempre sirva la versión más reciente
 * Para habilitar cache en archivos específicos, usa el parámetro ?cache=true
 */
const noCacheMiddleware = (req, res, next) => {
  if (!isProduction) {
    return next();
  }

  // Si el request tiene ?cache=true, permitir cache
  if (req.query.cache === 'true') {
    return next();
  }

  const url = req.url.toLowerCase();
  
  // Archivos que NO deben cachearse en producción
  const noCacheExtensions = ['.js', '.css', '.json', '.html', '.hbs'];
  const shouldDisableCache = noCacheExtensions.some(ext => url.split('?')[0].endsWith(ext));
  
  // También deshabilitar cache para rutas de vistas (sin extensión)
  const isViewRoute = !url.includes('.') || url === '/';
  
  if (shouldDisableCache || isViewRoute) {
    res.set({
      'Cache-Control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
      'Pragma': 'no-cache',
      'Expires': '0',
      'Surrogate-Control': 'no-store'
    });
  }
  
  next();
};

// Aplicar middleware de no-cache
app.use(noCacheMiddleware);

// ==========================================================================
// ARCHIVOS ESTÁTICOS
// ==========================================================================

// Configuración de cache para archivos estáticos
const getStaticOptions = (customOptions = {}) => {
  if (isProduction) {
    // En producción: sin cache por defecto
    return {
      etag: false,
      lastModified: false,
      maxAge: 0,
      setHeaders: (res, filePath) => {
        const ext = path.extname(filePath).toLowerCase();
        
        // Imágenes y fuentes pueden tener cache corto (1 hora)
        // ya que cambian menos frecuentemente
        const cacheableExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.svg', '.webp', '.ico', '.woff', '.woff2', '.ttf', '.eot'];
        
        if (cacheableExtensions.includes(ext)) {
          res.set({
            'Cache-Control': 'public, max-age=3600', // 1 hora
          });
        } else {
          // JS, CSS y otros: sin cache
          res.set({
            'Cache-Control': 'no-store, no-cache, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          });
        }
      },
      ...customOptions
    };
  } else {
    // En desarrollo: usar configuración del config
    return {
      maxAge: config.staticMaxAge || '1d',
      etag: true,
      ...customOptions
    };
  }
};

app.use('/assets', express.static(path.join(__dirname, 'assets'), getStaticOptions()));

app.use('/public', express.static(path.join(__dirname, 'public'), getStaticOptions()));

// ==========================================================================
// API: DATOS JSON
// ==========================================================================

app.get('/contents/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'contents', filename);
  const jsonPath = filePath.endsWith('.json') ? filePath : `${filePath}.json`;
  
  if (fs.existsSync(jsonPath)) {
    res.setHeader('Content-Type', 'application/json');
    
    // Cache control basado en entorno
    if (isProduction) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    } else {
      res.setHeader('Cache-Control', 'public, max-age=300');
    }
    
    res.sendFile(jsonPath);
  } else {
    res.status(404).json({ error: 'Archivo no encontrado', file: filename });
  }
});

app.get('/api/contents', (req, res) => {
  const contentsDir = path.join(__dirname, 'contents');
  try {
    const files = fs.readdirSync(contentsDir)
      .filter(file => file.endsWith('.json'))
      .map(file => ({
        name: file.replace('.json', ''),
        url: `/contents/${file}`
      }));
    res.json({ contents: files });
  } catch (error) {
    res.status(500).json({ error: 'Error leyendo directorio de contenidos' });
  }
});

// ==========================================================================
// PARTIALS
// ==========================================================================

app.get('/partials/:name', (req, res) => {
  const partialName = req.params.name;
  const partialPath = path.join(__dirname, 'views/partials', `${partialName}.hbs`);
  
  if (fs.existsSync(partialPath)) {
    res.setHeader('Content-Type', 'text/plain');
    
    // Sin cache en producción
    if (isProduction) {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
    }
    
    res.sendFile(partialPath);
  } else {
    res.status(404).send('Partial no encontrado');
  }
});

// ==========================================================================
// RUTAS DE VISTAS
// ==========================================================================

function loadViewData() {
  const data = {
    title: 'landing-soccerid-v2_0',
    description: 'Sitio web generado con Handlebars',
    year: new Date().getFullYear(),
    // Agregar timestamp para cache-busting en assets
    cacheBuster: isProduction ? Date.now() : 'dev'
  };
  
  const contentsDir = path.join(__dirname, 'contents');
  if (fs.existsSync(contentsDir)) {
    fs.readdirSync(contentsDir)
      .filter(file => file.endsWith('.json'))
      .forEach(file => {
        try {
          const content = fs.readFileSync(path.join(contentsDir, file), 'utf8');
          const key = file.replace('.json', '').replace(/-/g, '_');
          data[key] = JSON.parse(content);
        } catch (e) {
          console.error(`Error cargando ${file}:`, e.message);
        }
      });
  }
  
  return data;
}

app.get('/', (req, res) => {
  const data = loadViewData();
  res.render('index', data);
});

app.get('/:page', (req, res) => {
  const page = req.params.page;
  const viewPath = path.join(__dirname, 'views', `${page}.hbs`);
  
  if (fs.existsSync(viewPath)) {
    const data = loadViewData();
    res.render(page, data);
  } else {
    res.status(404).render('index', { 
      ...loadViewData(),
      error: 'Página no encontrada' 
    });
  }
});

// ==========================================================================
// MANEJO DE ERRORES
// ==========================================================================

app.use((req, res, next) => {
  res.status(404).json({ 
    error: 'Recurso no encontrado',
    path: req.path 
  });
});

app.use((err, req, res, next) => {
  console.error('[ERROR]', err);
  res.status(500).json({ 
    error: 'Error interno del servidor',
    message: config.debug ? err.message : 'Contacte al administrador'
  });
});

// ==========================================================================
// INICIAR SERVIDOR
// ==========================================================================

app.listen(PORT, () => {
  console.log('');
  console.log('='.repeat(60));
  console.log('  LANDING-SOCCERID-V2_0 - SERVIDOR INICIADO');
  console.log('='.repeat(60));
  console.log('');
  console.log(`  🌐 URL Local:    http://localhost:${PORT}`);
  console.log(`  📁 Proyecto:     ${__dirname}`);
  console.log(`  🔧 Modo:         ${isProduction ? 'Producción (NO CACHE)' : 'Desarrollo'}`);
  console.log(`  💾 Cache:        ${isProduction ? 'Deshabilitado para JS/CSS/JSON' : 'Habilitado'}`);
  console.log('');
  console.log('  Endpoints disponibles:');
  console.log('    GET /              → Página principal');
  console.log('    GET /contents/*    → Datos JSON');
  console.log('    GET /partials/*    → Templates parciales');
  console.log('    GET /assets/*      → Archivos estáticos');
  console.log('');
  if (isProduction) {
    console.log('  ⚠️  Cache deshabilitado en producción para:');
    console.log('      .js, .css, .json, .html, rutas de vistas');
    console.log('      Imágenes y fuentes tienen cache de 1 hora');
    console.log('');
  }
  console.log('='.repeat(60));
  console.log('');
});

module.exports = app;