/**
 * ==========================================================================
 * JavaScript Principal - GKrakenCMS
 * Proyecto: soccerid-v5-new-landing
 * Con soporte de internacionalización (i18n) y rutas de idioma
 * ==========================================================================
 */

// ==========================================================================
// CONFIGURACIÓN GLOBAL
// ==========================================================================

const GKraken = {
  config: {
    API_BASE: '',
    DEBUG: true,
    CACHE_DURATION: 5 * 60 * 1000,
    DEFAULT_LANG: 'es',
    SUPPORTED_LANGS: ['es', 'en'],
    LANG_STORAGE_KEY: 'gkraken_lang',
    // Se sobrescribe con datos del servidor
    ...(window.__GKRAKEN_CONFIG__ || {})
  },
  
  dataFiles: {
    'bentoItemsFirst': 'bento_items_first',
    'bentoItemsSecond': 'bento_items_second',
    'upcomingEvents': 'upcoming_events',
    'panelTemplates': 'panel_templates',
    'panelClasses': 'panel_classes',
    'uiTranslations': 'ui_translations'
  },
  
  cache: new Map(),
  initialized: false,
  
  // ========================================================================
  // SISTEMA DE IDIOMAS (i18n) CON RUTAS
  // ========================================================================
  
  currentLang: 'es',
  translations: {},
  rawData: {},
  
  /**
   * Obtiene el idioma desde múltiples fuentes
   */
  getSavedLanguage() {
    // 1. Prioridad: Idioma del servidor (de la URL)
    if (this.config.lang && this.config.SUPPORTED_LANGS.includes(this.config.lang)) {
      return this.config.lang;
    }
    
    // 2. Revisar atributo data-lang del body
    const bodyLang = document.body.dataset.lang;
    if (bodyLang && this.config.SUPPORTED_LANGS.includes(bodyLang)) {
      return bodyLang;
    }
    
    // 3. Revisar localStorage
    const saved = localStorage.getItem(this.config.LANG_STORAGE_KEY);
    if (saved && this.config.SUPPORTED_LANGS.includes(saved)) {
      return saved;
    }
    
    // 4. Detectar del navegador
    const browserLang = navigator.language || navigator.userLanguage;
    const shortLang = browserLang.split('-')[0].toLowerCase();
    
    if (this.config.SUPPORTED_LANGS.includes(shortLang)) {
      return shortLang;
    }
    
    return this.config.DEFAULT_LANG;
  },
  
  /**
   * Guarda el idioma seleccionado
   */
  saveLanguage(lang) {
    if (this.config.SUPPORTED_LANGS.includes(lang)) {
      localStorage.setItem(this.config.LANG_STORAGE_KEY, lang);
      
      // También guardar en cookie para el servidor
      document.cookie = `lang=${lang};path=/;max-age=${365 * 24 * 60 * 60}`;
      
      this.currentLang = lang;
    }
  },
  
  /**
   * Obtiene una traducción de UI por su clave
   */
  t(key) {
    const keys = key.split('.');
    let value = this.translations[this.currentLang];
    
    for (const k of keys) {
      if (value && typeof value === 'object' && k in value) {
        value = value[k];
      } else {
        console.warn(`[GKraken i18n] Traducción no encontrada: ${key}`);
        return key;
      }
    }
    
    return value;
  },
  
  /**
   * Extrae datos del idioma actual de un objeto con estructura multilengua
   */
  getLocalizedData(data) {
    if (!data) return data;
    
    if (data[this.currentLang] !== undefined) {
      return data[this.currentLang];
    }
    
    return data;
  },
  
  /**
   * Genera la URL para un idioma específico
   */
  getLangUrl(lang) {
    const currentPath = this.config.currentPath || '/';
    return `/${lang}${currentPath === '/' ? '' : currentPath}`;
  },
  
  /**
   * Cambia el idioma navegando a la nueva URL
   */
  changeLanguage(lang) {
    if (!this.config.SUPPORTED_LANGS.includes(lang)) {
      console.warn(`[GKraken] Idioma no soportado: ${lang}`);
      return;
    }
    
    if (lang === this.currentLang) return;
    
    console.log(`[GKraken] Cambiando idioma: ${this.currentLang} → ${lang}`);
    
    // Guardar preferencia
    this.saveLanguage(lang);
    
    // Navegar a la nueva URL
    const newUrl = this.getLangUrl(lang);
    window.location.href = newUrl;
  },
  
  /**
   * Cambia el idioma sin recargar (para SPAs o actualización dinámica)
   */
  async changeLanguageInPlace(lang) {
    if (!this.config.SUPPORTED_LANGS.includes(lang)) {
      console.warn(`[GKraken] Idioma no soportado: ${lang}`);
      return;
    }
    
    if (lang === this.currentLang) return;
    
    console.log(`[GKraken] Cambiando idioma in-place: ${this.currentLang} → ${lang}`);
    
    this.saveLanguage(lang);
    
    // Actualizar datos globales con el nuevo idioma
    assignGlobalData(this.rawData);
    
    // Re-renderizar componentes
    renderInitial();
    
    // Actualizar UI estática
    this.updateStaticUI();
    
    // Actualizar selector de idioma
    this.updateLanguageSelector();
    
    // Actualizar URL sin recargar (history API)
    const newUrl = this.getLangUrl(lang);
    window.history.pushState({ lang }, '', newUrl);
    
    // Actualizar atributo lang del HTML
    document.documentElement.lang = lang;
    document.body.dataset.lang = lang;
    
    // Disparar evento personalizado
    document.dispatchEvent(new CustomEvent('languageChanged', { detail: { lang } }));
  },
  
  /**
   * Actualiza elementos de UI estáticos (textos en HTML)
   */
  updateStaticUI() {
    // Preloader
    const preloaderSubtext = document.querySelector('.preloader-subtext');
    if (preloaderSubtext) {
      preloaderSubtext.textContent = this.t('preloader.loading');
    }
    
    // Hero
    const heroTagline = document.querySelector('.hero-tagline');
    if (heroTagline) {
      heroTagline.innerHTML = this.t('hero.tagline');
    }
    
    const scrollText = document.querySelector('.scroll-text');
    if (scrollText) {
      scrollText.textContent = this.t('hero.scroll');
    }
    
    // Sección de eventos
    const eventsHeader = document.querySelector('.events-section .section-header h2');
    if (eventsHeader) {
      eventsHeader.textContent = this.t('events.title');
    }
    
    const eventsSubtitle = document.querySelector('.events-section .section-header p');
    if (eventsSubtitle) {
      eventsSubtitle.textContent = this.t('events.subtitle');
    }
    
    const viewAllBtn = document.querySelector('.view-all-btn');
    if (viewAllBtn) {
      viewAllBtn.innerHTML = `
        ${this.t('events.viewAll')}
        <svg width="20" height="20" viewbox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M5 12h14M12 5l7 7-7 7"></path>
        </svg>
      `;
    }
    
    // Sección de contacto
    const contactTitle = document.querySelector('.contact-card h2');
    if (contactTitle) {
      contactTitle.textContent = this.t('contact.title');
    }
    
    const contactDesc = document.querySelector('.contact-card p');
    if (contactDesc) {
      contactDesc.textContent = this.t('contact.description');
    }
    
    const whatsappBtn = document.querySelector('.contact-card .whatsapp-btn');
    if (whatsappBtn) {
      const msg = encodeURIComponent(this.t('contact.whatsappMessage'));
      whatsappBtn.href = `https://wa.me/${WHATSAPP_NUMBER}?text=${msg}`;
      whatsappBtn.innerHTML = `
        <svg viewbox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"></path></svg>
        ${this.t('contact.whatsappBtn')}
      `;
    }
    
    // Footer
    const footerTagline = document.querySelector('.footer-tagline');
    if (footerTagline) {
      footerTagline.textContent = this.t('footer.tagline');
    }
    
    const followTitle = document.querySelector('.footer-social h4');
    if (followTitle) {
      followTitle.textContent = this.t('footer.followUs');
    }
    
    const navTitle = document.querySelector('.footer-actions h4');
    if (navTitle) {
      navTitle.textContent = this.t('footer.navigation');
    }
    
    const backToTop = document.querySelector('.back-to-top');
    if (backToTop) {
      backToTop.innerHTML = `
        <svg width="18" height="18" viewbox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M12 19V5M5 12l7-7 7 7"></path>
        </svg>
        ${this.t('footer.backToTop')}
      `;
    }
    
    // Actualizar enlaces legales con idioma
    const privacyLink = document.querySelector('.footer-link[href*="privacy"]');
    if (privacyLink) {
      privacyLink.textContent = this.t('footer.privacy');
      privacyLink.href = `/${this.currentLang}/privacy`;
    }
    
    const termsLink = document.querySelector('.footer-link[href*="terms"]');
    if (termsLink) {
      termsLink.textContent = this.t('footer.terms');
      termsLink.href = `/${this.currentLang}/terms`;
    }
    
    const copyright = document.querySelector('.footer-copyright');
    if (copyright) {
      copyright.textContent = this.t('footer.copyright');
    }
    
    // Modal de eventos
    const modalTitle = document.querySelector('.events-modal-header h2');
    if (modalTitle) {
      modalTitle.textContent = this.t('events.allEvents');
    }
    
    const closeModalBtn = document.querySelector('.close-modal-btn');
    if (closeModalBtn) {
      closeModalBtn.innerHTML = `
        <svg width="20" height="20" viewbox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M18 6L6 18M6 6l12 12"></path>
        </svg>
        ${this.t('events.close')}
      `;
    }
    
    const loadingText = document.querySelector('.loading-text');
    if (loadingText) {
      loadingText.textContent = this.t('events.loadingEvents');
    }
    
    // Atributo lang en el HTML
    document.documentElement.lang = this.currentLang;
  },
  
  /**
   * Actualiza el estado visual del selector de idioma
   */
  updateLanguageSelector() {
    const selector = document.getElementById('languageSelector');
    if (selector) {
      selector.value = this.currentLang;
    }
    
    // Actualizar botones
    document.querySelectorAll('.lang-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.lang === this.currentLang);
    });
    
    // Actualizar enlaces
    document.querySelectorAll('.lang-link').forEach(link => {
      const targetLang = link.dataset.lang;
      if (targetLang) {
        link.href = this.getLangUrl(targetLang);
        link.classList.toggle('active', targetLang === this.currentLang);
      }
    });
  },
  
  /**
   * Crea el selector de idioma en el DOM
   */
  createLanguageSelector() {
    const existingSelector = document.getElementById('languageSelectorContainer');
    if (existingSelector) {
      existingSelector.remove();
    }
    
    const container = document.createElement('div');
    container.id = 'languageSelectorContainer';
    container.className = 'language-selector-container';
    
    // Generar URLs para cada idioma
    const esUrl = this.getLangUrl('es');
    const enUrl = this.getLangUrl('en');
    
    container.innerHTML = `
      <div class="language-selector">
        <a href="${esUrl}" 
           class="lang-btn lang-link ${this.currentLang === 'es' ? 'active' : ''}" 
           data-lang="es"
           onclick="return GKraken.handleLangClick(event, 'es')">
          <span class="lang-flag">🇲🇽</span>
          <span class="lang-text">ES</span>
        </a>
        <a href="${enUrl}" 
           class="lang-btn lang-link ${this.currentLang === 'en' ? 'active' : ''}" 
           data-lang="en"
           onclick="return GKraken.handleLangClick(event, 'en')">
          <span class="lang-flag">🇺🇸</span>
          <span class="lang-text">EN</span>
        </a>
      </div>
    `;
    
    document.body.appendChild(container);
  },
  
  /**
   * Maneja el clic en el selector de idioma
   */
  handleLangClick(event, lang) {
    // Permitir navegación normal (con Ctrl/Cmd para nueva pestaña)
    if (event.ctrlKey || event.metaKey || event.shiftKey) {
      return true;
    }
    
    event.preventDefault();
    this.changeLanguage(lang);
    return false;
  },
  
  // ========================================================================
  // CARGA DE DATOS
  // ========================================================================
  
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

