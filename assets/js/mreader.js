/**
 * Magazine Reader - GKrakenCMS
 * Visor de revistas digitales con navegación por páginas
 * VERSIÓN FINAL CORREGIDA
 */

const MagazineReader = {
    magazines: {},
    currentMagazine: null,
    currentPage: 0,
    totalPages: 0,
    isOpen: false,
    initialized: false,
    
    // Touch state
    touchStartX: 0,
    isDragging: false,
    
    /**
     * Obtiene el idioma actual
     */
    getLang() {
        if (typeof GKraken !== 'undefined' && GKraken.currentLang) {
            return GKraken.currentLang;
        }
        return document.documentElement.lang || 'es';
    },
    
    /**
     * Traducciones
     */
    t(key) {
        const translations = {
            es: {
                viewSource: 'Ver fuente original',
                page: 'Página',
                error: 'Error al cargar'
            },
            en: {
                viewSource: 'View original source',
                page: 'Page',
                error: 'Error loading'
            }
        };
        const lang = this.getLang();
        return translations[lang]?.[key] || translations['es'][key] || key;
    },
    
    /**
     * Inicializa el reader
     */
    init() {
        if (this.initialized) return;
        
        // SIEMPRE eliminar modal existente y crear uno nuevo
        const existingModal = document.getElementById('magazineReaderModal');
        if (existingModal) {
            console.log('MagazineReader: Eliminando modal existente');
            existingModal.remove();
        }
        
        // Crear modal fresco
        this.createModal();
        
        // Verificar que se creó correctamente
        const modal = document.getElementById('magazineReaderModal');
        const sourceBtn = document.getElementById('magazineSourceBtn');
        
        console.log('MagazineReader: Verificación post-creación', {
            modal: !!modal,
            sourceBtn: !!sourceBtn
        });
        
        if (!modal) {
            console.error('MagazineReader: No se pudo crear el modal');
            return;
        }
        
        this.setupEvents();
        this.initialized = true;
        console.log('MagazineReader: Inicializado correctamente');
    },
    
    /**
     * Crea el modal HTML - VERSIÓN LIMPIA
     */
    createModal() {
        const html = `
        <div id="magazineReaderModal" class="magazine-reader-modal">
            <div class="magazine-reader-container">
                <div class="magazine-reader-header">
                    <h2 id="magazineReaderTitle">Revista</h2>
                    <div class="magazine-header-actions">
                        <a id="magazineSourceBtn" 
                           class="magazine-source-btn" 
                           href="#" 
                           target="_blank" 
                           rel="noopener noreferrer">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                                <polyline points="15 3 21 3 21 9"></polyline>
                                <line x1="10" y1="14" x2="21" y2="3"></line>
                            </svg>
                            <span>Ver fuente</span>
                        </a>
                        <button id="magazineCloseBtn" class="magazine-reader-close" type="button">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"></path>
                            </svg>
                        </button>
                    </div>
                </div>
                <div class="magazine-reader-content">
                    <div class="magazine-reader-controls">
                        <button class="magazine-nav-btn" id="magazinePrevBtn" type="button">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M15 18l-6-6 6-6"></path>
                            </svg>
                        </button>
                        <span class="magazine-page-info">
                            <span id="magazineCurrentPage">1</span> / <span id="magazineTotalPages">1</span>
                        </span>
                        <button class="magazine-nav-btn" id="magazineNextBtn" type="button">
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M9 18l6-6-6-6"></path>
                            </svg>
                        </button>
                    </div>
                    <div class="magazine-reader-viewport" id="magazineViewport">
                        <div class="magazine-pages-wrapper" id="magazinePagesWrapper"></div>
                    </div>
                    <div class="magazine-thumbnails" id="magazineThumbnails"></div>
                </div>
            </div>
        </div>`;
        
        document.body.insertAdjacentHTML('beforeend', html);
        console.log('MagazineReader: Modal HTML insertado');
        
        // Verificar inmediatamente
        const btn = document.getElementById('magazineSourceBtn');
        console.log('MagazineReader: Botón sourceBtn después de insertar:', !!btn);
    },
    
    /**
     * Configura eventos
     */
    setupEvents() {
        const modal = document.getElementById('magazineReaderModal');
        const viewport = document.getElementById('magazineViewport');
        const prevBtn = document.getElementById('magazinePrevBtn');
        const nextBtn = document.getElementById('magazineNextBtn');
        const closeBtn = document.getElementById('magazineCloseBtn');
        
        // Cerrar al click en overlay
        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) this.close();
            });
        }
        
        // Botón cerrar
        if (closeBtn) {
            closeBtn.addEventListener('click', () => this.close());
        }
        
        // Navegación
        if (prevBtn) {
            prevBtn.addEventListener('click', () => this.prevPage());
        }
        if (nextBtn) {
            nextBtn.addEventListener('click', () => this.nextPage());
        }
        
        // Teclado
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen) return;
            if (e.key === 'Escape') this.close();
            if (e.key === 'ArrowLeft') this.prevPage();
            if (e.key === 'ArrowRight') this.nextPage();
        });
        
        // Touch/Swipe en viewport
        if (viewport) {
            viewport.addEventListener('touchstart', (e) => {
                this.touchStartX = e.touches[0].clientX;
                this.isDragging = true;
            }, { passive: true });
            
            viewport.addEventListener('touchend', (e) => {
                if (!this.isDragging) return;
                this.isDragging = false;
                
                const touchEndX = e.changedTouches[0].clientX;
                const diff = this.touchStartX - touchEndX;
                
                if (Math.abs(diff) > 50) {
                    if (diff > 0) {
                        this.nextPage();
                    } else {
                        this.prevPage();
                    }
                }
            }, { passive: true });
        }
        
        console.log('MagazineReader: Eventos configurados');
    },
    
    /**
     * Registra una revista
     */
    register(id, data) {
        this.magazines[id] = data;
    },
    
    /**
     * Registra revistas desde artículos
     */
    registerFromArticles(articles) {
        if (!Array.isArray(articles)) return;
        
        articles.forEach(article => {
            if (article.type === 'magazine' && article.id && article.magazineData) {
                this.register(article.id, {
                    title: article.title || 'Revista',
                    sourceUrl: article.url || null,
                    pages: article.magazineData.pages || []
                });
            }
        });
    },
    
    /**
     * Obtiene la URL de imagen de una página
     */
    getImageUrl(page) {
        if (typeof page === 'string') return page;
        return page.url || page.image || page.src || page.img || null;
    },
    
    /**
     * Abre una revista
     */
    openFromData(magazineId) {
        const magazine = this.magazines[magazineId];
        if (!magazine) {
            console.error(`MagazineReader: Revista "${magazineId}" no encontrada`);
            return;
        }
        
        console.log('MagazineReader: Abriendo revista', magazineId, magazine);
        
        // Asegurar que el modal existe
        let modal = document.getElementById('magazineReaderModal');
        if (!modal) {
            console.log('MagazineReader: Modal no existe, creando...');
            this.createModal();
            this.setupEvents();
            modal = document.getElementById('magazineReaderModal');
        }
        
        this.currentMagazine = magazine;
        this.currentPage = 0;
        this.totalPages = magazine.pages?.length || 0;
        
        if (this.totalPages === 0) {
            console.error('MagazineReader: La revista no tiene páginas');
            return;
        }
        
        // Actualizar título
        const title = document.getElementById('magazineReaderTitle');
        if (title) {
            title.textContent = magazine.title || 'Revista';
        }
        
        // *** ACTUALIZAR BOTÓN DE FUENTE ***
        this.updateSourceButton(magazine.sourceUrl);
        
        // Renderizar páginas
        this.renderPages();
        this.renderThumbnails();
        this.updateNavigation();
        
        // Mostrar modal
        if (modal) {
            modal.classList.add('active');
        }
        this.isOpen = true;
        document.body.style.overflow = 'hidden';
    },
    
    /**
     * Actualiza el botón de fuente
     */
    updateSourceButton(url) {
        const btn = document.getElementById('magazineSourceBtn');
        
        console.log('MagazineReader: updateSourceButton', {
            url: url,
            btnFound: !!btn,
            btnHTML: btn ? btn.outerHTML.substring(0, 100) : 'N/A'
        });
        
        if (!btn) {
            console.error('MagazineReader: BOTÓN NO ENCONTRADO - Verificar HTML del modal');
            return;
        }
        
        if (url && typeof url === 'string' && url.trim() !== '' && url !== '#') {
            btn.href = url;
            btn.style.cssText = 'display: inline-flex !important; visibility: visible !important; opacity: 1 !important;';
            
            const textSpan = btn.querySelector('span');
            if (textSpan) {
                textSpan.textContent = this.t('viewSource');
            }
            
            console.log('MagazineReader: Botón VISIBLE con URL:', url);
        } else {
            btn.style.cssText = 'display: none !important;';
            console.log('MagazineReader: Botón OCULTO (sin URL válida)');
        }
    },
    
    /**
     * Renderiza las páginas
     */
    renderPages() {
        const wrapper = document.getElementById('magazinePagesWrapper');
        if (!wrapper || !this.currentMagazine) return;
        
        const pages = this.currentMagazine.pages || [];
        
        wrapper.innerHTML = pages.map((page, index) => {
            const imageUrl = this.getImageUrl(page);
            const alt = (typeof page === 'object' && page.alt) || `${this.t('page')} ${index + 1}`;
            
            if (!imageUrl) {
                return `
                    <div class="magazine-page ${index === 0 ? 'active' : ''}" data-page="${index}">
                        <div class="magazine-page-inner">
                            <div class="magazine-page-error">
                                <p>${this.t('error')} ${index + 1}</p>
                            </div>
                        </div>
                    </div>
                `;
            }
            
            return `
                <div class="magazine-page ${index === 0 ? 'active' : ''}" data-page="${index}">
                    <div class="magazine-page-inner">
                        <img src="${imageUrl}" 
                             alt="${alt}" 
                             loading="${index < 2 ? 'eager' : 'lazy'}"
                             draggable="false"
                             onerror="this.parentElement.innerHTML='<div class=\\'magazine-page-error\\'><p>Error</p></div>'">
                    </div>
                </div>
            `;
        }).join('');
    },
    
    /**
     * Renderiza miniaturas
     */
    renderThumbnails() {
        const container = document.getElementById('magazineThumbnails');
        if (!container || !this.currentMagazine) return;
        
        const pages = this.currentMagazine.pages || [];
        
        container.innerHTML = pages.map((page, index) => {
            const imageUrl = this.getImageUrl(page);
            
            return `
                <div class="magazine-thumbnail ${index === 0 ? 'active' : ''}" 
                     data-page="${index}" 
                     onclick="MagazineReader.goToPage(${index})">
                    ${imageUrl 
                        ? `<img src="${imageUrl}" alt="Page ${index + 1}" draggable="false">`
                        : `<span>${index + 1}</span>`
                    }
                    <span class="thumbnail-number">${index + 1}</span>
                </div>
            `;
        }).join('');
    },
    
    /**
     * Va a una página específica
     */
    goToPage(index) {
        if (index < 0 || index >= this.totalPages) return;
        if (index === this.currentPage) return;
        
        const wrapper = document.getElementById('magazinePagesWrapper');
        const thumbsContainer = document.getElementById('magazineThumbnails');
        
        if (wrapper) {
            const pages = wrapper.querySelectorAll('.magazine-page');
            pages.forEach((page, i) => {
                page.classList.toggle('active', i === index);
            });
        }
        
        if (thumbsContainer) {
            const thumbs = thumbsContainer.querySelectorAll('.magazine-thumbnail');
            thumbs.forEach((thumb, i) => {
                thumb.classList.toggle('active', i === index);
            });
            
            const activeThumb = thumbs[index];
            if (activeThumb) {
                activeThumb.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
            }
        }
        
        this.currentPage = index;
        this.updateNavigation();
    },
    
    prevPage() {
        if (this.currentPage > 0) {
            this.goToPage(this.currentPage - 1);
        }
    },
    
    nextPage() {
        if (this.currentPage < this.totalPages - 1) {
            this.goToPage(this.currentPage + 1);
        }
    },
    
    updateNavigation() {
        const currentPageEl = document.getElementById('magazineCurrentPage');
        const totalPagesEl = document.getElementById('magazineTotalPages');
        const prevBtn = document.getElementById('magazinePrevBtn');
        const nextBtn = document.getElementById('magazineNextBtn');
        
        if (currentPageEl) currentPageEl.textContent = this.currentPage + 1;
        if (totalPagesEl) totalPagesEl.textContent = this.totalPages;
        if (prevBtn) prevBtn.disabled = this.currentPage === 0;
        if (nextBtn) nextBtn.disabled = this.currentPage === this.totalPages - 1;
    },
    
    close() {
        const modal = document.getElementById('magazineReaderModal');
        const sourceBtn = document.getElementById('magazineSourceBtn');
        
        if (modal) modal.classList.remove('active');
        
        this.isOpen = false;
        this.currentMagazine = null;
        document.body.style.overflow = '';
        
        if (sourceBtn) {
            sourceBtn.style.cssText = 'display: none !important;';
        }
    }
};

window.MagazineReader = MagazineReader;

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MagazineReader.init());
} else {
    MagazineReader.init();
}
