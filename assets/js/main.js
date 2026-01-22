/**
 * ==========================================================================
 * JavaScript Principal - GKrakenCMS
 * Proyecto: soccerid-v5-new-landing
 * ==========================================================================
 * 
 * Este archivo contiene toda la lógica principal de la aplicación:
 * - Sistema de carga de datos JSON con caché
 * - Renderizado de componentes (Bento Grids, Eventos, Paneles)
 * - Sistema de Lightbox para galerías
 * - Modales y paneles deslizantes
 * - Integración con WhatsApp para contacto
 * 
 * @author GKraken
 * @version 2.0.0
 */

// ==========================================================================
// CONFIGURACIÓN GLOBAL
// ==========================================================================

/**
 * Objeto principal de configuración y utilidades de GKraken
 * Maneja la carga de datos JSON, caché y normalización de datos
 */
const GKraken = {
  /**
   * Configuración de la aplicación
   * @property {string} API_BASE - URL base para las APIs (vacío = mismo dominio)
   * @property {boolean} DEBUG - Activa/desactiva logs de depuración
   * @property {number} CACHE_DURATION - Duración del caché en milisegundos (5 minutos)
   */
  config: {
    API_BASE: '',
    DEBUG: true,
    CACHE_DURATION: 5 * 60 * 1000 // 5 minutos en milisegundos
  },
  
  /**
   * Mapeo de nombres de variables a archivos JSON
   * Clave: nombre de la variable global
   * Valor: nombre del archivo JSON (sin extensión)
   */
  dataFiles: {
    'bentoItemsFirst': 'bento_items_first',
    'bentoItemsSecond': 'bento_items_second',
    'upcomingEvents': 'upcoming_events',
    'panelTemplates': 'panel_templates',
    'panelClasses': 'panel_classes'
  },
  
  /**
   * Caché en memoria para datos JSON cargados
   * Almacena datos con timestamp para expiración
   */
  cache: new Map(),
  
  /**
   * Flag para evitar inicializaciones múltiples
   */
  initialized: false,
  
  /**
   * Carga un archivo JSON desde el servidor con soporte de caché
   * @param {string} filename - Nombre del archivo JSON (sin extensión)
   * @returns {Promise<Object|null>} - Datos JSON o null si hay error
   */
  async loadJSON(filename) {
    const cacheKey = `json_${filename}`;
    const cached = this.cache.get(cacheKey);
    
    // Verificar si existe en caché y no ha expirado
    if (cached && Date.now() - cached.timestamp < this.config.CACHE_DURATION) {
      if (this.config.DEBUG) console.log(`[GKraken] Cache hit: ${filename}`);
      return cached.data;
    }
    
    try {
      // Agregar timestamp para evitar caché del navegador
      const url = `/contents/${filename}.json?t=${Date.now()}`;
      if (this.config.DEBUG) console.log(`[GKraken] Fetching: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      
      // Guardar en caché con timestamp
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      
      if (this.config.DEBUG) console.log(`[GKraken] Loaded: ${filename}`, data);
      return data;
    } catch (error) {
      console.error(`[GKraken] Error cargando ${filename}:`, error);
      return null;
    }
  },
  
  /**
   * Carga todos los archivos de datos definidos en dataFiles
   * Utiliza Promise.allSettled para manejar errores individuales
   * @returns {Promise<Object>} - Objeto con todos los datos cargados
   */
  async loadAllData() {
    const data = {};
    const entries = Object.entries(this.dataFiles);
    
    if (this.config.DEBUG) console.log(`[GKraken] Cargando ${entries.length} archivos de datos...`);
    
    // Cargar todos los archivos en paralelo
    const results = await Promise.allSettled(
      entries.map(async ([varName, filename]) => {
        const result = await this.loadJSON(filename);
        return { varName, result };
      })
    );
    
    // Procesar resultados, ignorando los fallidos
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.result !== null) {
        data[result.value.varName] = result.value.result;
      }
    });
    
    return data;
  },
  
  /**
   * Invalida el caché para un archivo específico o todo el caché
   * @param {string|null} filename - Nombre del archivo o null para limpiar todo
   */
  invalidateCache(filename) {
    if (filename) {
      this.cache.delete(`json_${filename}`);
    } else {
      this.cache.clear();
    }
  },
  
  /**
   * Normaliza datos a formato array
   * Maneja diferentes estructuras de JSON (objeto con .data, .items, etc.)
   * @param {any} data - Datos a normalizar
   * @param {string[]} possibleKeys - Claves posibles donde buscar el array
   * @returns {Array} - Array normalizado
   */
  normalizeToArray(data, possibleKeys = ['data', 'items', 'events', 'list', 'records']) {
    // Si ya es array, retornarlo
    if (Array.isArray(data)) return data;
    if (data == null) return [];
    
    if (typeof data === 'object') {
      // Buscar en claves conocidas primero
      for (const key of possibleKeys) {
        if (Array.isArray(data[key])) {
          if (this.config.DEBUG) console.log(`[GKraken] Normalizado: extraído array de propiedad "${key}"`);
          return data[key];
        }
      }
      
      // Buscar en cualquier clave que contenga un array
      for (const key of Object.keys(data)) {
        if (Array.isArray(data[key])) {
          if (this.config.DEBUG) console.log(`[GKraken] Normalizado: extraído array de propiedad "${key}"`);
          return data[key];
        }
      }
    }
    
    console.warn('[GKraken] No se pudo normalizar a array:', data);
    return [];
  }
};

// Exponer GKraken globalmente para acceso desde otros scripts
window.GKraken = GKraken;

// ==========================================================================
// VARIABLES GLOBALES
// ==========================================================================

/**
 * Arrays de datos para los componentes
 * Se llenan después de cargar los JSON
 */
let bentoItemsFirst = [];   // Items del primer grid Bento
let bentoItemsSecond = [];  // Items del segundo grid Bento
let upcomingEvents = [];    // Lista de eventos próximos

/**
 * Objetos de configuración para paneles
 */
let panelTemplates = {};    // Plantillas de contenido para cada panel
let panelClasses = {};      // Clases CSS para cada tipo de panel

/**
 * Variables de estado para sliders y lightbox
 */
let currentSlide = 0;       // Índice del slide actual en carruseles
let lightboxImages = [];    // Array de imágenes para el lightbox
let lightboxIndex = 0;      // Índice de imagen actual en lightbox

/**
 * Número de WhatsApp para contacto (formato internacional sin +)
 */
const WHATSAPP_NUMBER = '12315158991';

/**
 * Número inicial de eventos a mostrar antes de "Ver todos"
 * @constant {number}
 */
const INITIAL_EVENTS_COUNT = 3;

/**
 * Clases CSS por defecto para los paneles (fallback si no carga el JSON)
 */
const DEFAULT_PANEL_CLASSES = {
  quienes: 'panel-quienes',
  soccer: 'panel-soccer',
  seguros: 'panel-seguros',
  vip: 'panel-vip',
  copa: 'panel-copa',
  fan: 'panel-fan',
  media: 'panel-media',
  opiniones: 'panel-opiniones'
};

// ==========================================================================
// ASIGNAR DATOS GLOBALES
// ==========================================================================

/**
 * Desenvuelve datos que vienen encapsulados en una propiedad "data"
 * Común en respuestas de APIs REST
 * @param {Object} obj - Objeto a desenvolver
 * @returns {any} - Datos desenvueltos o el objeto original
 */
function unwrapData(obj) {
  if (obj && typeof obj === 'object' && 'data' in obj) {
    return obj.data;
  }
  return obj;
}

/**
 * Asigna los datos cargados a las variables globales
 * También registra magazines en el MagazineReader si está disponible
 * @param {Object} allData - Objeto con todos los datos cargados
 */
function assignGlobalData(allData) {
  // Asignar arrays de bento items
  if (allData.bentoItemsFirst) {
    bentoItemsFirst = GKraken.normalizeToArray(unwrapData(allData.bentoItemsFirst));
  }
  if (allData.bentoItemsSecond) {
    bentoItemsSecond = GKraken.normalizeToArray(unwrapData(allData.bentoItemsSecond));
  }
  
  // Asignar eventos
  if (allData.upcomingEvents) {
    upcomingEvents = GKraken.normalizeToArray(unwrapData(allData.upcomingEvents));
  }
  
  // Asignar plantillas de paneles
  if (allData.panelTemplates) {
    const unwrapped = unwrapData(allData.panelTemplates);
    panelTemplates = typeof unwrapped === 'object' && !Array.isArray(unwrapped) ? unwrapped : {};
    
    // =====================================================================
    // REGISTRO DE MAGAZINES PARA EL READER
    // =====================================================================
    // Si existe el panel media con artículos, registrarlos en MagazineReader
    if (panelTemplates.media && panelTemplates.media.articles) {
      const articles = GKraken.normalizeToArray(panelTemplates.media.articles);
      if (typeof MagazineReader !== 'undefined' && MagazineReader.registerFromArticles) {
        MagazineReader.registerFromArticles(articles);
        if (GKraken.config.DEBUG) {
          const magazineCount = articles.filter(a => a.type === 'magazine').length;
          console.log(`[GKraken] MagazineReader: ${magazineCount} revista(s) registrada(s)`);
        }
      }
    }
    // =====================================================================
  }
  
  // Asignar clases de paneles
  if (allData.panelClasses) {
    const unwrapped = unwrapData(allData.panelClasses);
    panelClasses = typeof unwrapped === 'object' && !Array.isArray(unwrapped) ? unwrapped : {};
  }
  
  // Usar fallback si panelClasses está vacío
  if (Object.keys(panelClasses).length === 0) {
    panelClasses = DEFAULT_PANEL_CLASSES;
    console.log('[GKraken] Usando panelClasses por defecto');
  }
  
  // Log de depuración con resumen de datos cargados
  if (GKraken.config.DEBUG) {
    console.log('[GKraken] Variables globales asignadas:', {
      bentoItemsFirst: `${bentoItemsFirst.length} items`,
      bentoItemsSecond: `${bentoItemsSecond.length} items`,
      upcomingEvents: `${upcomingEvents.length} items`,
      panelTemplates: `${Object.keys(panelTemplates).length} keys`,
      panelClasses: `${Object.keys(panelClasses).length} keys`
    });
  }
}

// ==========================================================================
// INICIALIZACIÓN PRINCIPAL
// ==========================================================================

/**
 * Función principal de inicialización de la aplicación
 * Carga datos, renderiza componentes y configura event listeners
 * @async
 */
async function initializeGKraken() {
  // Evitar inicializaciones múltiples
  if (GKraken.initialized) {
    console.warn('[GKraken] Ya inicializado');
    return;
  }
  
  console.log('[GKraken] ═══════════════════════════════════════');
  console.log('[GKraken] Inicializando soccerid-v5-new-landing...');
  console.log('[GKraken] ═══════════════════════════════════════');
  
  try {
    // 1. Cargar todos los datos JSON en paralelo
    const allData = await GKraken.loadAllData();
    
    // 2. Asignar datos a variables globales
    assignGlobalData(allData);
    
    // 3. Guardar referencia global para debugging
    window.appData = allData;
    
    console.log('[GKraken] Datos cargados:', Object.keys(allData));
    
    // 4. Renderizar componentes iniciales
    renderInitial();
    
    // 5. Configurar event listeners globales
    setupEventListeners();
    
    // 6. Ocultar preloader
    hidePreloader();
    
    GKraken.initialized = true;
    console.log('[GKraken] ✓ Inicialización completada');
    
  } catch (error) {
    console.error('[GKraken] ✗ Error en inicialización:', error);
    // Ocultar preloader incluso si hay error para no bloquear la UI
    hidePreloader();
  }
}

// ==========================================================================
// RENDERIZADO INICIAL
// ==========================================================================

/**
 * Renderiza los componentes iniciales de la página
 * Solo renderiza si los contenedores existen en el DOM
 */
function renderInitial() {
  console.log('[GKraken] Renderizando componentes iniciales...');
  
  // Renderizar grids Bento si existen
  const gridFirst = document.getElementById('bentoGridFirst');
  const gridSecond = document.getElementById('bentoGridSecond');
  if (gridFirst || gridSecond) {
    console.log('[GKraken] → renderBentoGrids()');
    renderBentoGrids();
  }
  
  // Renderizar eventos si existe el contenedor
  const eventsGrid = document.getElementById('eventsGrid');
  if (eventsGrid) {
    console.log('[GKraken] → renderUpcomingEvents()');
    renderUpcomingEvents();
  }
  
  console.log('[GKraken] ✓ Renderizado inicial completado');
}

// ==========================================================================
// EVENT LISTENERS
// ==========================================================================

/**
 * Configura todos los event listeners globales de la aplicación
 * Incluye navegación por teclado, scroll suave y clics en lightbox
 */
function setupEventListeners() {
  // Navegación por teclado
  document.addEventListener('keydown', function(e) {
    // ESC cierra modales y paneles
    if (e.key === 'Escape') {
      closeLightbox();
      closePanel();
      closeEventsModal();
    }
    // Flechas navegan el lightbox
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
  });
  
  // Scroll suave para enlaces ancla
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      const href = this.getAttribute('href');
      if (href !== '#') {
        e.preventDefault();
        const target = document.querySelector(href);
        if (target) {
          target.scrollIntoView({ behavior: 'smooth' });
        }
      }
    });
  });
  
  // Cerrar lightbox al hacer clic en el fondo
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.addEventListener('click', function(e) {
      if (e.target === this) closeLightbox();
    });
  }
}

// ==========================================================================
// PRELOADER
// ==========================================================================

/**
 * Oculta el preloader de carga inicial
 * Agrega clase 'hidden' para animación CSS
 */
function hidePreloader() {
  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.classList.add('hidden');
  }
}

// ==========================================================================
// LIGHTBOX
// ==========================================================================

/**
 * Abre el lightbox con un array de imágenes
 * @param {Array} images - Array de objetos con {src, alt}
 * @param {number} index - Índice de la imagen a mostrar inicialmente
 */
function openLightbox(images, index) {
  lightboxImages = GKraken.normalizeToArray(images);
  if (lightboxImages.length === 0) return;
  
  lightboxIndex = index || 0;
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImage');
  
  if (!lightbox || !img) return;
  
  // Establecer imagen actual
  img.src = lightboxImages[lightboxIndex].src;
  img.alt = lightboxImages[lightboxIndex].alt || '';
  
  // Mostrar lightbox y bloquear scroll
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

/**
 * Cierra el lightbox y restaura el scroll
 */
function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }
}

/**
 * Navega a la imagen anterior o siguiente en el lightbox
 * @param {number} direction - Dirección (-1 = anterior, 1 = siguiente)
 */
function navigateLightbox(direction) {
  if (lightboxImages.length === 0) return;
  
  // Navegación circular
  lightboxIndex = (lightboxIndex + direction + lightboxImages.length) % lightboxImages.length;
  
  const img = document.getElementById('lightboxImage');
  if (img && lightboxImages[lightboxIndex]) {
    img.src = lightboxImages[lightboxIndex].src;
    img.alt = lightboxImages[lightboxIndex].alt || '';
  }
}

// ==========================================================================
// BENTO GRIDS
// ==========================================================================

/**
 * Renderiza los grids tipo Bento con los items cargados
 * Cada item es clickeable y abre su panel correspondiente
 */
function renderBentoGrids() {
  const gridFirst = document.getElementById('bentoGridFirst');
  const gridSecond = document.getElementById('bentoGridSecond');
  
  // Renderizar primer grid
  if (gridFirst && bentoItemsFirst.length > 0) {
    gridFirst.innerHTML = bentoItemsFirst.map(item => `
      <div class="bento-item ${item.class || ''}" data-panel="${item.id || ''}">
        <div class="bento-content">
          <h3>${item.title || ''}</h3>
        </div>
      </div>
    `).join('');
  }
  
  // Renderizar segundo grid
  if (gridSecond && bentoItemsSecond.length > 0) {
    gridSecond.innerHTML = bentoItemsSecond.map(item => `
      <div class="bento-item ${item.class || ''}" data-panel="${item.id || ''}">
        <div class="bento-content">
          <h3>${item.title || ''}</h3>
        </div>
      </div>
    `).join('');
  }
  
  // Agregar event listeners para abrir paneles
  document.querySelectorAll('.bento-item').forEach(item => {
    item.addEventListener('click', function() {
      const panelId = this.dataset.panel;
      if (panelId) openPanel(panelId);
    });
  });
  
  // Configurar observer para animaciones de entrada
  observeBentoItems();
}

/**
 * Configura Intersection Observer para animar items al entrar en viewport
 * Los items aparecen con delay escalonado
 */
function observeBentoItems() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const items = entry.target.querySelectorAll('.bento-item');
        // Animar cada item con delay incremental
        items.forEach((item, i) => {
          setTimeout(() => item.classList.add('animated'), i * 150);
        });
        // Dejar de observar después de animar
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.2 });
  
  const gridFirst = document.getElementById('bentoGridFirst');
  const gridSecond = document.getElementById('bentoGridSecond');
  
  if (gridFirst) observer.observe(gridFirst);
  if (gridSecond) observer.observe(gridSecond);
}

// ==========================================================================
// EVENTS - UPCOMING EVENTS
// ==========================================================================

/**
 * Genera el HTML para una tarjeta de evento individual
 * Función auxiliar para evitar duplicación de código
 * @param {Object} e - Objeto del evento con propiedades (team1, team2, image, etc.)
 * @returns {string} - HTML de la tarjeta de evento
 */
function renderEventCard(e) {
  return `
    <div class="event-card" onclick="contactForEvent('${e.team1} vs ${e.team2}')">
      <div class="event-image">
        <img src="${e.image}" alt="${e.team1} vs ${e.team2}">
        <span class="event-badge">${e.badge}</span>
      </div>
      <div class="event-body">
        <div class="event-date">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          ${e.date} • ${e.time}
        </div>
        <div class="event-teams">
          <div class="event-team">
            <div class="team-shield"><img src="${e.team1Icon}" width="30px" /></div>
            <div class="team-name">${e.team1}</div>
          </div>
          <span class="event-vs">VS</span>
          <div class="event-team">
            <div class="team-shield"><img src="${e.team2Icon}" width="30px" /></div>
            <div class="team-name">${e.team2}</div>
          </div>
        </div>
        <div class="event-venue">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          ${e.venue}
        </div>
        <button class="event-cta">Reservar Boletos</button>
      </div>
    </div>
  `;
}

/**
 * Renderiza los eventos próximos en el grid principal
 * Muestra solo INITIAL_EVENTS_COUNT (3) eventos inicialmente
 * Si hay más eventos, muestra un botón para ver todos
 */
function renderUpcomingEvents() {
  const grid = document.getElementById('eventsGrid');
  const showAllBtn = document.getElementById('showAllEventsBtn');
  
  if (!grid) return;
  
  // Si no hay eventos, mostrar mensaje
  if (!Array.isArray(upcomingEvents) || upcomingEvents.length === 0) {
    grid.innerHTML = '<p class="no-events">No hay eventos próximos disponibles.</p>';
    if (showAllBtn) showAllBtn.style.display = 'none';
    return;
  }
  
  // Mostrar solo los primeros N eventos (definido por INITIAL_EVENTS_COUNT)
  const eventsToShow = upcomingEvents.slice(0, INITIAL_EVENTS_COUNT);
  
  // Renderizar las tarjetas de eventos
  grid.innerHTML = eventsToShow.map(e => renderEventCard(e)).join('');
  
  // Configurar el botón "Mostrar todos" según la cantidad de eventos
  if (showAllBtn) {
    const remainingEvents = upcomingEvents.length - INITIAL_EVENTS_COUNT;
    
    if (remainingEvents > 0) {
      // Hay más eventos: mostrar botón con contador
      showAllBtn.style.display = 'flex';
      showAllBtn.innerHTML = `
        <span>Mostrar todos los eventos</span>
        <span class="events-count">(${remainingEvents} más)</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      `;
    } else {
      // No hay más eventos: ocultar botón
      showAllBtn.style.display = 'none';
    }
  }
}

/**
 * Muestra todos los eventos próximos con animación de entrada
 * Se ejecuta al hacer clic en el botón "Mostrar todos"
 */
function showAllUpcomingEvents() {
  const grid = document.getElementById('eventsGrid');
  const showAllBtn = document.getElementById('showAllEventsBtn');
  
  if (!grid) return;
  
  // Renderizar todos los eventos
  grid.innerHTML = upcomingEvents.map(e => renderEventCard(e)).join('');
  
  // Ocultar el botón después de mostrar todos
  if (showAllBtn) {
    showAllBtn.style.display = 'none';
  }
  
  // Animar los nuevos eventos que aparecen (los que estaban ocultos)
  const cards = grid.querySelectorAll('.event-card');
  cards.forEach((card, index) => {
    // Solo animar las tarjetas nuevas (después de INITIAL_EVENTS_COUNT)
    if (index >= INITIAL_EVENTS_COUNT) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      
      // Aplicar animación con delay escalonado
      setTimeout(() => {
        card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, (index - INITIAL_EVENTS_COUNT) * 100);
    }
  });
}

/**
 * Renderiza todos los eventos en el modal de eventos
 * Usado para la vista completa en el modal
 */
function renderAllEvents() {
  const grid = document.getElementById('allEventsGrid');
  if (!grid) return;
  
  if (!Array.isArray(upcomingEvents) || upcomingEvents.length === 0) {
    grid.innerHTML = '<p class="no-events">No hay eventos disponibles.</p>';
    return;
  }
  
  // Renderizar todas las tarjetas con botón diferente
  grid.innerHTML = upcomingEvents.map(e => `
    <div class="event-card" onclick="contactForEvent('${e.team1} vs ${e.team2}')">
      <div class="event-image">
        <img src="${e.image}" alt="${e.team1} vs ${e.team2}">
        <span class="event-badge">${e.badge}</span>
      </div>
      <div class="event-body">
        <div class="event-date">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          ${e.date} • ${e.time}
        </div>
        <div class="event-teams">
          <div class="event-team">
            <div class="team-shield"><img src="${e.team1Icon}" width="30px" /></div>
            <div class="team-name">${e.team1}</div>
          </div>
          <span class="event-vs">VS</span>
          <div class="event-team">
            <div class="team-shield"><img src="${e.team2Icon}" width="30px" /></div>
            <div class="team-name">${e.team2}</div>
          </div>
        </div>
        <div class="event-venue">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          ${e.venue}
        </div>
        <button class="event-cta">Contactar Asesor</button>
      </div>
    </div>
  `).join('');
}

/**
 * Abre WhatsApp con mensaje pre-escrito para consultar sobre un evento
 * @param {string} eventName - Nombre del evento (ej: "Team1 vs Team2")
 */
function contactForEvent(eventName) {
  const message = encodeURIComponent(`Hola SOCCER iD, me interesa: ${eventName}`);
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank');
}

/**
 * Abre el modal de todos los eventos con animación de carga
 */
function openEventsModal() {
  const modal = document.getElementById('eventsModal');
  const loading = document.getElementById('loadingContainer');
  const grid = document.getElementById('allEventsGrid');
  
  if (!modal) return;
  
  // Mostrar modal y bloquear scroll
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  // Mostrar loading
  if (loading) loading.style.display = 'flex';
  if (grid) grid.classList.remove('loaded');
  
  // Simular carga y luego mostrar eventos
  setTimeout(() => {
    if (loading) loading.style.display = 'none';
    renderAllEvents();
    if (grid) grid.classList.add('loaded');
  }, 1500);
}

/**
 * Cierra el modal de eventos
 */
function closeEventsModal() {
  const modal = document.getElementById('eventsModal');
  if (modal) {
    modal.classList.remove('active');
  }
  document.body.style.overflow = '';
}

// ==========================================================================
// PANEL CONTENT - GENERADORES DE CONTENIDO
// ==========================================================================

/**
 * Genera el contenido HTML completo para un panel
 * Detecta el tipo de panel y llama al generador correspondiente
 * @param {string} panelId - ID del panel a generar
 * @returns {string} - HTML del contenido del panel
 */
function generatePanelContent(panelId) {
  const panel = panelTemplates[panelId];
  
  // Si no existe el template, mostrar mensaje de error
  if (!panel) {
    console.warn(`[GKraken] No se encontró template para panel: ${panelId}`);
    return `
      <div class="panel-header">
        <button class="back-btn" onclick="closePanel()">Volver</button>
      </div>
      <div class="panel-body">
        <p>Contenido no disponible</p>
      </div>
    `;
  }
  
  // Header común para todos los paneles
  let content = `
    <div class="panel-header">
      <button class="back-btn" onclick="closePanel()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Volver
      </button>
      <span class="panel-tag">${panel.tag || ''}</span>
    </div>
  `;
  
  // Panel Copa tiene layout especial (fullscreen)
  if (panelId === 'copa') {
    return content + `<div class="panel-body fx-padding">${generateCopaContent(panel)}</div>`;
  }
  
  content += '<div class="panel-body">';
  
  // Seleccionar generador según el tipo de panel
  if (['quienes', 'soccer', 'vip', 'fan'].includes(panelId)) {
    content += generateGalleryContent(panel);
  } else if (panelId === 'seguros') {
    content += generateSegurosContent(panel);
  } else if (panelId === 'media') {
    content += generateMediaContent(panel);
  } else if (panelId === 'opiniones') {
    content += generateOpinionesContent(panel);
  }
  
  return content + '</div>';
}

/**
 * Genera contenido de galería masonry para paneles con imágenes
 * @param {Object} panel - Datos del panel
 * @returns {string} - HTML de la galería
 */
function generateGalleryContent(panel) {
  const gallery = panel.gallery ? GKraken.normalizeToArray(panel.gallery) : [];
  
  let html = `<div class="masonry-grid">`;
  // Tarjeta de texto introductoria
  html += `<div class="masonry-text-card"><h2>${panel.title}</h2><p>${panel.description}</p></div>`;
  
  // Imágenes de la galería
  html += gallery.map((img, i) => `
    <div class="masonry-item${img.tall ? ' tall' : ''}" onclick='openLightbox(${JSON.stringify(gallery)}, ${i})'>
      <img src="${img.src}" alt="${img.alt}">
      ${img.caption ? `<div class="masonry-caption">${img.caption}</div>` : ''}
    </div>
  `).join('');
  
  html += `</div>`;
  return html;
}

/**
 * Genera contenido para el panel de Seguros iD
 * Incluye video en frame de iPhone
 * @param {Object} panel - Datos del panel
 * @returns {string} - HTML del contenido
 */
function generateSegurosContent(panel) {
  return `
    <div class="seguros-container">
      <div class="seguros-header">
        <p>${panel.description}</p>
      </div>
      <div class="iphone-video-container">
        <div class="iphone-frame">
          <div class="iphone-notch"></div>
          <div class="iphone-screen">
            <video autoplay muted loop playsinline>
              <source src="/assets/record.mov" type="video/quicktime">
              <source src="/assets/record.mov" type="video/mp4">
            </video>
          </div>
          <div class="iphone-home-indicator"></div>
        </div>
        <a href="https://segurosid.com" target="_blank" class="cta-conoce-mas">
          Conoce más
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </a>
      </div>
    </div>
  `;
}

/**
 * Genera contenido para el panel de Copa del Mundo 2026
 * Layout fullscreen con imagen de banner
 * @param {Object} panel - Datos del panel
 * @returns {string} - HTML del contenido
 */
function generateCopaContent(panel) {
  return `
    <div class="copa-fullscreen-wrapper">
      <div class="copa-text-section">
        <div class="copa-text-content">
          <h1>${panel.title}</h1>
          <p>${panel.description}</p>
          <a href="https://wa.me/${WHATSAPP_NUMBER}?text=Hola%20SOCCER%20iD%2C%20me%20interesa%20la%20asesoría%20para%20la%20Copa%20del%20Mundo%202026" target="_blank" class="whatsapp-contact-btn">
            <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"></path></svg>
            Solicitar Asesoría
          </a>
        </div>
      </div>
      <div class="copa-banner-section">
        <img src="/assets/images/copa26.jpg" alt="Copa 2026">
      </div>
    </div>
  `;
}

/**
 * Genera contenido para el panel de Media/Prensa
 * Lista de artículos con soporte para revistas interactivas
 * @param {Object} panel - Datos del panel
 * @returns {string} - HTML del contenido
 */
function generateMediaContent(panel) {
  const articles = panel.articles ? GKraken.normalizeToArray(panel.articles) : [];
  
  let html = `<h1 class="panel-title">${panel.title}</h1><p class="panel-description">${panel.description}</p>`;
  
  if (articles.length > 0) {
    html += `<div class="media-articles-container">`;
    
    html += articles.map(a => {
      const isMagazine = a.type === 'magazine';
      
      // Handler diferente para revistas vs artículos externos
      const clickHandler = isMagazine 
        ? `onclick="MagazineReader.openFromData('${a.id}'); return false;"` 
        : '';
      const href = isMagazine ? '#' : a.url;
      const target = isMagazine ? '' : 'target="_blank"';
      
      // Badge especial para revistas
      const badgeHtml = isMagazine 
        ? `<span class="article-type-badge magazine-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
              <path d="M7 7h10v2H7zm0 4h10v2H7zm0 4h7v2H7z"/>
            </svg>
            Revista
           </span>` 
        : '';
      
      return `
        <a href="${href}" ${target} class="media-article-card${isMagazine ? ' magazine-article' : ''}" ${clickHandler} data-article-id="${a.id || ''}">
          <div class="media-article-image">
            <img src="${a.image}" alt="${a.title}">
            ${badgeHtml}
          </div>
          <div class="media-article-body">
            <span class="media-article-source">${a.source}</span>
            <h4>${a.title}</h4>
            <p>${a.excerpt}</p>
          </div>
          <div class="media-article-arrow">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              ${isMagazine 
                ? '<path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2z"/><path d="M12 8l4 4-4 4M8 12h8"/>'
                : '<path d="M5 12h14M12 5l7 7-7 7"/>'}
            </svg>
          </div>
        </a>
      `;
    }).join('');
    
    html += `</div>`;
  }
  
  // Sección de video destacado (opcional)
  if (panel.videoId) {
    html += `
      <h3 class="video-section-title">Video Destacado</h3>
      <div class="video-embed-wrapper">
        <iframe src="https://www.youtube.com/embed/${panel.videoId}" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div>
    `;
  }
  
  return html;
}

/**
 * Genera contenido para el panel de Opiniones/Testimonios
 * Carrusel horizontal de tarjetas de testimonios
 * @param {Object} panel - Datos del panel
 * @returns {string} - HTML del contenido
 */
function generateOpinionesContent(panel) {
  const testimonials = panel.testimonials ? GKraken.normalizeToArray(panel.testimonials) : [];
  
  let html = `<h1 class="panel-title">${panel.title}</h1><p class="panel-description">${panel.description}</p>`;
  
  html += `
    <div class="testimonials-container">
      <div class="testimonials-track" id="testimonialsTrack">
        ${testimonials.map(t => `
          <div class="testimonial-card">
            <div class="testimonial-header">
              <div class="testimonial-avatar-wrapper">
                ${t.image 
                  ? `<img src="${t.image}" alt="${t.name}" class="testimonial-avatar-img" onerror="this.parentElement.innerHTML='<div class=\\'testimonial-avatar-fallback\\'>${t.name.split(' ').map(n => n[0]).join('').substring(0,2)}</div>'">`
                  : `<div class="testimonial-avatar-fallback">${t.name.split(' ').map(n => n[0]).join('').substring(0,2)}</div>`
                }
              </div>
              <div class="testimonial-info">
                <h4>${t.name}</h4>
                <p class="testimonial-handle">${t.handle || ''}</p>
              </div>
            </div>
            <div class="testimonial-stars">${'★'.repeat(t.stars)}</div>
            <p class="testimonial-text">"${t.text}"</p>
          </div>
        `).join('')}
      </div>
      <div class="slider-controls">
        <button class="slider-btn" onclick="slideTestimonials(-1)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>
        <button class="slider-btn" onclick="slideTestimonials(1)">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  
  return html;
}

// ==========================================================================
// PANEL FUNCTIONS - APERTURA Y CIERRE
// ==========================================================================

/**
 * Extrae el nombre de clase CSS de un valor que puede ser string u objeto
 * @param {string|Object} value - Valor a procesar
 * @returns {string} - Nombre de clase CSS
 */
function extractClassName(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return (value.class || value.className || value.name || '').toString().trim();
  }
  return '';
}

/**
 * Abre un panel deslizante con el contenido especificado
 * @param {string} panelId - ID del panel a abrir
 */
function openPanel(panelId) {
  if (!panelId) return;
  
  const mainContainer = document.getElementById('mainContainer');
  const detailPanel = document.getElementById('detailPanel');
  const detailContent = document.getElementById('detailContent');
  
  if (!detailPanel || !detailContent) {
    console.warn('[GKraken] No se encontraron elementos del panel');
    return;
  }
  
  // Remover todas las clases de panel anteriores
  Object.values(panelClasses).forEach(cls => {
    const className = extractClassName(cls);
    if (className) {
      detailPanel.classList.remove(className);
    }
  });
  
  // Agregar la clase del panel actual
  const newClassName = extractClassName(panelClasses[panelId]);
  if (newClassName) {
    detailPanel.classList.add(newClassName);
  }
  
  // Generar y asignar contenido
  detailContent.innerHTML = generatePanelContent(panelId);
  detailContent.scrollTop = 0;
  
  // Animación de salida del contenedor principal
  if (mainContainer) mainContainer.classList.add('slide-out');
  
  // Activar panel con requestAnimationFrame para mejor rendimiento
  requestAnimationFrame(() => {
    detailPanel.classList.add('active');
  });
  
  // Bloquear scroll del body
  document.body.style.overflow = 'hidden';
  
  // Resetear slide para testimonios
  currentSlide = 0;
}

/**
 * Cierra el panel deslizante actual
 */
function closePanel() {
  const mainContainer = document.getElementById('mainContainer');
  const detailPanel = document.getElementById('detailPanel');
  const detailContent = document.getElementById('detailContent');
  
  // Desactivar panel
  if (detailPanel) {
    detailPanel.classList.remove('active');
  }
  
  // Resetear scroll del contenido
  if (detailContent) {
    detailContent.scrollTop = 0;
  }
  
  // Reactivar contenedor principal después de la animación
  setTimeout(() => {
    if (mainContainer) {
      mainContainer.classList.remove('slide-out');
    }
  }, 300);
  
  // Restaurar scroll del body
  document.body.style.overflow = '';
}

/**
 * Navega el carrusel de testimonios
 * @param {number} direction - Dirección (-1 = izquierda, 1 = derecha)
 */
function slideTestimonials(direction) {
  const track = document.getElementById('testimonialsTrack');
  if (!track) return;
  
  const cards = track.querySelectorAll('.testimonial-card');
  if (cards.length === 0) return;
  
  // Calcular ancho de tarjeta incluyendo gap
  const cardWidth = cards[0].offsetWidth + 24;
  
  // Calcular máximo slide posible
  const maxSlide = Math.max(0, cards.length - Math.floor(track.parentElement.offsetWidth / cardWidth));
  
  // Actualizar slide con límites
  currentSlide = Math.max(0, Math.min(currentSlide + direction, maxSlide));
  
  // Aplicar transformación
  track.style.transform = `translateX(-${currentSlide * cardWidth}px)`;
}

// ==========================================================================
// INICIAR APLICACIÓN
// ==========================================================================

/**
 * Punto de entrada de la aplicación
 * Espera a que el DOM esté listo antes de inicializar
 */
if (document.readyState === 'loading') {
  // DOM aún cargando, esperar evento
  document.addEventListener('DOMContentLoaded', initializeGKraken);
} else {
  // DOM ya listo, inicializar inmediatamente
  initializeGKraken();
}