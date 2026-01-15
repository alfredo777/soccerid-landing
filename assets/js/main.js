/**
 * JavaScript Principal - GKrakenCMS
 * Proyecto: soccerid-v4-landing
 * 
 * IMPORTANTE: Los datos se cargan dinámicamente desde /contents/
 * Las funciones que usan datos (render*, openPanel, etc.) se ejecutan
 * DESPUÉS de que los datos estén disponibles.
 */

// ==========================================================================
// CONFIGURACIÓN GLOBAL
// ==========================================================================

const GKraken = {
  config: {
    API_BASE: '',
    DEBUG: true,
    CACHE_DURATION: 5 * 60 * 1000 // 5 minutos
  },
  
  // Mapeo de variables originales a archivos JSON
  dataFiles: {
    'bentoItemsFirst': 'bento_items_first',
    'bentoItemsSecond': 'bento_items_second',
    'upcomingEvents': 'upcoming_events',
    'observerOptions': 'observer_options',
    'panelTemplates': 'panel_templates',
    'panelClasses': 'panel_classes'
  },
  
  cache: new Map(),
  initialized: false,
  
  // ==========================================================================
  // SISTEMA DE CARGA DE DATOS
  // ==========================================================================
  
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
  
  async loadData(varName) {
    const filename = this.dataFiles[varName];
    if (!filename) {
      console.warn(`[GKraken] No hay archivo mapeado para: ${varName}`);
      return null;
    }
    return this.loadJSON(filename);
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
  
  // ==========================================================================
  // UTILIDADES
  // ==========================================================================
  
  getUploadedImage(filename) {
    return `/assets/images/myimages/${filename}`;
  },
  
  async reloadData() {
    this.invalidateCache();
    const data = await this.loadAllData();
    assignGlobalData(data);
    return data;
  }
};

// Hacer disponible globalmente
window.GKraken = GKraken;

// ==========================================================================
// VARIABLES GLOBALES (se llenan después de cargar datos)
// ==========================================================================

let bentoItemsFirst = [];
let bentoItemsSecond = [];
let upcomingEvents = [];
let observerOptions = {};
let panelTemplates = {};
let panelClasses = {};
let currentSlide = 0;
let lightboxImages = [];
let lightboxIndex = 0;

const WHATSAPP_NUMBER = '12315158991';

// Función para asignar datos a variables globales
function assignGlobalData(allData) {
  if (allData.bentoItemsFirst) { bentoItemsFirst = allData.bentoItemsFirst; }
  if (allData.bentoItemsSecond) { bentoItemsSecond = allData.bentoItemsSecond; }
  if (allData.upcomingEvents) { upcomingEvents = allData.upcomingEvents; }
  if (allData.observerOptions) { observerOptions = allData.observerOptions; }
  if (allData.panelTemplates) { panelTemplates = allData.panelTemplates; }
  if (allData.panelClasses) { panelClasses = allData.panelClasses; }
  
  if (GKraken.config.DEBUG) {
    console.log('[GKraken] Variables globales asignadas:', {
      bentoItemsFirst: Array.isArray(bentoItemsFirst) ? bentoItemsFirst.length + ' items' : 'N/A',
      bentoItemsSecond: Array.isArray(bentoItemsSecond) ? bentoItemsSecond.length + ' items' : 'N/A',
      upcomingEvents: Array.isArray(upcomingEvents) ? upcomingEvents.length + ' items' : 'N/A',
      observerOptions: typeof observerOptions === 'object' ? Object.keys(observerOptions).length + ' keys' : 'N/A',
      panelTemplates: typeof panelTemplates === 'object' ? Object.keys(panelTemplates).length + ' keys' : 'N/A',
      panelClasses: typeof panelClasses === 'object' ? Object.keys(panelClasses).length + ' keys' : 'N/A'
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
  console.log('[GKraken] Inicializando soccerid-v4-landing...');
  console.log('[GKraken] ═══════════════════════════════════════');
  
  try {
    // 1. Cargar todos los datos
    const allData = await GKraken.loadAllData();
    
    // 2. Asignar a variables globales
    assignGlobalData(allData);
    
    // 3. Guardar referencia global
    window.appData = allData;
    
    console.log('[GKraken] Datos cargados:', Object.keys(allData));
    
    // 4. Ejecutar renderizado inicial
    renderInitial();
    
    // 5. Configurar event listeners
    setupEventListeners();
    
    GKraken.initialized = true;
    console.log('[GKraken] ✓ Inicialización completada');
    
  } catch (error) {
    console.error('[GKraken] ✗ Error en inicialización:', error);
  }
}

// ==========================================================================
// FUNCIÓN DE RENDERIZADO INICIAL
// ==========================================================================

function renderInitial() {
  console.log('[GKraken] Renderizando componentes iniciales...');
  
  // Renderizar grids si existen los contenedores
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
    if (e.key === 'ArrowLeft') {
      navigateLightbox(-1);
    }
    if (e.key === 'ArrowRight') {
      navigateLightbox(1);
    }
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
      if (e.target === this) {
        closeLightbox();
      }
    });
  }
}

// ==========================================================================
// INICIAR CUANDO EL DOM ESTÉ LISTO
// ==========================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGKraken);
} else {
  initializeGKraken();
}

