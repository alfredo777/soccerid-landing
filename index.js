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
// ARCHIVOS ESTÁTICOS
// ==========================================================================

app.use('/assets', express.static(path.join(__dirname, 'assets'), {
  maxAge: config.staticMaxAge || '1d',
  etag: true
}));

app.use('/public', express.static(path.join(__dirname, 'public')));

// ==========================================================================
// API: DATOS JSON
// ==========================================================================

app.get('/contents/:filename', (req, res) => {
  const filename = req.params.filename;
  const filePath = path.join(__dirname, 'contents', filename);
  const jsonPath = filePath.endsWith('.json') ? filePath : `${filePath}.json`;
  
  if (fs.existsSync(jsonPath)) {
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300');
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
    year: new Date().getFullYear()
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
  console.log(`  🔧 Modo:         ${config.debug ? 'Desarrollo' : 'Producción'}`);
  console.log('');
  console.log('  Endpoints disponibles:');
  console.log('    GET /              → Página principal');
  console.log('    GET /contents/*    → Datos JSON');
  console.log('    GET /partials/*    → Templates parciales');
  console.log('    GET /assets/*      → Archivos estáticos');
  console.log('');
  console.log('='.repeat(60));
  console.log('');
});

module.exports = app;