// Exponer GKraken globalmente
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
const INITIAL_EVENTS_COUNT = 3;

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
  // Guardar datos crudos para cambios de idioma
  GKraken.rawData = allData;
  
  // Cargar traducciones de UI
  if (allData.uiTranslations) {
    GKraken.translations = unwrapData(allData.uiTranslations);
  }
  
  // Extraer datos del idioma actual
  if (allData.bentoItemsFirst) {
    const localizedData = GKraken.getLocalizedData(unwrapData(allData.bentoItemsFirst));
    bentoItemsFirst = GKraken.normalizeToArray(localizedData);
  }
  
  if (allData.bentoItemsSecond) {
    const localizedData = GKraken.getLocalizedData(unwrapData(allData.bentoItemsSecond));
    bentoItemsSecond = GKraken.normalizeToArray(localizedData);
  }
  
  if (allData.upcomingEvents) {
    const localizedData = GKraken.getLocalizedData(unwrapData(allData.upcomingEvents));
    upcomingEvents = GKraken.normalizeToArray(localizedData);
  }
  
  if (allData.panelTemplates) {
    const unwrapped = unwrapData(allData.panelTemplates);
    const localizedData = GKraken.getLocalizedData(unwrapped);
    panelTemplates = typeof localizedData === 'object' && !Array.isArray(localizedData) ? localizedData : {};
    
    // Registrar magazines
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
  }

  // En assignGlobalData, después de cargar panelTemplates:
  if (panelTemplates.media && panelTemplates.media.articles) {
      const articles = GKraken.normalizeToArray(panelTemplates.media.articles);
      if (typeof MagazineReader !== 'undefined' && MagazineReader.registerFromArticles) {
          MagazineReader.registerFromArticles(articles);
      }
  }

  
  if (allData.panelClasses) {
    const unwrapped = unwrapData(allData.panelClasses);
    panelClasses = typeof unwrapped === 'object' && !Array.isArray(unwrapped) ? unwrapped : {};
  }
  
  if (Object.keys(panelClasses).length === 0) {
    panelClasses = DEFAULT_PANEL_CLASSES;
    console.log('[GKraken] Usando panelClasses por defecto');
  }
  
  if (GKraken.config.DEBUG) {
    console.log(`[GKraken] Idioma actual: ${GKraken.currentLang}`);
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
    // 1. Determinar idioma inicial (prioridad: servidor > localStorage > navegador)
    GKraken.currentLang = GKraken.getSavedLanguage();
    console.log(`[GKraken] Idioma inicial: ${GKraken.currentLang}`);
    console.log(`[GKraken] Base URL: ${GKraken.config.baseUrl || 'no definido'}`);
    console.log(`[GKraken] Path actual: ${GKraken.config.currentPath || '/'}`);
    
    // 2. Cargar todos los datos JSON
    const allData = await GKraken.loadAllData();
    
    // 3. Asignar datos a variables globales
    assignGlobalData(allData);
    
    // 4. Guardar referencia global para debugging
    window.appData = allData;
    
    console.log('[GKraken] Datos cargados:', Object.keys(allData));
    
    // 5. Crear selector de idioma
    GKraken.createLanguageSelector();
    
    // 6. Renderizar componentes iniciales
    renderInitial();
    
    // 7. Actualizar UI estática con traducciones
    GKraken.updateStaticUI();
    
    // 8. Configurar event listeners globales
    setupEventListeners();
    
    // 9. Ocultar preloader
    hidePreloader();
    
    GKraken.initialized = true;
    console.log('[GKraken] ✓ Inicialización completada');
    
  } catch (error) {
    console.error('[GKraken] ✗ Error en inicialización:', error);
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
  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') {
      closeLightbox();
      closePanel();
      closeEventsModal();
      closeVideoLightbox();
    }
    if (e.key === 'ArrowLeft') navigateLightbox(-1);
    if (e.key === 'ArrowRight') navigateLightbox(1);
  });
  
  // CORREGIDO: Solo para enlaces internos de navegación (anclas)
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', function(e) {
      // Ignorar si tiene target="_blank" (enlaces externos)
      if (this.getAttribute('target') === '_blank') {
        return; // Permitir comportamiento normal
      }
      
      // Ignorar si es parte del magazine reader
      if (this.closest('.magazine-reader-modal') || this.id === 'magazineSourceBtn') {
        return; // Permitir comportamiento normal
      }
      
      const href = this.getAttribute('href');
      
      // Solo procesar si es un ancla válida (# seguido de un ID)
      if (href && href !== '#' && href.startsWith('#') && href.length > 1) {
        // Verificar que sea un selector CSS válido (ID)
        try {
          const target = document.querySelector(href);
          if (target) {
            e.preventDefault();
            target.scrollIntoView({ behavior: 'smooth' });
          }
        } catch (error) {
          // Si el selector no es válido, permitir comportamiento normal
          console.warn('Selector no válido:', href);
        }
      }
    });
  });
  
  const lightbox = document.getElementById('lightbox');
  if (lightbox) {
    lightbox.addEventListener('click', function(e) {
      if (e.target === this) closeLightbox();
    });
  }
  
  // Listener para navegación del historial (botón atrás/adelante)
  window.addEventListener('popstate', function(e) {
    if (e.state && e.state.lang) {
      const newLang = e.state.lang;
      if (newLang !== GKraken.currentLang) {
        GKraken.currentLang = newLang;
        GKraken.saveLanguage(newLang);
        assignGlobalData(GKraken.rawData);
        renderInitial();
        GKraken.updateStaticUI();
        GKraken.updateLanguageSelector();
      }
    }
  });
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
// VIDEO LIGHTBOX
// ==========================================================================

