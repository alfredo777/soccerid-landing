/**
 * JavaScript Principal - VERSIÓN FINAL OPTIMIZADA
 * Proyecto: landing-soccerid-v2_0
 * Combina: funcionalidad de main2.js + efectos/estilos de main.js
 */

// ==========================================================================
// CONFIGURACIÓN GLOBAL
// ==========================================================================
const CONFIG = {
  API_BASE: '',
  WHATSAPP_NUMBER: '12315158991',
  DEBUG: true,
  ANIMATION_DURATION: 300,
  LOADING_DELAY: 1500
};

const WHATSAPP_NUMBER = CONFIG.WHATSAPP_NUMBER;

const panelClasses = { 
  quienes: 'panel-quienes', 
  soccer: 'panel-soccer', 
  seguros: 'panel-seguros', 
  vip: 'panel-vip', 
  copa: 'panel-copa', 
  fan: 'panel-fan', 
  media: 'panel-media', 
  socios: 'panel-socios', 
  opiniones: 'panel-opiniones' 
};

let currentSlide = 0;
let cachedData = {};
let isAnimating = false;

// ==========================================================================
// UTILIDADES DE LOG (solo en modo DEBUG)
// ==========================================================================

function log(category, message, type = 'log') {
  if (!CONFIG.DEBUG) return;
  const prefix = `[${category}]`;
  switch(type) {
    case 'error': console.error(prefix, message); break;
    case 'warn': console.warn(prefix, message); break;
    default: console.log(prefix, message);
  }
}

// ==========================================================================
// UTILIDADES DE CARGA DE DATOS
// ==========================================================================

async function loadJSONData(filename) {
  // Si ya está en cache, retornarlo
  if (cachedData[filename]) {
    log('Cache', `Hit: ${filename}`);
    return cachedData[filename];
  }
  
  const url = `/contents/${filename}.json`;
  log('Fetch', `Cargando: ${url}`);
  
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    
    const text = await response.text();
    
    // Intentar parsear JSON
    let data;
    try {
      data = JSON.parse(text);
    } catch (parseError) {
      log('JSON', `Error parseando ${filename}: ${parseError.message}`, 'error');
      log('JSON', `Contenido recibido: ${text.substring(0, 200)}`, 'error');
      throw parseError;
    }
    
    cachedData[filename] = data;
    log('Fetch', `✓ Cargado: ${filename}`);
    return data;
    
  } catch (error) {
    log('Fetch', `✗ Error cargando ${filename}: ${error.message}`, 'error');
    return null;
  }
}

// Versión síncrona para compatibilidad
function getJSONData(filename) {
  return cachedData[filename] || null;
}

// ==========================================================================
// UTILIDADES DE TEXTO
// ==========================================================================

function truncateText(text, maxLength) {
  if (!text || text.length <= maxLength) return text;
  return text.substring(0, maxLength).trim() + '...';
}

function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function escapeForOnclick(text) {
  if (!text) return '';
  return text.replace(/'/g, "\\'").replace(/"/g, '\\"');
}

// ==========================================================================
// RENDERIZADO DE COMPONENTES
// ==========================================================================

async function renderBentoGrid() {
  log('Bento Grid', 'Iniciando render...');
  
  const grid = document.getElementById('bentoGrid');
  if (!grid) {
    log('Bento Grid', '✗ Elemento #bentoGrid no encontrado', 'error');
    return;
  }
  
  const data = await loadJSONData('bento_grid');
  if (!data) {
    log('Bento Grid', '✗ No se pudieron cargar los datos', 'error');
    grid.innerHTML = '<p class="error-message">Error cargando contenido</p>';
    return;
  }
  
  const items = data.items || data;
  
  if (!Array.isArray(items) || items.length === 0) {
    log('Bento Grid', '✗ No hay items para renderizar', 'error');
    return;
  }
  
  grid.innerHTML = items.map((item, index) => `
    <div class="bento-item ${item.class || ''}" data-panel="${item.id}" style="animation-delay: ${index * 0.1}s">
      <div class="bento-content">
        <span class="tag">${escapeHtml(item.tag) || ''}</span>
        <h3>${escapeHtml(item.title) || ''}</h3>
        <p>${escapeHtml(item.description) || ''}</p>
      </div>
    </div>
  `).join('');
  
  // Event listeners con prevención de doble click
  grid.querySelectorAll('.bento-item').forEach(item => { 
    item.addEventListener('click', function(e) { 
      e.preventDefault();
      if (isAnimating) return;
      const panelId = this.dataset.panel; 
      if (panelId) openPanel(panelId); 
    }); 
  });
  
  log('Bento Grid', `✓ Renderizado: ${items.length} items`);
}