// ==========================================================================
// LIGHTBOX FUNCTIONS
// ==========================================================================

function openLightbox(images, index) {
  lightboxImages = images;
  lightboxIndex = index;
  const lightbox = document.getElementById('lightbox');
  const img = document.getElementById('lightboxImage');
  img.src = lightboxImages[lightboxIndex].src;
  img.alt = lightboxImages[lightboxIndex].alt;
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
  lightboxIndex += direction;
  if (lightboxIndex < 0) lightboxIndex = lightboxImages.length - 1;
  if (lightboxIndex >= lightboxImages.length) lightboxIndex = 0;
  const img = document.getElementById('lightboxImage');
  if (img) {
    img.src = lightboxImages[lightboxIndex].src;
    img.alt = lightboxImages[lightboxIndex].alt;
  }
}

// ==========================================================================
// RENDER FUNCTIONS
// ==========================================================================

function renderBentoGrids() {
  const gridFirst = document.getElementById('bentoGridFirst');
  const gridSecond = document.getElementById('bentoGridSecond');
  
  if (gridFirst && bentoItemsFirst.length > 0) {
    gridFirst.innerHTML = bentoItemsFirst.map(item => `
      <div class="bento-item ${item.class}" data-panel="${item.id}">
        <div class="bento-content">
          <h3>${item.title}</h3>
        </div>
      </div>
    `).join('');
  }
  
  if (gridSecond && bentoItemsSecond.length > 0) {
    gridSecond.innerHTML = bentoItemsSecond.map(item => `
      <div class="bento-item ${item.class}" data-panel="${item.id}">
        <div class="bento-content">
          <h3>${item.title}</h3>
        </div>
      </div>
    `).join('');
  }
  
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
          setTimeout(() => {
            item.classList.add('animated');
          }, i * 150);
        });
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);

  const gridFirst = document.getElementById('bentoGridFirst');
  const gridSecond = document.getElementById('bentoGridSecond');
  
  if (gridFirst) observer.observe(gridFirst);
  if (gridSecond) observer.observe(gridSecond);
}

