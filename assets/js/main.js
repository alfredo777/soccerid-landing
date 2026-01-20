/**
 * JavaScript Principal - GKrakenCMS
 * Proyecto: soccerid-v5-new-landing
 */

// ==========================================================================
// CONFIGURACIÓN GLOBAL
// ==========================================================================

const GKraken = {
  config: {
    API_BASE: '',
    DEBUG: true,
    CACHE_DURATION: 5 * 60 * 1000
  },
  
  dataFiles: {
    'bentoItemsFirst': 'bento_items_first',
    'bentoItemsSecond': 'bento_items_second',
    'upcomingEvents': 'upcoming_events',
    'panelTemplates': 'panel_templates',
    'panelClasses': 'panel_classes'
  },
  
  cache: new Map(),
  initialized: false,
  
  async loadJSON(filename) {
    const cacheKey = `json_${filename}`;
    const cached = this.cache.get(cacheKey);
    
    if (cached && Date.now() - cached.timestamp < this.config.CACHE_DURATION) {
      if (this.config.DEBUG) console.log(`[GKraken] Cache hit: ${filename}`);
      return cached.data;
    }
    
    try {
      const url = `/contents/${filename}.json?t=${Date.now()}`;
      if (this.config.DEBUG) console.log(`[GKraken] Fetching: ${url}`);
      
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      
      const data = await response.json();
      this.cache.set(cacheKey, { data, timestamp: Date.now() });
      
      if (this.config.DEBUG) console.log(`[GKraken] Loaded: ${filename}`, data);
      return data;
    } catch (error) {
      console.error(`[GKraken] Error cargando ${filename}:`, error);
      return null;
    }
  },
  
  async loadAllData() {
    const data = {};
    const entries = Object.entries(this.dataFiles);
    
    if (this.config.DEBUG) console.log(`[GKraken] Cargando ${entries.length} archivos de datos...`);
    
    const results = await Promise.allSettled(
      entries.map(async ([varName, filename]) => {
        const result = await this.loadJSON(filename);
        return { varName, result };
      })
    );
    
    results.forEach((result) => {
      if (result.status === 'fulfilled' && result.value.result !== null) {
        data[result.value.varName] = result.value.result;
      }
    });
    
    return data;
  },
  
  invalidateCache(filename) {
    if (filename) {
      this.cache.delete(`json_${filename}`);
    } else {
      this.cache.clear();
    }
  },
  
  normalizeToArray(data, possibleKeys = ['data', 'items', 'events', 'list', 'records']) {
    if (Array.isArray(data)) return data;
    if (data == null) return [];
    
    if (typeof data === 'object') {
      for (const key of possibleKeys) {
        if (Array.isArray(data[key])) {
          if (this.config.DEBUG) console.log(`[GKraken] Normalizado: extraído array de propiedad "${key}"`);
          return data[key];
        }
      }
      
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

window.GKraken = GKraken;

// ==========================================================================
// VARIABLES GLOBALES
// ==========================================================================

let bentoItemsFirst = [];
let bentoItemsSecond = [];
let upcomingEvents = [];
let panelTemplates = {};
let panelClasses = {};
let currentSlide = 0;
let lightboxImages = [];
let lightboxIndex = 0;

const WHATSAPP_NUMBER = '12315158991';

// Fallback para panelClasses si no se carga del JSON
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

function unwrapData(obj) {
  if (obj && typeof obj === 'object' && 'data' in obj) {
    return obj.data;
  }
  return obj;
}

function assignGlobalData(allData) {
  if (allData.bentoItemsFirst) {
    bentoItemsFirst = GKraken.normalizeToArray(unwrapData(allData.bentoItemsFirst));
  }
  if (allData.bentoItemsSecond) {
    bentoItemsSecond = GKraken.normalizeToArray(unwrapData(allData.bentoItemsSecond));
  }
  if (allData.upcomingEvents) {
    upcomingEvents = GKraken.normalizeToArray(unwrapData(allData.upcomingEvents));
  }
  if (allData.panelTemplates) {
    const unwrapped = unwrapData(allData.panelTemplates);
    panelTemplates = typeof unwrapped === 'object' && !Array.isArray(unwrapped) ? unwrapped : {};
  }
  if (allData.panelClasses) {
    const unwrapped = unwrapData(allData.panelClasses);
    panelClasses = typeof unwrapped === 'object' && !Array.isArray(unwrapped) ? unwrapped : {};
  }
  
  // Usar fallback si panelClasses está vacío
  if (Object.keys(panelClasses).length === 0) {
    panelClasses = DEFAULT_PANEL_CLASSES;
    console.log('[GKraken] Usando panelClasses por defecto');
  }
  
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

async function initializeGKraken() {
  if (GKraken.initialized) {
    console.warn('[GKraken] Ya inicializado');
    return;
  }
  
  console.log('[GKraken] ═══════════════════════════════════════');
  console.log('[GKraken] Inicializando soccerid-v5-new-landing...');
  console.log('[GKraken] ═══════════════════════════════════════');
  
  try {
    // 1. Cargar todos los datos
    const allData = await GKraken.loadAllData();
    
    // 2. Asignar a variables globales
    assignGlobalData(allData);
    
    // 3. Guardar referencia global
    window.appData = allData;
    
    console.log('[GKraken] Datos cargados:', Object.keys(allData));
    
    // 4. Renderizar componentes
    renderInitial();
    
    // 5. Configurar event listeners
    setupEventListeners();
    
    // 6. Ocultar preloader
    hidePreloader();
    
    GKraken.initialized = true;
    console.log('[GKraken] ✓ Inicialización completada');
    
  } catch (error) {
    console.error('[GKraken] ✗ Error en inicialización:', error);
    // Aún así ocultar preloader para no bloquear la UI
    hidePreloader();
  }
}

// ==========================================================================
// RENDERIZADO INICIAL
// ==========================================================================

function renderInitial() {
  console.log('[GKraken] Renderizando componentes iniciales...');
  
  const gridFirst = document.getElementById('bentoGridFirst');
  const gridSecond = document.getElementById('bentoGridSecond');
  if (gridFirst || gridSecond) {
    console.log('[GKraken] → renderBentoGrids()');
    renderBentoGrids();
  }
  
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

function setupEventListeners() {
  // Keyboard navigation
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeLightbox();
      closePanel();
      closeEventsModal();
    }
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
  });
  
  // Smooth scroll for anchor links
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
  
  // Lightbox background click
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

function hidePreloader() {
  const preloader = document.getElementById('preloader');
  if (preloader) {
    preloader.classList.add('hidden');
  }
}

// ==========================================================================
// LIGHTBOX
// ==========================================================================

function openLightbox(images, index) {
  lightboxImages = GKraken.normalizeToArray(images);
  if (lightboxImages.length === 0) return;
  
  lightboxIndex = index || 0;
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImage');
  
  if (!lightbox || !img) return;
  
  img.src = lightboxImages[lightboxIndex].src;
  img.alt = lightboxImages[lightboxIndex].alt || '';
  lightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.classList.remove('active');
    document.body.style.overflow = '';
  }
}

function navigateLightbox(direction) {
  if (lightboxImages.length === 0) return;
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

function renderBentoGrids() {
  const gridFirst = document.getElementById('bentoGridFirst');
  const gridSecond = document.getElementById('bentoGridSecond');
  
  if (gridFirst && bentoItemsFirst.length > 0) {
    gridFirst.innerHTML = bentoItemsFirst.map(item => `
      <div class="bento-item ${item.class || ''}" data-panel="${item.id || ''}">
        <div class="bento-content">
          <h3>${item.title || ''}</h3>
        </div>
      </div>
    `).join('');
  }
  
  if (gridSecond && bentoItemsSecond.length > 0) {
    gridSecond.innerHTML = bentoItemsSecond.map(item => `
      <div class="bento-item ${item.class || ''}" data-panel="${item.id || ''}">
        <div class="bento-content">
          <h3>${item.title || ''}</h3>
        </div>
      </div>
    `).join('');
  }
  
  // Agregar click listeners
  document.querySelectorAll('.bento-item').forEach(item => {
    item.addEventListener('click', function() {
      const panelId = this.dataset.panel;
      if (panelId) openPanel(panelId);
    });
  });
  
  observeBentoItems();
}

function observeBentoItems() {
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        const items = entry.target.querySelectorAll('.bento-item');
        items.forEach((item, i) => {
          setTimeout(() => item.classList.add('animated'), i * 150);
        });
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
// EVENTS
// ==========================================================================

function renderUpcomingEvents() {
  const grid = document.getElementById('eventsGrid');
  if (!grid) return;
  
  if (!Array.isArray(upcomingEvents) || upcomingEvents.length === 0) {
    grid.innerHTML = '<p class="no-events">No hay eventos próximos disponibles.</p>';
    return;
  }
  
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
        <button class="event-cta">Reservar Boletos</button>
      </div>
    </div>
  `).join('');
}

function renderAllEvents() {
  const grid = document.getElementById('allEventsGrid');
  if (!grid) return;
  
  if (!Array.isArray(upcomingEvents) || upcomingEvents.length === 0) {
    grid.innerHTML = '<p class="no-events">No hay eventos disponibles.</p>';
    return;
  }
  
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

function contactForEvent(eventName) {
  const message = encodeURIComponent(`Hola SOCCER iD, me interesa: ${eventName}`);
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank');
}

function openEventsModal() {
  const modal = document.getElementById('eventsModal');
  const loading = document.getElementById('loadingContainer');
  const grid = document.getElementById('allEventsGrid');
  
  if (!modal) return;
  
  modal.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  if (loading) loading.style.display = 'flex';
  if (grid) grid.classList.remove('loaded');
  
  setTimeout(() => {
    if (loading) loading.style.display = 'none';
    renderAllEvents();
    if (grid) grid.classList.add('loaded');
  }, 1500);
}

function closeEventsModal() {
  const modal = document.getElementById('eventsModal');
  if (modal) {
    modal.classList.remove('active');
  }
  document.body.style.overflow = '';
}

// ==========================================================================
// PANEL CONTENT
// ==========================================================================

function generatePanelContent(panelId) {
  const panel = panelTemplates[panelId];
  if (!panel) {
    console.warn(`[GKraken] No se encontró template para panel: ${panelId}`);
    return '<div class="panel-header"><button class="back-btn" onclick="closePanel()">Volver</button></div><div class="panel-body"><p>Contenido no disponible</p></div>';
  }
  
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
  
  if (panelId === 'copa') {
    return content + `<div class="panel-body fx-padding">${generateCopaContent(panel)}</div>`;
  }
  
  content += '<div class="panel-body">';
  
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

function generateGalleryContent(panel) {
  const gallery = panel.gallery ? GKraken.normalizeToArray(panel.gallery) : [];
  
  let html = `<div class="masonry-grid">`;
  html += `<div class="masonry-text-card"><h2>${panel.title}</h2><p>${panel.description}</p></div>`;
  html += gallery.map((img, i) => `
    <div class="masonry-item${img.tall ? ' tall' : ''}" onclick='openLightbox(${JSON.stringify(gallery)}, ${i})'>
      <img src="${img.src}" alt="${img.alt}">
      ${img.caption ? `<div class="masonry-caption">${img.caption}</div>` : ''}
    </div>
  `).join('');
  html += `</div>`;
  return html;
}

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
        <!--<div class="copa-banner-overlay">
          <span class="banner-tag">Copa 2026</span>
          <h3>Vive la experiencia</h3>
          <p>México, Estados Unidos y Canadá te esperan para el torneo más grande del mundo.</p>
        </div>-->
      </div>
    </div>
  `;
}

function generateMediaContent(panel) {
  const articles = panel.articles ? GKraken.normalizeToArray(panel.articles) : [];
  
  let html = `<h1 class="panel-title">${panel.title}</h1><p class="panel-description">${panel.description}</p>`;
  
  if (articles.length > 0) {
    html += `<div class="media-articles-container">`;
    html += articles.map(a => `
      <a href="${a.url}" target="_blank" class="media-article-card">
        <div class="media-article-image"><img src="${a.image}" alt="${a.title}"></div>
        <div class="media-article-body">
          <span class="media-article-source">${a.source}</span>
          <h4>${a.title}</h4>
          <p>${a.excerpt}</p>
        </div>
        <div class="media-article-arrow">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </div>
      </a>
    `).join('');
    html += `</div>`;
  }
  
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

function generateOpinionesContent(panel) {
  const testimonials = panel.testimonials ? GKraken.normalizeToArray(panel.testimonials) : [];
  
  let html = `<h1 class="panel-title">${panel.title}</h1><p class="panel-description">${panel.description}</p>`;
  
  html += `
    <div class="testimonials-container">
      <div class="testimonials-track" id="testimonialsTrack">
        ${testimonials.map(t => `
          <div class="testimonial-card">
            <div class="testimonial-header">
              <div class="testimonial-avatar">${t.initials}</div>
              <div class="testimonial-info">
                <h4>${t.name}</h4>
                <p>${t.since}</p>
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
// PANEL FUNCTIONS
// ==========================================================================

function extractClassName(value) {
  if (!value) return '';
  if (typeof value === 'string') return value.trim();
  if (typeof value === 'object') {
    return (value.class || value.className || value.name || '').toString().trim();
  }
  return '';
}

function openPanel(panelId) {
  if (!panelId) return;
  
  const mainContainer = document.getElementById('mainContainer');
  const detailPanel = document.getElementById('detailPanel');
  const detailContent = document.getElementById('detailContent');
  
  if (!detailPanel || !detailContent) {
    console.warn('[GKraken] No se encontraron elementos del panel');
    return;
  }
  
  // Remover todas las clases de panel
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
  
  // Animaciones
  if (mainContainer) mainContainer.classList.add('slide-out');
  
  requestAnimationFrame(() => {
    detailPanel.classList.add('active');
  });
  
  document.body.style.overflow = 'hidden';
  currentSlide = 0;
}

function closePanel() {
  const mainContainer = document.getElementById('mainContainer');
  const detailPanel = document.getElementById('detailPanel');
  const detailContent = document.getElementById('detailContent');
  
  if (detailPanel) {
    detailPanel.classList.remove('active');
  }
  
  if (detailContent) {
    detailContent.scrollTop = 0;
  }
  
  setTimeout(() => {
    if (mainContainer) {
      mainContainer.classList.remove('slide-out');
    }
  }, 300);
  
  document.body.style.overflow = '';
}

function slideTestimonials(direction) {
  const track = document.getElementById('testimonialsTrack');
  if (!track) return;
  
  const cards = track.querySelectorAll('.testimonial-card');
  if (cards.length === 0) return;
  
  const cardWidth = cards[0].offsetWidth + 24;
  const maxSlide = Math.max(0, cards.length - Math.floor(track.parentElement.offsetWidth / cardWidth));
  
  currentSlide = Math.max(0, Math.min(currentSlide + direction, maxSlide));
  track.style.transform = `translateX(-${currentSlide * cardWidth}px)`;
}

// ==========================================================================
// INICIAR
// ==========================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGKraken);
} else {
  initializeGKraken();
}