async function renderUpcomingEvents() {
  log('Events Grid', 'Iniciando render...');
  
  const grid = document.getElementById('eventsGrid');
  if (!grid) {
    log('Events Grid', '✗ Elemento #eventsGrid no encontrado', 'error');
    return;
  }
  
  const data = await loadJSONData('events_grid');
  if (!data) {
    log('Events Grid', '✗ No se pudieron cargar los datos', 'error');
    grid.innerHTML = '<p class="error-message">Error cargando eventos</p>';
    return;
  }
  
  const events = data.events || data;
  
  if (!Array.isArray(events) || events.length === 0) {
    log('Events Grid', '✗ No hay eventos para renderizar', 'error');
    return;
  }
  
  grid.innerHTML = events.map((event, index) => {
    const eventInfo = escapeForOnclick(`${event.team1} vs ${event.team2} - ${event.date}`);
    return `
    <div class="event-card" onclick="contactForEvent('${eventInfo}')" style="animation-delay: ${index * 0.15}s">
      <div class="event-image">
        <img src="${event.image}" alt="${escapeHtml(event.team1)} vs ${escapeHtml(event.team2)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600'; this.onerror=null;">
        <span class="event-badge ${event.badgeClass || ''}">${escapeHtml(event.badge) || ''}</span>
      </div>
      <div class="event-body">
        <div class="event-date">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          ${escapeHtml(event.date)} • ${escapeHtml(event.time)}
        </div>
        <div class="event-teams">
          <div class="event-team">
            <div class="team-shield">${event.team1Icon || ''}</div>
            <div class="team-name">${escapeHtml(event.team1)}</div>
          </div>
          <span class="event-vs">VS</span>
          <div class="event-team">
            <div class="team-shield">${event.team2Icon || ''}</div>
            <div class="team-name">${escapeHtml(event.team2)}</div>
          </div>
        </div>
        <div class="event-venue">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          ${escapeHtml(event.venue)}
        </div>
        <button class="event-cta">
          Reservar Boletos
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  `}).join('');
  
  log('Events Grid', `✓ Renderizado: ${events.length} eventos`);
}

async function renderAllEvents() {
  log('All Events', 'Iniciando render...');
  
  const grid = document.getElementById('allEventsGrid');
  if (!grid) {
    log('All Events', '✗ Elemento #allEventsGrid no encontrado', 'error');
    return;
  }
  
  const data = await loadJSONData('all_events_modal');
  if (!data) {
    log('All Events', '✗ No se pudieron cargar los datos', 'error');
    grid.innerHTML = '<p class="error-message">Error cargando eventos</p>';
    return;
  }
  
  const events = data.events || data;
  
  grid.innerHTML = events.map((event, index) => {
    const eventInfo = escapeForOnclick(`${event.team1} vs ${event.team2} - ${event.date}`);
    return `
    <div class="event-card" onclick="contactForEvent('${eventInfo}')" style="animation-delay: ${index * 0.1}s">
      <div class="event-image">
        <img src="${event.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600'}" alt="${escapeHtml(event.team1)} vs ${escapeHtml(event.team2)}" loading="lazy">
        <span class="event-badge ${event.badgeClass || ''}">${escapeHtml(event.badge)}</span>
      </div>
      <div class="event-body">
        <div class="event-date">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="4" width="18" height="18" rx="2"/>
            <line x1="16" y1="2" x2="16" y2="6"/>
            <line x1="8" y1="2" x2="8" y2="6"/>
            <line x1="3" y1="10" x2="21" y2="10"/>
          </svg>
          ${escapeHtml(event.date)} • ${escapeHtml(event.time)}
        </div>
        <div class="event-teams">
          <div class="event-team">
            <div class="team-shield">${event.team1Icon || ''}</div>
            <div class="team-name">${escapeHtml(event.team1)}</div>
          </div>
          <span class="event-vs">VS</span>
          <div class="event-team">
            <div class="team-shield">${event.team2Icon || ''}</div>
            <div class="team-name">${escapeHtml(event.team2)}</div>
          </div>
        </div>
        <div class="event-venue">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/>
            <circle cx="12" cy="10" r="3"/>
          </svg>
          ${escapeHtml(event.venue)}
        </div>
        <button class="event-cta">
          Contactar Asesor
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </button>
      </div>
    </div>
  `}).join('');
  
  log('All Events', `✓ Renderizado: ${events.length} eventos`);
}

// ==========================================================================
// GENERADOR DE CONTENIDO DE PANELES
// ==========================================================================