function renderUpcomingEvents() {
  const grid = document.getElementById('eventsGrid');
  if (!grid || upcomingEvents.length === 0) return;
  
  grid.innerHTML = upcomingEvents.map(event => `
    <div class="event-card" onclick="contactForEvent('${event.team1} vs ${event.team2} - ${event.date}')">
      <div class="event-image">
        <img src="${event.image}" alt="${event.team1} vs ${event.team2}">
        <span class="event-badge ${event.badgeClass}">${event.badge}</span>
      </div>
      <div class="event-body">
        <div class="event-date">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          ${event.date} • ${event.time}
        </div>
        <div class="event-teams">
          <div class="event-team">
            <div class="team-shield">${event.team1Icon}</div>
            <div class="team-name">${event.team1}</div>
          </div>
          <span class="event-vs">VS</span>
          <div class="event-team">
            <div class="team-shield">${event.team2Icon}</div>
            <div class="team-name">${event.team2}</div>
          </div>
        </div>
        <div class="event-venue">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          ${event.venue}
        </div>
        <button class="event-cta">
          Reservar Boletos
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

function renderAllEvents() {
  const grid = document.getElementById('allEventsGrid');
  if (!grid || upcomingEvents.length === 0) return;
  
  grid.innerHTML = upcomingEvents.map(event => `
    <div class="event-card" onclick="contactForEvent('${event.team1} vs ${event.team2} - ${event.date}')">
      <div class="event-image">
        <img src="${event.image}" alt="${event.team1} vs ${event.team2}">
        <span class="event-badge ${event.badgeClass || ''}">${event.badge}</span>
      </div>
      <div class="event-body">
        <div class="event-date">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          ${event.date} • ${event.time}
        </div>
        <div class="event-teams">
          <div class="event-team">
            <div class="team-shield">${event.team1Icon}</div>
            <div class="team-name">${event.team1}</div>
          </div>
          <span class="event-vs">VS</span>
          <div class="event-team">
            <div class="team-shield">${event.team2Icon}</div>
            <div class="team-name">${event.team2}</div>
          </div>
        </div>
        <div class="event-venue">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          ${event.venue}
        </div>
        <button class="event-cta">
          Contactar Asesor
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  `).join('');
}

// ==========================================================================
// PANEL CONTENT GENERATORS
// ==========================================================================

function generatePanelContent(panelId) {
  const panel = panelTemplates[panelId];
  if (!panel) return '';
  
  let content = `
    <div class="panel-header">
      <button class="back-btn" onclick="closePanel()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Volver
      </button>
      <span class="panel-tag">${panel.tag}</span>
    </div>
    <div class="panel-body">
      <h1 class="panel-title">${panel.title}</h1>
      <p class="panel-description">${panel.description}</p>
  `;
  
  switch(panelId) {
    case 'quienes':
      content += generatePinterestGallery(panel.gallery, 'quienes');
      break;
    case 'soccer':
      content += generateCollageGallery(panel.gallery, 'soccer');
      break;
    case 'vip':
      content += generateCollageGallery(panel.gallery, 'vip', true);
      break;
    case 'seguros':
      content += generateSegurosContent();
      break;
    case 'copa':
      content += generateCopaContent();
      break;
    case 'fan':
      content += generateCollageGallery(panel.gallery, 'fan');
      break;
    case 'media':
      content += generateMediaContent(panel);
      break;
    case 'opiniones':
      content += generateOpinionesContent(panel);
      break;
  }
  
  content += '</div>';
  return content;
}

function generatePinterestGallery(gallery, id) {
  if (!gallery || !Array.isArray(gallery)) return '';
  return `
    <div class="pinterest-gallery">
      ${gallery.map((img, i) => `
        <div class="pinterest-item" onclick='openLightbox(${JSON.stringify(gallery)}, ${i})'>
          <img src="${img.src}" alt="${img.alt}">
          <div class="overlay">
            <span>Ver imagen</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function generateCollageGallery(gallery, id, fourCols = false) {
  if (!gallery || !Array.isArray(gallery)) return '';
  return `
    <div class="collage-gallery ${fourCols ? 'cols-4' : ''}">
      ${gallery.map((img, i) => `
        <div class="collage-item" onclick='openLightbox(${JSON.stringify(gallery)}, ${i})'>
          <img src="${img.src}" alt="${img.alt}">
        </div>
      `).join('')}
    </div>
  `;
}

function generateSegurosContent() {
  return `
    <div class="phone-mockup-container">
      <div class="phone-mockup">
        <div class="phone-screen">
          <div class="app-logo">🛡️</div>
          <div class="app-name">SEGUROS iD</div>
          <div class="app-tagline">La protección que todo deportista necesita</div>
          <div class="app-features-list">
            <div class="feature-item">
              <div class="feature-icon">⚡</div>
              <span>Activación instantánea</span>
            </div>
            <div class="feature-item">
              <div class="feature-icon">🏃</div>
              <span>+50 deportes cubiertos</span>
            </div>
            <div class="feature-item">
              <div class="feature-icon">💰</div>
              <span>Mejor precio del mercado</span>
            </div>
          </div>
        </div>
      </div>
      <a href="https://segurosid.com" target="_blank" class="cta-conoce-mas">
        Conoce más
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </a>
    </div>
  `;
}

function generateCopaContent() {
  return `
    <div class="contact-form-container">
      <h3>Agenda tu Asesoría Gratuita</h3>
      <p>Déjanos tus datos y te contactaremos para ayudarte a planear tu experiencia mundialista.</p>
      <form id="copaContactForm" onsubmit="handleFormSubmit(event, 'copa')">
        <div class="form-grid">
          <div class="form-group">
            <label for="copa-name">Nombre Completo *</label>
            <input type="text" id="copa-name" name="name" placeholder="Tu nombre" required>
          </div>
          <div class="form-group">
            <label for="copa-email">Correo Electrónico *</label>
            <input type="email" id="copa-email" name="email" placeholder="tu@email.com" required>
          </div>
          <div class="form-group">
            <label for="copa-phone">Teléfono / WhatsApp *</label>
            <input type="tel" id="copa-phone" name="phone" placeholder="+52 55 1234 5678" required>
          </div>
          <div class="form-group">
            <label for="copa-country">País de Residencia</label>
            <select id="copa-country" name="country">
              <option value="mexico">México</option>
              <option value="usa">Estados Unidos</option>
              <option value="canada">Canadá</option>
              <option value="otro">Otro país</option>
            </select>
          </div>
          <div class="form-group">
            <label for="copa-team">Selección de tu Interés</label>
            <select id="copa-team" name="team">
              <option value="">Selecciona tu selección</option>
              <option value="mexico">México</option>
              <option value="usa">Estados Unidos</option>
              <option value="argentina">Argentina</option>
              <option value="brasil">Brasil</option>
              <option value="espana">España</option>
              <option value="alemania">Alemania</option>
              <option value="francia">Francia</option>
              <option value="otro">Otra selección</option>
            </select>
          </div>
          <div class="form-group">
            <label for="copa-matches">¿Cuántos partidos te gustaría asistir?</label>
            <select id="copa-matches" name="matches">
              <option value="1-2">1-2 partidos</option>
              <option value="3-5">3-5 partidos</option>
              <option value="fase-grupos">Toda la fase de grupos</option>
              <option value="eliminatorias">Eliminatorias y final</option>
              <option value="todo">El mundial completo</option>
            </select>
          </div>
          <div class="form-group full-width">
            <label for="copa-message">¿Qué partidos o sedes te interesan más?</label>
            <textarea id="copa-message" name="message" placeholder="Cuéntanos sobre tu plan ideal para el Mundial 2026"></textarea>
          </div>
        </div>
        <div class="form-submit">
          <button type="submit" class="submit-btn">
            Agendar Asesoría Gratis
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M5 12h14M12 5l7 7-7 7"/>
            </svg>
          </button>
          <span class="form-note">* Campos obligatorios</span>
        </div>
      </form>
    </div>
  `;
}

function generateMediaContent(panel) {
  if (!panel.articles || !Array.isArray(panel.articles)) return '';
  return `
    <div class="media-articles-container">
      ${panel.articles.map(a => `
        <a href="${a.url}" target="_blank" class="media-article-card">
          <div class="media-article-image">
            <img src="${a.image}" alt="${a.title}">
          </div>
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
      `).join('')}
    </div>
    <h3 class="video-section-title">Video Destacado</h3>
    <div class="video-embed-wrapper">
      <iframe 
        src="https://www.youtube.com/embed/${panel.videoId}" 
        title="Soccer ID Video"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" 
        allowfullscreen>
      </iframe>
    </div>
  `;
}

function generateOpinionesContent(panel) {
  if (!panel.testimonials || !Array.isArray(panel.testimonials)) return '';
  return `
    <div class="testimonials-container">
      <div class="testimonials-track" id="testimonialsTrack">
        ${panel.testimonials.map(t => `
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
}

// ==========================================================================
// PANEL FUNCTIONS
// ==========================================================================

function resetPanelScroll() {
  const detailContent = document.getElementById('detailContent');
  if (detailContent) {
    detailContent.scrollTop = 0;
  }
}

function openPanel(panelId) {
  const mainContainer = document.getElementById('mainContainer');
  const detailPanel = document.getElementById('detailPanel');
  const detailContent = document.getElementById('detailContent');
  
  // Remover todas las clases de panel
  Object.values(panelClasses).forEach(cls => { 
    detailPanel.classList.remove(cls); 
  });
  
  // Agregar la clase del panel actual
  if (panelClasses[panelId]) {
    detailPanel.classList.add(panelClasses[panelId]);
  }
  
  const content = generatePanelContent(panelId);
  detailContent.innerHTML = content;
  
  resetPanelScroll();
  
  mainContainer.classList.add('slide-out');
  
  requestAnimationFrame(() => { 
    detailPanel.classList.add('active'); 
  });
  
  document.body.style.overflow = 'hidden';
  currentSlide = 0;
}

function closePanel() {
  const mainContainer = document.getElementById('mainContainer');
  const detailPanel = document.getElementById('detailPanel');
  
  if (detailPanel) {
    detailPanel.classList.remove('active');
    resetPanelScroll();
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
  currentSlide += direction; 
  currentSlide = Math.max(0, Math.min(currentSlide, maxSlide)); 
  track.style.transform = `translateX(-${currentSlide * cardWidth}px)`; 
}

function handleFormSubmit(event, formType) { 
  event.preventDefault(); 
  const form = event.target; 
  const formData = new FormData(form); 
  const data = Object.fromEntries(formData.entries()); 
  const submitBtn = form.querySelector('.submit-btn'); 
  const originalText = submitBtn.innerHTML; 
  submitBtn.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 6L9 17l-5-5"/></svg>¡Enviado con éxito!`; 
  submitBtn.style.background = 'linear-gradient(135deg, #11998e, #38ef7d)'; 
  submitBtn.disabled = true; 
  setTimeout(() => { 
    form.reset(); 
    submitBtn.innerHTML = originalText; 
    submitBtn.style.background = ''; 
    submitBtn.disabled = false; 
  }, 3000); 
  console.log(`Form ${formType} submitted:`, data); 
}

function contactForEvent(eventName) { 
  const message = encodeURIComponent(`Hola SOCCER iD, me interesa obtener información sobre el evento: ${eventName}`); 
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