/**
 * Abre el lightbox de video con una URL de video directo
 * @param {string} videoUrl - URL del video (mp4, webm, etc.)
 * @param {string} title - Título del video
 */
function openVideoLightbox(videoUrl, title = '') {
  // Crear el lightbox si no existe
  let videoLightbox = document.getElementById('videoLightbox');
  
  if (!videoLightbox) {
    videoLightbox = createVideoLightbox();
    document.body.appendChild(videoLightbox);
  }
  
  const videoElement = document.getElementById('lightboxVideo');
  const titleElement = document.getElementById('videoLightboxTitle');
  
  if (videoElement) {
    // Limpiar fuentes anteriores
    videoElement.innerHTML = '';
    
    // Detectar el tipo de video por extensión
    const extension = videoUrl.split('.').pop().toLowerCase().split('?')[0];
    let mimeType = 'video/mp4';
    
    switch (extension) {
      case 'webm':
        mimeType = 'video/webm';
        break;
      case 'ogg':
      case 'ogv':
        mimeType = 'video/ogg';
        break;
      case 'mov':
        mimeType = 'video/quicktime';
        break;
      case 'm3u8':
        mimeType = 'application/x-mpegURL';
        break;
      default:
        mimeType = 'video/mp4';
    }
    
    // Crear source element
    const source = document.createElement('source');
    source.src = videoUrl;
    source.type = mimeType;
    videoElement.appendChild(source);
    
    // Fallback text
    const fallback = document.createTextNode(
      GKraken.t('video.notSupported') || 'Tu navegador no soporta la reproducción de video.'
    );
    videoElement.appendChild(fallback);
    
    // Cargar el video
    videoElement.load();
  }
  
  if (titleElement) {
    titleElement.textContent = title;
    titleElement.style.display = title ? 'block' : 'none';
  }
  
  // Mostrar el lightbox
  videoLightbox.classList.add('active');
  document.body.style.overflow = 'hidden';
  
  // Auto-reproducir después de un breve delay
  setTimeout(() => {
    if (videoElement) {
      videoElement.play().catch(e => {
        console.log('[GKraken] Auto-play bloqueado:', e);
      });
    }
  }, 300);
}