async function generatePanelContent(panelId) {
  const allData = await loadJSONData('detail_panels');
  
  if (!allData || !allData.panels || !allData.panels[panelId]) {
    log('Panel', `${panelId} no encontrado en los datos`, 'error');
    return `
      <div class="panel-header">
        <button class="back-btn" onclick="closePanel()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Volver
        </button>
      </div>
      <div class="panel-body">
        <p class="error-message">Error cargando contenido del panel</p>
      </div>
    `;
  }
  
  const panel = allData.panels[panelId];
  const whatsapp = allData.whatsappNumber || WHATSAPP_NUMBER;
  
  let content = `
    <div class="panel-header">
      <button class="back-btn" onclick="closePanel()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Volver
      </button>
      <span class="panel-tag">${escapeHtml(panel.tag) || ''}</span>
    </div>
    <div class="panel-body">
      <h1 class="panel-title">${escapeHtml(panel.title) || ''}</h1>
      <p class="panel-description">${escapeHtml(panel.description) || ''}</p>
  `;
  
  // Generar contenido específico según el panel
  switch(panelId) {
    case 'quienes': 
      content += generateQuienesContent(panel); 
      break;
    case 'soccer': 
      content += generateSoccerContent(panel, whatsapp); 
      break;
    case 'seguros': 
      content += generateSegurosContent(panel); 
      break;
    case 'vip': 
      content += generateVIPContent(panel); 
      break;
    case 'copa': 
      content += generateCopaContent(panel, whatsapp); 
      break;
    case 'fan': 
      content += generateFanContent(panel); 
      break;
    case 'media': 
      content += generateMediaContent(panel); 
      break;
    case 'socios': 
      content += generateSociosContent(panel); 
      break;
    case 'opiniones': 
      content += generateOpinionesContent(panel); 
      break;
    default: 
      content += '<p>Contenido no disponible</p>';
  }
  
  content += '</div>';
  return content;
}

// ==========================================================================
// GENERADORES DE CONTENIDO ESPECÍFICO POR PANEL
// ==========================================================================

function generateQuienesContent(panel) { 
  const statsHtml = (panel.stats || []).map(s => `
    <div class="stat-item">
      <div class="stat-value">${escapeHtml(s.value)}</div>
      <div class="stat-label">${escapeHtml(s.label)}</div>
    </div>
  `).join('');
  
  const teamHtml = (panel.team || []).map(t => `
    <div class="team-member">
      <div class="team-avatar">${escapeHtml(t.initials)}</div>
      <h4>${escapeHtml(t.name)}</h4>
      <p>${escapeHtml(t.role)}</p>
    </div>
  `).join('');
  
  const valuesHtml = (panel.values || []).map(v => `
    <div class="feature-card">
      <div class="feature-icon" style="background: ${v.gradient};">${v.icon}</div>
      <h4>${escapeHtml(v.title)}</h4>
      <p>${escapeHtml(v.description)}</p>
    </div>
  `).join('');
  
  return `
    <div class="stats-row">${statsHtml}</div>
    <h2 class="section-title">Nuestro Equipo</h2>
    <div class="team-grid">${teamHtml}</div>
    <h2 class="section-title">Nuestros Valores</h2>
    <div class="cards-grid">${valuesHtml}</div>
    <div class="cta-group">
      <a href="#contacto" class="cta-btn primary" onclick="closePanel()">
        Contáctanos
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </a>
      <a href="#" class="cta-btn secondary">Ver Vacantes</a>
    </div>
  `; 
}

function generateSoccerContent(panel, whatsapp) { 
  const matchesHtml = (panel.matches || []).map(m => `
    <div class="match-card">
      <div class="match-date">${escapeHtml(m.date)}</div>
      <div class="match-teams">
        <div class="team">
          <div class="team-logo">${m.team1Icon}</div>
          <div class="team-name-match">${escapeHtml(m.team1)}</div>
        </div>
        <span class="vs">VS</span>
        <div class="team">
          <div class="team-logo">${m.team2Icon}</div>
          <div class="team-name-match">${escapeHtml(m.team2)}</div>
        </div>
      </div>
      <div class="match-venue">${escapeHtml(m.venue)}</div>
      <span class="match-status ${m.status || ''}">Boletos Disponibles</span>
    </div>
  `).join('');
  
  const galleryHtml = (panel.gallery || []).map((img, i) => `
    <div class="gallery-item">
      <img src="${img}" alt="Galería ${i+1}" loading="lazy">
    </div>
  `).join('');
  
  return `
    <h2 class="section-title">Próximos Partidos</h2>
    <div class="matches-grid">${matchesHtml}</div>
    <h2 class="section-title">Galería de Eventos</h2>
    <div class="gallery-grid">${galleryHtml}</div>
    <div class="cta-group">
      <a href="https://wa.me/${whatsapp}?text=Hola%2C%20me%20interesa%20comprar%20boletos%20para%20SOCCER%20iD%20CUP" target="_blank" class="cta-btn primary">
        Comprar Boletos
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </a>
      <a href="#" class="cta-btn secondary" onclick="closePanel(); setTimeout(openEventsModal, 300);">
        Ver Todos los Eventos
      </a>
    </div>
  `; 
}

