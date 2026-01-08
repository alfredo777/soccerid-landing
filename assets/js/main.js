/**
 * JavaScript Principal
 * Proyecto: landing-soccerid-v2_0
 */

// ==========================================================================
// CONFIGURACIÓN GLOBAL
// ==========================================================================
const CONFIG = {
  API_BASE: '',
  WHATSAPP_NUMBER: '12315158991',
  DEBUG: true
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

// Cache de datos cargados
let cachedData = {};

// ==========================================================================
// DETECTAR BASE URL
// ==========================================================================
function getBaseUrl() {
  // Detectar si estamos en producción o local
  const scripts = document.querySelectorAll('script[src*="main.js"]');
  if (scripts.length > 0) {
    const src = scripts[0].getAttribute('src');
    const basePath = src.replace(/assets\/js\/main\.js.*$/, '');
    return basePath;
  }
  return './';
}

const BASE_URL = getBaseUrl();
console.log('[SOCCER iD] Base URL detectada:', BASE_URL);

// ==========================================================================
// UTILIDADES DE CARGA DE DATOS
// ==========================================================================

async function loadJSONData(filename) {
  // Si ya está en cache, retornarlo
  if (cachedData[filename]) {
    console.log(`[SOCCER iD] Cache hit: ${filename}`);
    return cachedData[filename];
  }
  
  // Intentar múltiples rutas
  const possiblePaths = [
    `${BASE_URL}contents/${filename}.json`,
    `./contents/${filename}.json`,
    `/contents/${filename}.json`,
    `contents/${filename}.json`
  ];
  
  for (const path of possiblePaths) {
    try {
      console.log(`[SOCCER iD] Intentando cargar: ${path}`);
      const response = await fetch(path);
      
      if (response.ok) {
        const data = await response.json();
        cachedData[filename] = data;
        console.log(`[SOCCER iD] ✓ Cargado exitosamente desde: ${path}`);
        return data;
      }
    } catch (error) {
      console.log(`[SOCCER iD] ✗ Falló: ${path}`, error.message);
    }
  }
  
  console.error(`[SOCCER iD] ✗ No se pudo cargar ${filename}.json desde ninguna ruta`);
  return null;
}

// ==========================================================================
// RENDERIZADO DE COMPONENTES
// ==========================================================================

async function renderBentoGrid() {
  const data = await loadJSONData('bento_grid');
  if (!data) {
    console.error('[Bento Grid] No hay datos');
    return;
  }
  
  const grid = document.getElementById('bentoGrid');
  if (!grid) {
    console.error('[Bento Grid] Elemento #bentoGrid no encontrado');
    return;
  }
  
  const items = data.items || data;
  grid.innerHTML = items.map(item => `
    <div class="bento-item ${item.class || ''}" data-panel="${item.id}">
      <div class="bento-content">
        <span class="tag">${item.tag || ''}</span>
        <h3>${item.title || ''}</h3>
        <p>${item.description || ''}</p>
      </div>
    </div>
  `).join('');
  
  grid.querySelectorAll('.bento-item').forEach(item => { 
    item.addEventListener('click', function() { 
      const panelId = this.dataset.panel; 
      if (panelId) openPanel(panelId); 
    }); 
  });
  
  console.log('[Bento Grid] ✓ Renderizado correctamente');
}

async function renderUpcomingEvents() {
  const data = await loadJSONData('events_grid');
  if (!data) {
    console.error('[Events Grid] No hay datos');
    return;
  }
  
  const grid = document.getElementById('eventsGrid');
  if (!grid) {
    console.error('[Events Grid] Elemento #eventsGrid no encontrado');
    return;
  }
  
  const events = data.events || data;
  grid.innerHTML = events.map(event => `
    <div class="event-card" onclick="contactForEvent('${event.team1} vs ${event.team2} - ${event.date}')">
      <div class="event-image">
        <img src="${event.image}" alt="${event.team1} vs ${event.team2}">
        <span class="event-badge ${event.badgeClass || ''}">${event.badge || ''}</span>
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
            <div class="team-shield">${event.team1Icon || ''}</div>
            <div class="team-name">${event.team1}</div>
          </div>
          <span class="event-vs">VS</span>
          <div class="event-team">
            <div class="team-shield">${event.team2Icon || ''}</div>
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
  
  console.log('[Events Grid] ✓ Renderizado correctamente');
}

async function renderAllEvents() {
  const data = await loadJSONData('all_events_modal');
  if (!data) {
    console.error('[All Events] No hay datos');
    return;
  }
  
  const grid = document.getElementById('allEventsGrid');
  if (!grid) {
    console.error('[All Events] Elemento #allEventsGrid no encontrado');
    return;
  }
  
  const events = data.events || data;
  grid.innerHTML = events.map(event => `
    <div class="event-card" onclick="contactForEvent('${event.team1} vs ${event.team2} - ${event.date}')">
      <div class="event-image">
        <img src="${event.image || 'https://images.unsplash.com/photo-1574629810360-7efbbe195018?w=600'}" alt="${event.team1} vs ${event.team2}">
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
            <div class="team-shield">${event.team1Icon || ''}</div>
            <div class="team-name">${event.team1}</div>
          </div>
          <span class="event-vs">VS</span>
          <div class="event-team">
            <div class="team-shield">${event.team2Icon || ''}</div>
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
  
  console.log('[All Events] ✓ Renderizado correctamente');
}

// ==========================================================================
// GENERADOR DE CONTENIDO DE PANELES
// ==========================================================================

async function generatePanelContent(panelId) {
  const allData = await loadJSONData('detail_panels');
  if (!allData || !allData.panels || !allData.panels[panelId]) {
    console.error(`[Panel] ${panelId} no encontrado`);
    return '<div class="panel-body"><p>Error cargando contenido del panel</p></div>';
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
      <span class="panel-tag">${panel.tag || ''}</span>
    </div>
    <div class="panel-body">
      <h1 class="panel-title">${panel.title || ''}</h1>
      <p class="panel-description">${panel.description || ''}</p>
  `;
  
  switch(panelId) {
    case 'quienes': content += generateQuienesContent(panel); break;
    case 'soccer': content += generateSoccerContent(panel, whatsapp); break;
    case 'seguros': content += generateSegurosContent(panel); break;
    case 'vip': content += generateVIPContent(panel); break;
    case 'copa': content += generateCopaContent(panel, whatsapp); break;
    case 'fan': content += generateFanContent(panel); break;
    case 'media': content += generateMediaContent(panel); break;
    case 'socios': content += generateSociosContent(panel); break;
    case 'opiniones': content += generateOpinionesContent(panel); break;
    default: content += '<p>Contenido no disponible</p>';
  }
  
  content += '</div>';
  return content;
}

// ==========================================================================
// GENERADORES DE CONTENIDO ESPECÍFICO
// ==========================================================================

function generateQuienesContent(panel) { 
  return `
    <div class="stats-row">${(panel.stats || []).map(s => `<div class="stat-item"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`).join('')}</div>
    <h2 class="section-title">Nuestro Equipo</h2>
    <div class="team-grid">${(panel.team || []).map(t => `<div class="team-member"><div class="team-avatar">${t.initials}</div><h4>${t.name}</h4><p>${t.role}</p></div>`).join('')}</div>
    <h2 class="section-title">Nuestros Valores</h2>
    <div class="cards-grid">${(panel.values || []).map(v => `<div class="feature-card"><div class="feature-icon" style="background: ${v.gradient};">${v.icon}</div><h4>${v.title}</h4><p>${v.description}</p></div>`).join('')}</div>
    <div class="cta-group">
      <a href="#contacto" class="cta-btn primary" onclick="closePanel()">Contáctanos<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
      <a href="#" class="cta-btn secondary">Ver Vacantes</a>
    </div>
  `; 
}

function generateSoccerContent(panel, whatsapp) { 
  return `
    <h2 class="section-title">Próximos Partidos</h2>
    <div class="matches-grid">${(panel.matches || []).map(m => `<div class="match-card"><div class="match-date">${m.date}</div><div class="match-teams"><div class="team"><div class="team-logo">${m.team1Icon}</div><div class="team-name-match">${m.team1}</div></div><span class="vs">VS</span><div class="team"><div class="team-logo">${m.team2Icon}</div><div class="team-name-match">${m.team2}</div></div></div><div class="match-venue">${m.venue}</div><span class="match-status ${m.status}">Boletos Disponibles</span></div>`).join('')}</div>
    <h2 class="section-title">Galería de Eventos</h2>
    <div class="gallery-grid">${(panel.gallery || []).map((img, i) => `<div class="gallery-item"><img src="${img}" alt="Galería ${i+1}"></div>`).join('')}</div>
    <div class="cta-group">
      <a href="https://wa.me/${whatsapp}?text=Hola%2C%20me%20interesa%20comprar%20boletos%20para%20SOCCER%20iD%20CUP" target="_blank" class="cta-btn primary">Comprar Boletos<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
      <a href="#" class="cta-btn secondary" onclick="closePanel(); setTimeout(openEventsModal, 300);">Ver Todos los Eventos</a>
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
  return `
    <div class="video-container"><div class="video-placeholder"><div class="play-button"><svg viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg></div><p style="color: rgba(255,255,255,0.6);">Ver video explicativo</p></div></div>
    <h2 class="section-title">Características de la App</h2>
    <div class="app-features">${(panel.features || []).map(f => `<div class="app-feature"><div class="app-feature-icon">${iconSvgs[f.icon] || ''}</div><div><h4>${f.title}</h4><p>${f.description}</p></div></div>`).join('')}</div>
    <h2 class="section-title">Planes Disponibles</h2>
    <div class="cards-grid">${(panel.plans || []).map(p => `<div class="feature-card"><div class="feature-icon" style="background: ${p.gradient};">${p.icon}</div><h4>${p.title}</h4><p>${p.description}</p></div>`).join('')}</div>
    <div class="cta-group">
      <a href="https://segurosid.com" target="_blank" class="cta-btn primary">Ir a SegurosID.com<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg></a>
      <a href="#" class="cta-btn secondary">Descargar App</a>
    </div>
  `; 
}

function generateVIPContent(panel) { 
  return `
    <div class="video-container"><div class="video-placeholder"><div class="play-button"><svg viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg></div><p style="color: rgba(255,255,255,0.6);">Descubre la experiencia VIP</p></div></div>
    <h2 class="section-title">Qué Incluye</h2>
    <div class="cards-grid">${(panel.includes || []).map(i => `<div class="feature-card"><div class="feature-icon" style="background: linear-gradient(135deg, #8E2DE2, #4A00E0);">${i.icon}</div><h4>${i.title}</h4><p>${i.description}</p></div>`).join('')}</div>
    <div class="contact-form-container">
      <h3>Cotiza tu Experiencia VIP</h3>
      <p>Completa el formulario y un asesor se pondrá en contacto contigo en menos de 24 horas.</p>
      <form id="vipContactForm" onsubmit="handleFormSubmit(event, 'vip')">
        <div class="form-grid">
          <div class="form-group"><label for="vip-name">Nombre Completo *</label><input type="text" id="vip-name" name="name" placeholder="Tu nombre" required></div>
          <div class="form-group"><label for="vip-email">Correo Electrónico *</label><input type="email" id="vip-email" name="email" placeholder="tu@email.com" required></div>
          <div class="form-group"><label for="vip-phone">Teléfono *</label><input type="tel" id="vip-phone" name="phone" placeholder="+52 55 1234 5678" required></div>
          <div class="form-group"><label for="vip-event">Tipo de Evento</label><select id="vip-event" name="event"><option value="">Selecciona una opción</option><option value="liga-mx">Liga MX</option><option value="champions">UEFA Champions League</option><option value="nfl">NFL</option><option value="nba">NBA</option><option value="f1">Fórmula 1</option><option value="box">Box / UFC</option><option value="otro">Otro evento</option></select></div>
          <div class="form-group"><label for="vip-guests">Número de Personas</label><select id="vip-guests" name="guests"><option value="1-2">1-2 personas</option><option value="3-5">3-5 personas</option><option value="6-10">6-10 personas</option><option value="10+">Más de 10 personas</option></select></div>
          <div class="form-group"><label for="vip-budget">Presupuesto Aproximado</label><select id="vip-budget" name="budget"><option value="">Selecciona una opción</option><option value="10k-25k">$10,000 - $25,000 MXN</option><option value="25k-50k">$25,000 - $50,000 MXN</option><option value="50k-100k">$50,000 - $100,000 MXN</option><option value="100k+">Más de $100,000 MXN</option></select></div>
          <div class="form-group full-width"><label for="vip-message">Cuéntanos más sobre tu experiencia ideal</label><textarea id="vip-message" name="message" placeholder="¿Qué evento te gustaría asistir? ¿Tienes alguna fecha en mente?"></textarea></div>
        </div>
        <div class="form-submit">
          <button type="submit" class="submit-btn">Enviar Solicitud<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
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
  return `
    <div class="stats-row">${(panel.stats || []).map(s => `<div class="stat-item"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`).join('')}</div>
    <h2 class="section-title">Sedes del Mundial</h2>
    <div class="cards-grid">${(panel.venues || []).map(v => `<div class="feature-card"><div class="feature-icon" style="background: ${v.gradient};">${v.icon}</div><h4>${v.title}</h4><p>${v.description}</p></div>`).join('')}</div>
    <h2 class="section-title">Nuestros Servicios</h2>
    <div class="app-features">${(panel.services || []).map(s => `<div class="app-feature"><div class="app-feature-icon">${iconSvgs[s.icon] || ''}</div><div><h4>${s.title}</h4><p>${s.description}</p></div></div>`).join('')}</div>
    <div class="contact-form-container">
      <h3>Agenda tu Asesoría Gratuita</h3>
      <p>Déjanos tus datos y te contactaremos para ayudarte a planear tu experiencia mundialista.</p>
      <form id="copaContactForm" onsubmit="handleFormSubmit(event, 'copa')">
        <div class="form-grid">
          <div class="form-group"><label for="copa-name">Nombre Completo *</label><input type="text" id="copa-name" name="name" placeholder="Tu nombre" required></div>
          <div class="form-group"><label for="copa-email">Correo Electrónico *</label><input type="email" id="copa-email" name="email" placeholder="tu@email.com" required></div>
          <div class="form-group"><label for="copa-phone">Teléfono / WhatsApp *</label><input type="tel" id="copa-phone" name="phone" placeholder="+52 55 1234 5678" required></div>
          <div class="form-group"><label for="copa-country">País de Residencia</label><select id="copa-country" name="country"><option value="mexico">México</option><option value="usa">Estados Unidos</option><option value="canada">Canadá</option><option value="otro">Otro país</option></select></div>
          <div class="form-group"><label for="copa-team">Selección de tu Interés</label><select id="copa-team" name="team"><option value="">Selecciona tu selección</option><option value="mexico">México</option><option value="usa">Estados Unidos</option><option value="argentina">Argentina</option><option value="brasil">Brasil</option><option value="espana">España</option><option value="alemania">Alemania</option><option value="francia">Francia</option><option value="otro">Otra selección</option></select></div>
          <div class="form-group"><label for="copa-matches">¿Cuántos partidos te gustaría asistir?</label><select id="copa-matches" name="matches"><option value="1-2">1-2 partidos</option><option value="3-5">3-5 partidos</option><option value="fase-grupos">Toda la fase de grupos</option><option value="eliminatorias">Eliminatorias y final</option><option value="todo">El mundial completo</option></select></div>
          <div class="form-group full-width"><label for="copa-message">¿Qué partidos o sedes te interesan más?</label><textarea id="copa-message" name="message" placeholder="Cuéntanos sobre tu plan ideal para el Mundial 2026"></textarea></div>
        </div>
        <div class="form-submit">
          <button type="submit" class="submit-btn">Agendar Asesoría Gratis<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></button>
          <span class="form-note">* Campos obligatorios</span>
        </div>
      </form>
    </div>
    <div class="cta-group">
      <a href="https://wa.me/${whatsapp}?text=Hola%2C%20me%20interesa%20la%20asesor%C3%ADa%20para%20el%20Mundial%202026" target="_blank" class="cta-btn secondary">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
        WhatsApp Directo
      </a>
    </div>
  `; 
}

function generateFanContent(panel) { 
  return `
    <h2 class="section-title">Promociones Activas</h2>
    <div class="promo-grid">${(panel.promos || []).map(p => `<div class="promo-card"><img src="${p.image}" alt="${p.title}"><span class="promo-badge">${p.badge}</span><div class="promo-overlay"><h4>${p.title}</h4><p>${p.description}</p></div></div>`).join('')}</div>
    <h2 class="section-title">Sorteos del Mes</h2>
    <div class="cards-grid">${(panel.raffles || []).map(r => `<div class="feature-card"><div class="feature-icon" style="background: linear-gradient(135deg, #00b09b, #96c93d);">${r.icon}</div><h4>${r.title}</h4><p>${r.description}</p></div>`).join('')}</div>
    <div class="cta-group">
      <a href="#" class="cta-btn primary">Unirse al Club<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
      <a href="#" class="cta-btn secondary">Ver Todos los Premios</a>
    </div>
  `; 
}

function generateMediaContent(panel) { 
  return `
    <h2 class="section-title">Cobertura Reciente</h2>
    <div class="articles-list">${(panel.articles || []).map(a => `<div class="article-item"><div class="article-image"><img src="${a.image}" alt="${a.title}"></div><div class="article-content"><span class="article-source">${a.source}</span><h4>${a.title}</h4><p>${a.excerpt}</p></div></div>`).join('')}</div>
    <h2 class="section-title">Apariciones en TV</h2>
    <div class="cards-grid">${(panel.tvAppearances || []).map(tv => `<div class="feature-card"><div class="feature-icon" style="background: linear-gradient(135deg, #eb3349, #f45c43);">📺</div><h4>${tv.channel}</h4><p>${tv.description}</p></div>`).join('')}</div>
    <div class="cta-group">
      <a href="#" class="cta-btn primary">Kit de Prensa<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg></a>
      <a href="#" class="cta-btn secondary">Contacto de Prensa</a>
    </div>
  `; 
}

function generateSociosContent(panel) { 
  return `
    <h2 class="section-title">Marcas Aliadas</h2>
    <div class="partners-grid">${(panel.brands || []).map(b => `<div class="partner-logo"><span>${b}</span></div>`).join('')}</div>
    <h2 class="section-title">Creadores de Contenido</h2>
    <div class="team-grid">${(panel.creators || []).map(c => `<div class="team-member"><div class="team-avatar">${c.icon}</div><h4>${c.handle}</h4><p>${c.followers}</p></div>`).join('')}</div>
    <h2 class="section-title">Beneficios de Ser Partner</h2>
    <div class="cards-grid">${(panel.benefits || []).map(b => `<div class="feature-card"><div class="feature-icon" style="background: linear-gradient(135deg, #4568dc, #b06ab3);">${b.icon}</div><h4>${b.title}</h4><p>${b.description}</p></div>`).join('')}</div>
    <div class="cta-group">
      <a href="#" class="cta-btn primary">Convertirse en Partner<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
      <a href="#" class="cta-btn secondary">Descargar Media Kit</a>
    </div>
  `; 
}

function generateOpinionesContent(panel) { 
  return `
    <div class="stats-row">${(panel.stats || []).map(s => `<div class="stat-item"><div class="stat-value">${s.value}</div><div class="stat-label">${s.label}</div></div>`).join('')}</div>
    <h2 class="section-title">Lo Que Dicen Nuestros Clientes</h2>
    <div class="testimonials-container">
      <div class="testimonials-track" id="testimonialsTrack">${(panel.testimonials || []).map(t => `<div class="testimonial-card"><div class="testimonial-header"><div class="testimonial-avatar">${t.initials}</div><div class="testimonial-info"><h4>${t.name}</h4><p>${t.since}</p></div></div><div class="testimonial-stars">${'★'.repeat(t.stars || 5)}</div><p class="testimonial-text">"${t.text}"</p></div>`).join('')}</div>
      <div class="slider-controls">
        <button class="slider-btn" onclick="slideTestimonials(-1)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg></button>
        <button class="slider-btn" onclick="slideTestimonials(1)"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg></button>
      </div>
    </div>
    <h2 class="section-title">Calificaciones por Servicio</h2>
    <div class="cards-grid">${(panel.ratings || []).map(r => `<div class="feature-card"><div class="feature-icon" style="background: linear-gradient(135deg, #ff6a00, #ee0979);">⭐</div><h4>${r.service}</h4><p>${r.rating} - "${r.quote}"</p></div>`).join('')}</div>
    <div class="cta-group">
      <a href="#" class="cta-btn primary">Dejar una Opinión<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M5 12h14M12 5l7 7-7 7"/></svg></a>
      <a href="#" class="cta-btn secondary">Ver Todas las Reseñas</a>
    </div>
  `; 
}

// ==========================================================================
// FUNCIONES DE PANEL
// ==========================================================================

function resetPanelScroll() {
  const detailContent = document.getElementById('detailContent');
  if (detailContent) {
    detailContent.scrollTop = 0;
  }
}

async function openPanel(panelId) {
  const mainContainer = document.getElementById('mainContainer');
  const detailPanel = document.getElementById('detailPanel');
  const detailContent = document.getElementById('detailContent');
  
  if (!mainContainer || !detailPanel || !detailContent) {
    console.error('[Panel] Elementos del DOM no encontrados');
    return;
  }
  
  // Mostrar loading
  detailContent.innerHTML = '<div style="display:flex;justify-content:center;align-items:center;height:200px;color:#fff;"><p>Cargando...</p></div>';
  
  // Remove all panel classes
  Object.values(panelClasses).forEach(cls => { 
    detailPanel.classList.remove(cls); 
  });
  
  // Add the specific panel class
  if (panelClasses[panelId]) {
    detailPanel.classList.add(panelClasses[panelId]);
  }
  
  // Animate main container out
  mainContainer.classList.add('slide-out');
  
  // Show panel
  requestAnimationFrame(() => { 
    detailPanel.classList.add('active'); 
  });
  
  // Lock body scroll
  document.body.style.overflow = 'hidden';
  
  // Generate and set content (async)
  try {
    const content = await generatePanelContent(panelId);
    detailContent.innerHTML = content;
  } catch (error) {
    console.error('[Panel] Error generando contenido:', error);
    detailContent.innerHTML = '<div class="panel-body"><p>Error cargando el contenido</p></div>';
  }
  
  // Reset scroll position to top AFTER content is loaded
  resetPanelScroll();
  
  // Reset testimonials slider
  currentSlide = 0;
}

function closePanel() {
  const mainContainer = document.getElementById('mainContainer');
  const detailPanel = document.getElementById('detailPanel');
  
  if (!detailPanel) return;
  
  // Hide panel
  detailPanel.classList.remove('active');
  
  // Reset scroll position when closing
  resetPanelScroll();
  
  // Show main container after animation
  setTimeout(() => { 
    if (mainContainer) {
      mainContainer.classList.remove('slide-out'); 
    }
  }, 300);
  
  // Unlock body scroll
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
  
  if (!submitBtn) return;
  
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
  
  console.log(`[Form] ${formType} submitted:`, data); 
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
    console.error('[Modal] eventsModal no encontrado');
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
// INICIALIZACIÓN
// ==========================================================================

document.addEventListener('DOMContentLoaded', async function() {
  console.log('='.repeat(50));
  console.log('[SOCCER iD] Inicializando aplicación...');
  console.log('[SOCCER iD] URL actual:', window.location.href);
  console.log('[SOCCER iD] Pathname:', window.location.pathname);
  console.log('='.repeat(50));
  
  try {
    // Renderizar componentes principales
    await renderBentoGrid();
    await renderUpcomingEvents();
    
    // Event listeners globales
    document.addEventListener('keydown', function(e) { 
      if (e.key === 'Escape') { 
        closePanel(); 
        closeEventsModal(); 
      } 
    });
    
    // Smooth scroll para enlaces internos
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
    
    console.log('='.repeat(50));
    console.log('[SOCCER iD] ✓ Inicialización completada.');
    console.log('='.repeat(50));
    
  } catch (error) {
    console.error('[SOCCER iD] ✗ Error durante la inicialización:', error);
  }
});

// Exponer funciones globalmente para onclick en HTML
window.openPanel = openPanel;
window.closePanel = closePanel;
window.openEventsModal = openEventsModal;
window.closeEventsModal = closeEventsModal;
window.contactForEvent = contactForEvent;
window.handleFormSubmit = handleFormSubmit;
window.slideTestimonials = slideTestimonials;