/**
 * Crea el elemento del lightbox de video
 * @returns {HTMLElement}
 */
function createVideoLightbox() {
  const lightbox = document.createElement('div');
  lightbox.id = 'videoLightbox';
  lightbox.className = 'video-lightbox';
  
  const closeText = GKraken.t('video.close') || 'Cerrar';
  
  lightbox.innerHTML = `
    <div class="video-lightbox-overlay" onclick="closeVideoLightbox()"></div>
    <div class="video-lightbox-container">
      <div class="video-lightbox-header">
        <h3 id="videoLightboxTitle" class="video-lightbox-title"></h3>
        <button class="video-lightbox-close" onclick="closeVideoLightbox()" aria-label="${closeText}">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M18 6L6 18M6 6l12 12"/>
          </svg>
        </button>
      </div>
      <div class="video-lightbox-content">
        <video 
          id="lightboxVideo" 
          class="video-lightbox-player"
          controls
          playsinline
          preload="metadata"
        >
        </video>
      </div>
      <div class="video-lightbox-footer">
        <button class="video-lightbox-fullscreen" onclick="toggleVideoFullscreen()" aria-label="Pantalla completa">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"/>
          </svg>
        </button>
      </div>
    </div>
  `;
  
  // Event listener para cerrar con Escape
  lightbox.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      closeVideoLightbox();
    }
  });
  
  return lightbox;
}