function generateSegurosContent(panel) { 
  const iconSvgs = { 
    shield: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>', 
    clock: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>', 
    layers: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>', 
    chat: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' 
  }; 
  
  const featuresHtml = (panel.features || []).map(f => `
    <div class="app-feature">
      <div class="app-feature-icon">${iconSvgs[f.icon] || ''}</div>
      <div>
        <h4>${escapeHtml(f.title)}</h4>
        <p>${escapeHtml(f.description)}</p>
      </div>
    </div>
  `).join('');
  
  const plansHtml = (panel.plans || []).map(p => `
    <div class="feature-card">
      <div class="feature-icon" style="background: ${p.gradient};">${p.icon}</div>
      <h4>${escapeHtml(p.title)}</h4>
      <p>${escapeHtml(p.description)}</p>
    </div>
  `).join('');
  
  return `
    <div class="video-container">
      <div class="video-placeholder">
        <div class="play-button">
          <svg viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
        <p style="color: rgba(255,255,255,0.6);">Ver video explicativo</p>
      </div>
    </div>
    <h2 class="section-title">Características de la App</h2>
    <div class="app-features">${featuresHtml}</div>
    <h2 class="section-title">Planes Disponibles</h2>
    <div class="cards-grid">${plansHtml}</div>
    <div class="cta-group">
      <a href="https://segurosid.com" target="_blank" class="cta-btn primary">
        Ir a SegurosID.com
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/>
          <polyline points="15 3 21 3 21 9"/>
          <line x1="10" y1="14" x2="21" y2="3"/>
        </svg>
      </a>
      <a href="#" class="cta-btn secondary">Descargar App</a>
    </div>
  `; 
}

function generateVIPContent(panel) { 
  const includesHtml = (panel.includes || []).map(i => `
    <div class="feature-card">
      <div class="feature-icon" style="background: linear-gradient(135deg, #8E2DE2, #4A00E0);">${i.icon}</div>
      <h4>${escapeHtml(i.title)}</h4>
      <p>${escapeHtml(i.description)}</p>
    </div>
  `).join('');
  
  return `
    <div class="video-container">
      <div class="video-placeholder">
        <div class="play-button">
          <svg viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg>
        </div>
        <p style="color: rgba(255,255,255,0.6);">Descubre la experiencia VIP</p>
      </div>
    </div>
    <h2 class="section-title">Qué Incluye</h2>
    <div class="cards-grid">${includesHtml}</div>
    <div class="contact-form-container">
      <h3>Cotiza tu Experiencia VIP</h3>
      <p>Completa el formulario y un asesor se pondrá en contacto contigo en menos de 24 horas.</p>
      <form id="vipContactForm" onsubmit="handleFormSubmit(event, 'vip')">
        <div class="form-grid">
          <div class="form-group">
            <label for="vip-name">Nombre Completo *</label>
            <input type="text" id="vip-name" name="name" placeholder="Tu nombre" required>
          </div>
          <div class="form-group">
            <label for="vip-email">Correo Electrónico *</label>
            <input type="email" id="vip-email" name="email" placeholder="tu@email.com" required>
          </div>
          <div class="form-group">
            <label for="vip-phone">Teléfono *</label>
            <input type="tel" id="vip-phone" name="phone" placeholder="+52 55 1234 5678" required>
          </div>
          <div class="form-group">
            <label for="vip-event">Tipo de Evento</label>
            <select id="vip-event" name="event">
              <option value="">Selecciona una opción</option>
              <option value="liga-mx">Liga MX</option>
              <option value="champions">UEFA Champions League</option>
              <option value="nfl">NFL</option>
              <option value="nba">NBA</option>
              <option value="f1">Fórmula 1</option>
              <option value="box">Box / UFC</option>
              <option value="otro">Otro evento</option>
            </select>
          </div>
          <div class="form-group">
            <label for="vip-guests">Número de Personas</label>
            <select id="vip-guests" name="guests">
              <option value="1-2">1-2 personas</option>
              <option value="3-5">3-5 personas</option>
              <option value="6-10">6-10 personas</option>
              <option value="10+">Más de 10 personas</option>
            </select>
          </div>
          <div class="form-group">
            <label for="vip-budget">Presupuesto Aproximado</label>
            <select id="vip-budget" name="budget">
              <option value="">Selecciona una opción</option>
              <option value="10k-25k">$10,000 - $25,000 MXN</option>
              <option value="25k-50k">$25,000 - $50,000 MXN</option>
              <option value="50k-100k">$50,000 - $100,000 MXN</option>
              <option value="100k+">Más de $100,000 MXN</option>
            </select>
          </div>
          <div class="form-group full-width">
            <label for="vip-message">Cuéntanos más sobre tu experiencia ideal</label>
            <textarea id="vip-message" name="message" placeholder="¿Qué evento te gustaría asistir? ¿Tienes alguna fecha en mente?"></textarea>
          </div>
        </div>
        <div class="form-submit">
          <button type="submit" class="submit-btn">
            Enviar Solicitud
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

function generateCopaContent(panel, whatsapp) { 
  const iconSvgs = { 
    camera: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/></svg>', 
    calendar: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>', 
    location: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>', 
    users: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>' 
  }; 
  
  const statsHtml = (panel.stats || []).map(s => `
    <div class="stat-item">
      <div class="stat-value">${escapeHtml(s.value)}</div>
      <div class="stat-label">${escapeHtml(s.label)}</div>
    </div>
  `).join('');
  
  const venuesHtml = (panel.venues || []).map(v => `
    <div class="feature-card">
      <div class="feature-icon" style="background: ${v.gradient};">${v.icon}</div>
      <h4>${escapeHtml(v.title)}</h4>
      <p>${escapeHtml(v.description)}</p>
    </div>
  `).join('');
  
  const servicesHtml = (panel.services || []).map(s => `
    <div class="app-feature">
      <div class="app-feature-icon">${iconSvgs[s.icon] || ''}</div>
      <div>
        <h4>${escapeHtml(s.title)}</h4>
        <p>${escapeHtml(s.description)}</p>
      </div>
    </div>
  `).join('');
  
  return `
    <div class="stats-row">${statsHtml}</div>
    <h2 class="section-title">Sedes del Mundial</h2>
    <div class="cards-grid">${venuesHtml}</div>
    <h2 class="section-title">Nuestros Servicios</h2>
    <div class="app-features">${servicesHtml}</div>
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
    <div class="cta-group">
      <a href="https://wa.me/${whatsapp}?text=Hola%2C%20me%20interesa%20la%20asesor%C3%ADa%20para%20el%20Mundial%202026" target="_blank" class="cta-btn secondary">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
          <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/>
        </svg>
        WhatsApp Directo
      </a>
    </div>
  `; 
}

function generateFanContent(panel) { 
  const promosHtml = (panel.promos || []).map(p => `
    <div class="promo-card">
      <img src="${p.image}" alt="${escapeHtml(p.title)}" loading="lazy">
      <span class="promo-badge">${escapeHtml(p.badge)}</span>
      <div class="promo-overlay">
        <h4>${escapeHtml(p.title)}</h4>
        <p>${escapeHtml(p.description)}</p>
      </div>
    </div>
  `).join('');
  
  const rafflesHtml = (panel.raffles || []).map(r => `
    <div class="feature-card">
      <div class="feature-icon" style="background: linear-gradient(135deg, #00b09b, #96c93d);">${r.icon}</div>
      <h4>${escapeHtml(r.title)}</h4>
      <p>${escapeHtml(r.description)}</p>
    </div>
  `).join('');
  
  return `
    <h2 class="section-title">Promociones Activas</h2>
    <div class="promo-grid">${promosHtml}</div>
    <h2 class="section-title">Sorteos del Mes</h2>
    <div class="cards-grid">${rafflesHtml}</div>
    <div class="cta-group">
      <a href="#" class="cta-btn primary">
        Unirse al Club
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </a>
      <a href="#" class="cta-btn secondary">Ver Todos los Premios</a>
    </div>
  `; 
}

function generateMediaContent(panel) { 
  const articlesHtml = (panel.articles || []).map(a => `
    <div class="article-item">
      <div class="article-image">
        <img src="${a.image}" alt="${escapeHtml(a.title)}" loading="lazy">
      </div>
      <div class="article-content">
        <span class="article-source">${escapeHtml(a.source)}</span>
        <h4>${escapeHtml(a.title)}</h4>
        <p>${escapeHtml(a.excerpt)}</p>
      </div>
    </div>
  `).join('');
  
  const tvHtml = (panel.tvAppearances || []).map(tv => `
    <div class="feature-card">
      <div class="feature-icon" style="background: linear-gradient(135deg, #eb3349, #f45c43);">📺</div>
      <h4>${escapeHtml(tv.channel)}</h4>
      <p>${escapeHtml(tv.description)}</p>
    </div>
  `).join('');
  
  return `
    <h2 class="section-title">Cobertura Reciente</h2>
    <div class="articles-list">${articlesHtml}</div>
    <h2 class="section-title">Apariciones en TV</h2>
    <div class="cards-grid">${tvHtml}</div>
    <div class="cta-group">
      <a href="#" class="cta-btn primary">
        Kit de Prensa
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
          <polyline points="7 10 12 15 17 10"/>
          <line x1="12" y1="15" x2="12" y2="3"/>
        </svg>
      </a>
      <a href="#" class="cta-btn secondary">Contacto de Prensa</a>
    </div>
  `; 
}

function generateSociosContent(panel) { 
  const brandsHtml = (panel.brands || []).map(b => `
    <div class="partner-logo">
      <span>${escapeHtml(b)}</span>
    </div>
  `).join('');
  
  const creatorsHtml = (panel.creators || []).map(c => `
    <div class="team-member">
      <div class="team-avatar">${c.icon}</div>
      <h4>${escapeHtml(c.handle)}</h4>
      <p>${escapeHtml(c.followers)}</p>
    </div>
  `).join('');
  
  const benefitsHtml = (panel.benefits || []).map(b => `
    <div class="feature-card">
      <div class="feature-icon" style="background: linear-gradient(135deg, #4568dc, #b06ab3);">${b.icon}</div>
      <h4>${escapeHtml(b.title)}</h4>
      <p>${escapeHtml(b.description)}</p>
    </div>
  `).join('');
  
  return `
    <h2 class="section-title">Marcas Aliadas</h2>
    <div class="partners-grid">${brandsHtml}</div>
    <h2 class="section-title">Creadores de Contenido</h2>
    <div class="team-grid">${creatorsHtml}</div>
    <h2 class="section-title">Beneficios de Ser Partner</h2>
    <div class="cards-grid">${benefitsHtml}</div>
    <div class="cta-group">
      <a href="#" class="cta-btn primary">
        Convertirse en Partner
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </a>
      <a href="#" class="cta-btn secondary">Descargar Media Kit</a>
    </div>
  `; 
}

function generateOpinionesContent(panel) { 
  const statsHtml = (panel.stats || []).map(s => `
    <div class="stat-item">
      <div class="stat-value">${escapeHtml(s.value)}</div>
      <div class="stat-label">${escapeHtml(s.label)}</div>
    </div>
  `).join('');
  
  const testimonialsHtml = (panel.testimonials || []).map(t => `
    <div class="testimonial-card">
      <div class="testimonial-header">
        <div class="testimonial-avatar">${escapeHtml(t.initials)}</div>
        <div class="testimonial-info">
          <h4>${escapeHtml(t.name)}</h4>
          <p>${escapeHtml(t.since)}</p>
        </div>
      </div>
      <div class="testimonial-stars">${'★'.repeat(t.stars || 5)}</div>
      <p class="testimonial-text">"${escapeHtml(t.text)}"</p>
    </div>
  `).join('');
  
  const ratingsHtml = (panel.ratings || []).map(r => `
    <div class="feature-card">
      <div class="feature-icon" style="background: linear-gradient(135deg, #ff6a00, #ee0979);">⭐</div>
      <h4>${escapeHtml(r.service)}</h4>
      <p>${escapeHtml(r.rating)} - "${escapeHtml(r.quote)}"</p>
    </div>
  `).join('');
  
  return `
    <div class="stats-row">${statsHtml}</div>
    <h2 class="section-title">Lo Que Dicen Nuestros Clientes</h2>
    <div class="testimonials-container">
      <div class="testimonials-track" id="testimonialsTrack">${testimonialsHtml}</div>
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
    <h2 class="section-title">Calificaciones por Servicio</h2>
    <div class="cards-grid">${ratingsHtml}</div>
    <div class="cta-group">
      <a href="#" class="cta-btn primary">
        Dejar una Opinión
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l7 7-7 7"/>
        </svg>
      </a>
      <a href="#" class="cta-btn secondary">Ver Todas las Reseñas</a>
    </div>
  `; 
}

// ==========================================================================
// FUNCIONES DE PANEL CON ANIMACIONES
// ==========================================================================

function resetPanelScroll() {
  const detailContent = document.getElementById('detailContent');
  if (detailContent) {
    detailContent.scrollTop = 0;
  }
}

async function openPanel(panelId) {
  if (isAnimating) return;
  isAnimating = true;
  
  const mainContainer = document.getElementById('mainContainer');
  const detailPanel = document.getElementById('detailPanel');
  const detailContent = document.getElementById('detailContent');
  
  if (!mainContainer || !detailPanel || !detailContent) {
    log('Panel', 'Elementos del DOM no encontrados', 'error');
    isAnimating = false;
    return;
  }
  
  // Mostrar loading con animación
  detailContent.innerHTML = `
    <div class="panel-loading">
      <div class="loading-spinner"></div>
      <p>Cargando...</p>
    </div>
  `;
  
  // Remover todas las clases de panel previas
  Object.values(panelClasses).forEach(cls => { 
    detailPanel.classList.remove(cls); 
  });
  
  // Agregar la clase específica del panel
  if (panelClasses[panelId]) {
    detailPanel.classList.add(panelClasses[panelId]);
  }
  
  // Animar salida del contenedor principal
  mainContainer.classList.add('slide-out');
  
  // Mostrar panel con animación
  requestAnimationFrame(() => { 
    detailPanel.classList.add('active'); 
  });
  
  // Bloquear scroll del body
  document.body.style.overflow = 'hidden';
  
  // Generar y establecer contenido
  try {
    const content = await generatePanelContent(panelId);
    
    // Pequeño delay para que se vea la animación de carga
    await new Promise(resolve => setTimeout(resolve, 200));
    
    detailContent.innerHTML = content;
    
    // Animar entrada de los elementos del contenido
    const animatedElements = detailContent.querySelectorAll('.feature-card, .stat-item, .team-member, .match-card, .article-item, .testimonial-card');
    animatedElements.forEach((el, index) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      setTimeout(() => {
        el.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
      }, index * 50);
    });
    
  } catch (error) {
    log('Panel', `Error generando contenido: ${error.message}`, 'error');
    detailContent.innerHTML = `
      <div class="panel-header">
        <button class="back-btn" onclick="closePanel()">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M19 12H5M12 19l-7-7 7-7"/>
          </svg>
          Volver
        </button>
      </div>
      <div class="panel-body">
        <p class="error-message">Error cargando el contenido</p>
      </div>
    `;
  }
  
  // Resetear scroll
  resetPanelScroll();
  
  // Resetear slider de testimonios
  currentSlide = 0;
  
  // Terminar animación
  setTimeout(() => {
    isAnimating = false;
  }, CONFIG.ANIMATION_DURATION);
}

function closePanel() {
  if (isAnimating) return;
  isAnimating = true;
  
  const mainContainer = document.getElementById('mainContainer');
  const detailPanel = document.getElementById('detailPanel');
  
  if (!detailPanel) {
    isAnimating = false;
    return;
  }
  
  // Ocultar panel con animación
  detailPanel.classList.remove('active');
  
  // Resetear scroll
  resetPanelScroll();
  
  // Mostrar contenedor principal después de la animación
  setTimeout(() => { 
    if (mainContainer) {
      mainContainer.classList.remove('slide-out'); 
    }
    isAnimating = false;
  }, CONFIG.ANIMATION_DURATION);
  
  // Desbloquear scroll del body
  document.body.style.overflow = '';
}

// ==========================================================================
// FUNCIONES DE UTILIDAD
// ==========================================================================

function slideTestimonials(direction) { 
  const track = document.getElementById('testimonialsTrack'); 
  if (!track) return; 
  
  const cards = track.querySelectorAll('.testimonial-card'); 
  if (cards.length === 0) return; 
  
  const cardWidth = cards[0].offsetWidth + 24; // 24px = gap
  const containerWidth = track.parentElement.offsetWidth;
  const visibleCards = Math.floor(containerWidth / cardWidth);
  const maxSlide = Math.max(0, cards.length - visibleCards); 
  
  currentSlide += direction; 
  currentSlide = Math.max(0, Math.min(currentSlide, maxSlide)); 
  
  track.style.transition = 'transform 0.4s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
  track.style.transform = `translateX(-${currentSlide * cardWidth}px)`; 
}

function handleFormSubmit(event, formType) { 
  event.preventDefault(); 
  
  const form = event.target; 
  const formData = new FormData(form); 
  const data = Object.fromEntries(formData.entries()); 
  const submitBtn = form.querySelector('.submit-btn'); 
  
  if (!submitBtn) return;
  
  // Deshabilitar botón y mostrar estado de carga
  const originalText = submitBtn.innerHTML; 
  submitBtn.disabled = true;
  submitBtn.innerHTML = `
    <div class="btn-spinner"></div>
    Enviando...
  `; 
  
  // Simular envío (aquí iría la lógica real de envío)
  setTimeout(() => {
    submitBtn.innerHTML = `
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M20 6L9 17l-5-5"/>
      </svg>
      ¡Enviado con éxito!
    `; 
    submitBtn.style.background = 'linear-gradient(135deg, #11998e, #38ef7d)'; 
    
    // Restaurar después de 3 segundos
    setTimeout(() => { 
      form.reset(); 
      submitBtn.innerHTML = originalText; 
      submitBtn.style.background = ''; 
      submitBtn.disabled = false; 
    }, 3000);
  }, 1500);
  
  log('Form', `${formType} submitted:`, data); 
}

function contactForEvent(eventName) { 
  const message = encodeURIComponent(`Hola SOCCER iD, me interesa obtener información sobre el evento: ${eventName}`); 
  window.open(`https://wa.me/${WHATSAPP_NUMBER}?text=${message}`, '_blank'); 
}