/**
 * Cierra el lightbox de video
 */
function closeVideoLightbox() {
  const videoLightbox = document.getElementById('videoLightbox');
  const videoElement = document.getElementById('lightboxVideo');
  
  if (videoElement) {
    videoElement.pause();
    videoElement.currentTime = 0;
  }
  
  if (videoLightbox) {
    videoLightbox.classList.remove('active');
  }
  
  document.body.style.overflow = '';
}

/**
 * Alterna el modo pantalla completa del video
 */
function toggleVideoFullscreen() {
  const videoElement = document.getElementById('lightboxVideo');
  
  if (!videoElement) return;
  
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else if (videoElement.requestFullscreen) {
    videoElement.requestFullscreen();
  } else if (videoElement.webkitRequestFullscreen) {
    videoElement.webkitRequestFullscreen();
  } else if (videoElement.msRequestFullscreen) {
    videoElement.msRequestFullscreen();
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
// EVENTS - UPCOMING EVENTS
// ==========================================================================

function renderEventCard(e) {
  const bookText = GKraken.t('events.bookTickets');
  const lang = GKraken.currentLang || 'es';
  const eventUrl = e.id ? `/${lang}/evento/${e.id}` : '#';
  const imageHtml = e.image
    ? `<img src="${e.image}" alt="${e.team1} vs ${e.team2}">`
    : `<div style="width:100%;height:180px;background:linear-gradient(135deg,#1a1a2e,#16213e);display:flex;align-items:center;justify-content:center;gap:12px"><img src="${e.team1Icon}" style="width:48px;height:48px;object-fit:contain" onerror="this.style.display='none'"><span style="color:#9b59f0;font-weight:800;font-size:18px">VS</span><img src="${e.team2Icon}" style="width:48px;height:48px;object-fit:contain" onerror="this.style.display='none'"></div>`;

  return `
    <div class="event-card" onclick="window.location.href='${eventUrl}'">
      <div class="event-image">
        ${imageHtml}
        <span class="event-badge">${e.badge}</span>
        ${e.clasico ? `<span class="event-clasico">${e.clasico}</span>` : ''}
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
        <button class="event-cta">${bookText}</button>
      </div>
    </div>
  `;
}

function renderUpcomingEvents() {
  const grid = document.getElementById('eventsGrid');
  const showAllBtn = document.getElementById('showAllEventsBtn');
  
  if (!grid) return;
  
  const todayStr = new Date().toISOString().slice(0, 10);
  const futureEvts = (upcomingEvents || []).filter(e => !e.dateISO || e.dateISO >= todayStr);

  if (futureEvts.length === 0) {
    grid.innerHTML = `<p class="no-events">${GKraken.t('events.noEvents')}</p>`;
    if (showAllBtn) showAllBtn.style.display = 'none';
    return;
  }

  const eventsToShow = futureEvts.slice(0, INITIAL_EVENTS_COUNT);
  grid.innerHTML = eventsToShow.map(e => renderEventCard(e)).join('');

  if (showAllBtn) {
    const remainingEvents = futureEvts.length - INITIAL_EVENTS_COUNT;
    
    if (remainingEvents > 0) {
      showAllBtn.style.display = 'flex';
      showAllBtn.innerHTML = `
        <span>${GKraken.t('events.showAll')}</span>
        <span class="events-count">(${remainingEvents} ${GKraken.t('events.more')})</span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M6 9l6 6 6-6"/>
        </svg>
      `;
    } else {
      showAllBtn.style.display = 'none';
    }
  }
}

function showAllUpcomingEvents() {
  const grid = document.getElementById('eventsGrid');
  const showAllBtn = document.getElementById('showAllEventsBtn');
  
  if (!grid) return;
  
  const todayAll = new Date().toISOString().slice(0, 10);
  const futureAll = (upcomingEvents || []).filter(e => !e.dateISO || e.dateISO >= todayAll);
  grid.innerHTML = futureAll.map(e => renderEventCard(e)).join('');

  if (showAllBtn) {
    showAllBtn.style.display = 'none';
  }
  
  const cards = grid.querySelectorAll('.event-card');
  cards.forEach((card, index) => {
    if (index >= INITIAL_EVENTS_COUNT) {
      card.style.opacity = '0';
      card.style.transform = 'translateY(20px)';
      
      setTimeout(() => {
        card.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
        card.style.opacity = '1';
        card.style.transform = 'translateY(0)';
      }, (index - INITIAL_EVENTS_COUNT) * 100);
    }
  });
}

function renderAllEvents() {
  const grid = document.getElementById('allEventsGrid');
  if (!grid) return;
  
  if (!Array.isArray(upcomingEvents) || upcomingEvents.length === 0) {
    grid.innerHTML = `<p class="no-events">${GKraken.t('events.noEvents')}</p>`;
    return;
  }

  const today = new Date().toISOString().slice(0, 10);
  const futureEvents = upcomingEvents.filter(e => !e.dateISO || e.dateISO >= today);

  if (futureEvents.length === 0) {
    grid.innerHTML = `<p class="no-events">${GKraken.t('events.noEvents')}</p>`;
    return;
  }

  const contactText = GKraken.t('events.contactAdvisor');

  const lang = GKraken.currentLang || 'es';
  grid.innerHTML = futureEvents.map(e => {
    const eventUrl = e.id ? `/${lang}/evento/${e.id}` : '#';
    const imgHtml = e.image
      ? `<img src="${e.image}" alt="${e.team1} vs ${e.team2}">`
      : `<div style="width:100%;height:180px;background:linear-gradient(135deg,#1a1a2e,#16213e);display:flex;align-items:center;justify-content:center;gap:12px"><img src="${e.team1Icon}" style="width:48px;height:48px;object-fit:contain" onerror="this.style.display='none'"><span style="color:#9b59f0;font-weight:800;font-size:18px">VS</span><img src="${e.team2Icon}" style="width:48px;height:48px;object-fit:contain" onerror="this.style.display='none'"></div>`;
    return `
    <div class="event-card" onclick="window.location.href='${eventUrl}'">
      <div class="event-image">
        ${imgHtml}
        <span class="event-badge">${e.badge}</span>
        ${e.clasico ? `<span class="event-clasico">${e.clasico}</span>` : ''}
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
        <button class="event-cta">${contactText}</button>
      </div>
    </div>
  `}).join('');
}

function contactForEvent(eventName) {
  const messageTemplate = GKraken.t('contact.eventMessage');
  const message = encodeURIComponent(`${messageTemplate} ${eventName}`);
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
// PANEL CONTENT - GENERADORES DE CONTENIDO
// ==========================================================================

function generatePanelContent(panelId) {
  const panel = panelTemplates[panelId];
  
  if (!panel) {
    console.warn(`[GKraken] No se encontró template para panel: ${panelId}`);
    return `
      <div class="panel-header">
        <button class="back-btn" onclick="closePanel()">${GKraken.t('panel.back')}</button>
      </div>
      <div class="panel-body">
        <p>Contenido no disponible</p>
      </div>
    `;
  }
  
  let content = `
    <div class="panel-header">
      <button class="back-btn" onclick="closePanel()">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        ${GKraken.t('panel.back')}
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
  const learnMore = GKraken.t('panel.learnMore');
  
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
          ${learnMore}
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M5 12h14M12 5l7 7-7 7"/>
          </svg>
        </a>
      </div>
    </div>
  `;
}

function generateCopaContent(panel) {
  const requestAdvisory = GKraken.t('panel.requestAdvisory');
  const whatsappMessage = GKraken.currentLang === 'es'
    ? 'Hola%20SOCCER%20iD%2C%20me%20interesa%20la%20experiencia%20VIP%20de%20la%20Liga%20MX'
    : 'Hello%20SOCCER%20iD%2C%20I%27m%20interested%20in%20the%20Liga%20MX%20VIP%20experience';
  
  return `
    <div class="copa-fullscreen-wrapper">
      <div class="copa-text-section">
        <div class="copa-text-content">
          <h1>${panel.title}</h1>
          <p>${panel.description}</p>
          <a href="https://wa.me/${WHATSAPP_NUMBER}?text=${whatsappMessage}" target="_blank" class="whatsapp-contact-btn">
            <svg viewBox="0 0 24 24"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"></path></svg>
            ${requestAdvisory}
          </a>
        </div>
      </div>
      <div class="copa-banner-section">
        <img src="/assets/images/ligamx.png" alt="Experiencia Liga MX">
      </div>
    </div>
  `;
}

function generateMediaContent(panel) {
  const articles = panel.articles ? GKraken.normalizeToArray(panel.articles) : [];
  const magazineText = GKraken.t('panel.magazine');
  const videoText = GKraken.t('panel.video') || 'Video';
  const featuredVideo = GKraken.t('panel.featuredVideo');
  
  let html = `<h1 class="panel-title">${panel.title}</h1><p class="panel-description">${panel.description}</p>`;
  
  if (articles.length > 0) {
    html += `<div class="media-articles-container">`;
    
    html += articles.map(a => {
      const isMagazine = a.type === 'magazine';
      const isVideo = a.type === 'video';
      
      let clickHandler = '';
      let href = a.url;
      let target = 'target="_blank"';
      
      if (isMagazine) {
        clickHandler = `onclick="MagazineReader.openFromData('${a.id}'); return false;"`;
        href = '#';
        target = '';
      } else if (isVideo) {
        clickHandler = `onclick="openVideoLightbox('${a.videoUrl || a.url}', '${a.title.replace(/'/g, "\\'")}'); return false;"`;
        href = '#';
        target = '';
      }
      
      let badgeHtml = '';
      if (isMagazine) {
        badgeHtml = `<span class="article-type-badge magazine-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M19 3H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V5h14v14z"/>
              <path d="M7 7h10v2H7zm0 4h10v2H7zm0 4h7v2H7z"/>
            </svg>
            ${magazineText}
           </span>`;
      } else if (isVideo) {
        badgeHtml = `<span class="article-type-badge video-badge">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
            ${videoText}
           </span>`;
      }
      
      // Icono de play overlay para videos
      const playOverlay = isVideo ? `
        <div class="video-play-overlay">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="white">
            <path d="M8 5v14l11-7z"/>
          </svg>
        </div>
      ` : '';
      
      return `
        <a href="${href}" ${target} class="media-article-card${isMagazine ? ' magazine-article' : ''}${isVideo ? ' video-article' : ''}" ${clickHandler} data-article-id="${a.id || ''}">
          <div class="media-article-image">
            <img src="${a.image}" alt="${a.title}">
            ${badgeHtml}
            ${playOverlay}
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
                : isVideo
                  ? '<polygon points="5 3 19 12 5 21 5 3"/>'
                  : '<path d="M5 12h14M12 5l7 7-7 7"/>'}
            </svg>
          </div>
        </a>
      `;
    }).join('');
    
    html += `</div>`;
  }
  
  if (panel.videoId) {
    html += `
      <h3 class="video-section-title">${featuredVideo}</h3>
      
      <div class="video-embed-wrapper">
      <iframe src="https://www.youtube.com/embed/wpRwFqjHSiw?si=ktilEv4_cNysB8ba&amp;start=6568" title="YouTube video player" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" referrerpolicy="strict-origin-when-cross-origin" allowfullscreen></iframe>
      </div> <br/>

      <div class="video-embed-wrapper">
        <iframe src="https://www.youtube.com/embed/g1_GukOgCZI" title="Video" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>
      </div> <br/>
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
  
  Object.values(panelClasses).forEach(cls => {
    const className = extractClassName(cls);
    if (className) {
      detailPanel.classList.remove(className);
    }
  });
  
  const newClassName = extractClassName(panelClasses[panelId]);
  if (newClassName) {
    detailPanel.classList.add(newClassName);
  }
  
  detailContent.innerHTML = generatePanelContent(panelId);
  detailContent.scrollTop = 0;
  
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
// INICIAR APLICACIÓN
// ==========================================================================

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeGKraken);
} else {
  initializeGKraken();
}