function openEventsModal() { 
  const modal = document.getElementById('eventsModal'); 
  const loading = document.getElementById('loadingContainer'); 
  const grid = document.getElementById('allEventsGrid'); 
  
  if (!modal) {
    log('Modal', 'eventsModal no encontrado', 'error');
    return;
  }
  
  modal.classList.add('active'); 
  document.body.style.overflow = 'hidden'; 
  
  if (loading) {
    loading.style.display = 'flex'; 
  }
  if (grid) {
    grid.classList.remove('loaded'); 
  }
  
  setTimeout(async () => { 
    if (loading) {
      loading.style.display = 'none'; 
    }
    await renderAllEvents(); 
    if (grid) {
      grid.classList.add('loaded'); 
    }
  }, CONFIG.LOADING_DELAY); 
}

function closeEventsModal() { 
  const modal = document.getElementById('eventsModal'); 
  if (modal) {
    modal.classList.remove('active'); 
  }
  document.body.style.overflow = ''; 
}

// ==========================================================================
// EFECTOS Y ANIMACIONES ADICIONALES
// ==========================================================================

function initScrollAnimations() {
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px'
  };
  
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
        observer.unobserve(entry.target);
      }
    });
  }, observerOptions);
  
  // Observar elementos con clase .animate-on-scroll
  document.querySelectorAll('.animate-on-scroll').forEach(el => {
    observer.observe(el);
  });
}

function initSmoothScroll() {
  document.querySelectorAll('a[href^="#"]').forEach(anchor => { 
    anchor.addEventListener('click', function(e) { 
      const href = this.getAttribute('href'); 
      if (href !== '#') { 
        e.preventDefault(); 
        const target = document.querySelector(href); 
        if (target) { 
          target.scrollIntoView({ 
            behavior: 'smooth',
            block: 'start'
          }); 
        } 
      } 
    }); 
  });
}

function initKeyboardNavigation() {
  document.addEventListener('keydown', function(e) { 
    if (e.key === 'Escape') { 
      closePanel(); 
      closeEventsModal(); 
    }
    
    // Navegación con flechas en el slider de testimonios
    if (e.key === 'ArrowLeft') {
      slideTestimonials(-1);
    }
    if (e.key === 'ArrowRight') {
      slideTestimonials(1);
    }
  });
}

// ==========================================================================
// INICIALIZACIÓN PRINCIPAL
// ==========================================================================

document.addEventListener('DOMContentLoaded', async function() {
  console.log('');
  console.log('='.repeat(50));
  console.log('[SOCCER iD] Inicializando aplicación...');
  console.log('[SOCCER iD] URL:', window.location.href);
  console.log('='.repeat(50));
  
  try {
    // Pre-cargar todos los datos JSON en paralelo
    const dataFiles = ['bento_grid', 'events_grid', 'all_events_modal', 'detail_panels'];
    
    log('Init', 'Pre-cargando datos JSON...');
    
    const loadPromises = dataFiles.map(async file => {
      const data = await loadJSONData(file);
      return { file, success: !!data };
    });
    
    const results = await Promise.all(loadPromises);
    
    results.forEach(({ file, success }) => {
      if (success) {
        log('Init', `✓ ${file}`);
      } else {
        log('Init', `✗ ${file}`, 'warn');
      }
    });
    
    // Renderizar componentes principales
    await renderBentoGrid();
    await renderUpcomingEvents();
    
    // Inicializar efectos y animaciones
    initScrollAnimations();
    initSmoothScroll();
    initKeyboardNavigation();
    
    console.log('');
    console.log('='.repeat(50));
    console.log('[SOCCER iD] ✓ Inicialización completada.');
    console.log('='.repeat(50));
    console.log('');
    
  } catch (error) {
    log('Init', `Error durante la inicialización: ${error.message}`, 'error');
    console.error(error);
  }
});

// ==========================================================================
// EXPONER FUNCIONES GLOBALMENTE
// ==========================================================================

window.openPanel = openPanel;
window.closePanel = closePanel;
window.openEventsModal = openEventsModal;
window.closeEventsModal = closeEventsModal;
window.contactForEvent = contactForEvent;
window.handleFormSubmit = handleFormSubmit;
window.slideTestimonials = slideTestimonials;

// Exponer para debugging en desarrollo
if (CONFIG.DEBUG) {
  window.SOCCER_ID = {
    config: CONFIG,
    cache: cachedData,
    loadJSON: loadJSONData,
    clearCache: () => { cachedData = {}; }
  };
}