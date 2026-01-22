/**
 * Magazine Reader - GKrakenCMS
 * Visor de revistas digitales con navegación por páginas
 */

const MagazineReader = {
    magazines: {},
    currentMagazine: null,
    currentPage: 0,
    totalPages: 0,
    isOpen: false,
    initialized: false,
    swipeHintShown: false,
    isAnimating: false, // Nuevo: prevenir acciones durante animación
    
    touch: {
        startX: 0,
        startY: 0,
        currentX: 0,
        isDragging: false,
        startTime: 0,
        threshold: 50,
        velocityThreshold: 0.3,
        resistance: 0.25,
        isHorizontalSwipe: null // null = no determinado, true/false después
    },
    
    elements: {
        modal: null,
        title: null,
        viewport: null,
        pagesWrapper: null,
        thumbnails: null,
        currentPageEl: null,
        totalPagesEl: null,
        prevBtn: null,
        nextBtn: null,
        leftIndicator: null,
        rightIndicator: null
    },
    
    init() {
        if (this.initialized) return;
        
        this.elements.modal = document.getElementById('magazineReaderModal');
        if (!this.elements.modal) {
            console.warn('MagazineReader: Modal no encontrado.');
            return;
        }
        
        this.elements.title = document.getElementById('magazineReaderTitle');
        this.elements.viewport = document.getElementById('magazineViewport');
        this.elements.pagesWrapper = document.getElementById('magazinePagesWrapper');
        this.elements.thumbnails = document.getElementById('magazineThumbnails');
        this.elements.currentPageEl = document.getElementById('magazineCurrentPage');
        this.elements.totalPagesEl = document.getElementById('magazineTotalPages');
        this.elements.prevBtn = document.getElementById('magazinePrevBtn');
        this.elements.nextBtn = document.getElementById('magazineNextBtn');
        
        if (this.elements.viewport) {
            this.elements.leftIndicator = this.elements.viewport.querySelector('.swipe-indicator-left');
            this.elements.rightIndicator = this.elements.viewport.querySelector('.swipe-indicator-right');
        }
        
        this.elements.modal.addEventListener('click', (e) => {
            if (e.target === this.elements.modal) this.close();
        });
        
        document.addEventListener('keydown', (e) => {
            if (!this.isOpen || this.isAnimating) return;
            if (e.key === 'Escape') this.close();
            if (e.key === 'ArrowLeft') this.prevPage();
            if (e.key === 'ArrowRight') this.nextPage();
        });
        
        this.setupTouchNavigation();
        this.initialized = true;
    },
    
    createModal() {
        if (document.getElementById('magazineReaderModal')) {
            this.init();
            return;
        }
        
        const modalHTML = `
            <div id="magazineReaderModal" class="magazine-reader-modal">
                <div class="magazine-reader-container">
                    <div class="magazine-reader-header">
                        <h2 id="magazineReaderTitle">Revista</h2>
                        <button class="magazine-reader-close" onclick="MagazineReader.close()">
                            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                <path d="M18 6L6 18M6 6l12 12"/>
                            </svg>
                        </button>
                    </div>
                    <div class="magazine-reader-content">
                        <div class="magazine-reader-controls">
                            <button class="magazine-nav-btn" id="magazinePrevBtn" onclick="MagazineReader.prevPage()">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M15 18l-6-6 6-6"/>
                                </svg>
                            </button>
                            <span class="magazine-page-info">
                                <span id="magazineCurrentPage">1</span> / <span id="magazineTotalPages">1</span>
                            </span>
                            <button class="magazine-nav-btn" id="magazineNextBtn" onclick="MagazineReader.nextPage()">
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M9 18l6-6-6-6"/>
                                </svg>
                            </button>
                        </div>
                        <div class="magazine-reader-viewport" id="magazineViewport">
                            <div class="magazine-pages-wrapper" id="magazinePagesWrapper"></div>
                            <div class="swipe-indicator swipe-indicator-left">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M15 18l-6-6 6-6"/>
                                </svg>
                            </div>
                            <div class="swipe-indicator swipe-indicator-right">
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                                    <path d="M9 18l6-6-6-6"/>
                                </svg>
                            </div>
                        </div>
                        <div class="magazine-thumbnails" id="magazineThumbnails"></div>
                    </div>
                </div>
            </div>
        `;
        
        document.body.insertAdjacentHTML('beforeend', modalHTML);
        this.initialized = false;
        this.init();
    },
    
    setupTouchNavigation() {
        const viewport = this.elements.viewport;
        if (!viewport) return;
        
        // Touch events
        viewport.addEventListener('touchstart', (e) => this.handleDragStart(e.touches[0].clientX, e.touches[0].clientY), { passive: true });
        viewport.addEventListener('touchmove', (e) => {
            const result = this.handleDragMove(e.touches[0].clientX, e.touches[0].clientY);
            if (result === 'horizontal') e.preventDefault();
        }, { passive: false });
        viewport.addEventListener('touchend', (e) => this.handleDragEnd(e.changedTouches[0].clientX), { passive: true });
        viewport.addEventListener('touchcancel', () => this.handleDragCancel(), { passive: true });
        
        // Mouse events
        let isMouseDown = false;
        viewport.addEventListener('mousedown', (e) => {
            if (e.target.closest('button')) return;
            isMouseDown = true;
            this.handleDragStart(e.clientX, e.clientY);
            e.preventDefault();
        });
        
        document.addEventListener('mousemove', (e) => {
            if (isMouseDown) this.handleDragMove(e.clientX, e.clientY);
        });
        
        document.addEventListener('mouseup', (e) => {
            if (isMouseDown) {
                isMouseDown = false;
                this.handleDragEnd(e.clientX);
            }
        });
    },
    
    handleDragStart(x, y) {
        if (!this.isOpen || this.isAnimating) return;
        
        this.touch.startX = x;
        this.touch.startY = y;
        this.touch.currentX = x;
        this.touch.startTime = Date.now();
        this.touch.isDragging = true;
        this.touch.isHorizontalSwipe = null;
        
        this.elements.viewport?.classList.add('is-dragging');
        
        // Remover clase de animación del inner
        const pageInner = this.getActivePageInner();
        if (pageInner) {
            pageInner.classList.remove('animating');
        }
    },
    
    handleDragMove(x, y) {
        if (!this.touch.isDragging || !this.isOpen) return;
        
        this.touch.currentX = x;
        const diffX = x - this.touch.startX;
        const diffY = y - this.touch.startY;
        
        // Determinar dirección del swipe (solo una vez)
        if (this.touch.isHorizontalSwipe === null && (Math.abs(diffX) > 10 || Math.abs(diffY) > 10)) {
            this.touch.isHorizontalSwipe = Math.abs(diffX) > Math.abs(diffY);
        }
        
        if (!this.touch.isHorizontalSwipe) return 'vertical';
        
        this.updateDragVisuals(diffX);
        return 'horizontal';
    },
    
    handleDragEnd(endX) {
        if (!this.touch.isDragging) return;
        
        const diffX = this.touch.startX - endX;
        const elapsed = Date.now() - this.touch.startTime;
        const velocity = Math.abs(diffX) / elapsed;
        const wasHorizontal = this.touch.isHorizontalSwipe;
        
        this.touch.isDragging = false;
        this.touch.isHorizontalSwipe = null;
        this.elements.viewport?.classList.remove('is-dragging');
        
        // Animar el retorno a posición original
        const pageInner = this.getActivePageInner();
        if (pageInner) {
            pageInner.classList.add('animating');
            pageInner.style.transform = '';
            pageInner.style.opacity = '';
        }
        
        this.hideIndicators();
        
        if (!wasHorizontal) return;
        
        const shouldChangePage = Math.abs(diffX) > this.touch.threshold || velocity > this.touch.velocityThreshold;
        
        if (shouldChangePage) {
            if (diffX > 0) {
                if (this.currentPage < this.totalPages - 1) {
                    this.goToPage(this.currentPage + 1, 'next');
                } else {
                    this.showBounce('right');
                }
            } else {
                if (this.currentPage > 0) {
                    this.goToPage(this.currentPage - 1, 'prev');
                } else {
                    this.showBounce('left');
                }
            }
        }
    },
    
    handleDragCancel() {
        this.touch.isDragging = false;
        this.touch.isHorizontalSwipe = null;
        this.elements.viewport?.classList.remove('is-dragging');
        
        const pageInner = this.getActivePageInner();
        if (pageInner) {
            pageInner.classList.add('animating');
            pageInner.style.transform = '';
            pageInner.style.opacity = '';
        }
        
        this.hideIndicators();
    },
    
    updateDragVisuals(diffX) {
        const pageInner = this.getActivePageInner();
        if (!pageInner) return;
        
        // Resistencia en los límites
        let adjustedDiff = diffX;
        const atStart = this.currentPage === 0 && diffX > 0;
        const atEnd = this.currentPage === this.totalPages - 1 && diffX < 0;
        
        if (atStart || atEnd) {
            adjustedDiff = diffX * this.touch.resistance;
        }
        
        const maxTranslate = 120;
        const clampedDiff = Math.max(-maxTranslate, Math.min(maxTranslate, adjustedDiff));
        const opacityReduction = Math.abs(clampedDiff / maxTranslate) * 0.25;
        
        pageInner.style.transform = `translateX(${clampedDiff}px)`;
        pageInner.style.opacity = 1 - opacityReduction;
        
        this.updateIndicators(diffX);
    },
    
    updateIndicators(diffX) {
        const { leftIndicator, rightIndicator } = this.elements;
        if (!leftIndicator || !rightIndicator) return;
        
        const canGoPrev = this.currentPage > 0;
        const canGoNext = this.currentPage < this.totalPages - 1;
        const triggered = Math.abs(diffX) > this.touch.threshold;
        
        // Indicador izquierdo (prev)
        if (diffX > 0 && canGoPrev) {
            leftIndicator.classList.add('visible');
            leftIndicator.classList.toggle('triggered', triggered);
        } else {
            leftIndicator.classList.remove('visible', 'triggered');
        }
        
        // Indicador derecho (next)
        if (diffX < 0 && canGoNext) {
            rightIndicator.classList.add('visible');
            rightIndicator.classList.toggle('triggered', triggered);
        } else {
            rightIndicator.classList.remove('visible', 'triggered');
        }
    },
    
    hideIndicators() {
        this.elements.leftIndicator?.classList.remove('visible', 'triggered');
        this.elements.rightIndicator?.classList.remove('visible', 'triggered');
    },
    
    showBounce(direction) {
        const pageInner = this.getActivePageInner();
        if (!pageInner) return;
        
        pageInner.classList.remove('animating');
        pageInner.classList.add(`bounce-${direction}`);
        
        setTimeout(() => {
            pageInner.classList.remove(`bounce-${direction}`);
        }, 400);
    },
    
    getActivePage() {
        return this.elements.pagesWrapper?.querySelector('.magazine-page.active');
    },
    
    getActivePageInner() {
        return this.getActivePage()?.querySelector('.magazine-page-inner');
    },
    
    getPageImageUrl(page) {
        if (typeof page === 'string') return page;
        return page.url || page.image || page.src || page.img || null;
    },
    
    getPageAlt(page, index) {
        if (typeof page === 'string') return `Página ${index + 1}`;
        return page.alt || page.title || `Página ${index + 1}`;
    },
    
    getPageThumbnail(page) {
        if (typeof page === 'string') return page;
        return page.thumbnail || page.thumb || this.getPageImageUrl(page);
    },
    
    register(id, magazineData) {
        this.magazines[id] = magazineData;
    },
    
    registerFromArticles(articles) {
        if (!Array.isArray(articles)) return;
        articles.forEach(article => {
            if (article.type === 'magazine' && article.id && article.magazineData) {
                this.register(article.id, { title: article.title || 'Revista', ...article.magazineData });
            }
        });
    },
    
    openFromData(magazineId) {
        if (!this.elements.modal) this.createModal();
        
        const magazine = this.magazines[magazineId];
        if (!magazine) {
            console.error(`MagazineReader: Revista "${magazineId}" no encontrada`);
            return;
        }
        
        this.currentMagazine = magazine;
        this.currentPage = 0;
        this.totalPages = magazine.pages?.length || 0;
        
        if (this.totalPages === 0) {
            console.error('MagazineReader: La revista no tiene páginas');
            return;
        }
        
        if (this.elements.title) {
            this.elements.title.textContent = magazine.title || 'Revista';
        }
        
        this.renderPages();
        this.renderThumbnails();
        this.updateNavigation();
        
        this.elements.modal?.classList.add('active');
        this.isOpen = true;
        document.body.style.overflow = 'hidden';
        
        this.showSwipeHint();
    },
    
    showSwipeHint() {
        if (this.swipeHintShown || !('ontouchstart' in window)) return;
        
        const hint = document.createElement('div');
        hint.className = 'magazine-swipe-hint';
        hint.innerHTML = `
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 4l6 6m0 0l-6 6m6-6H3"/>
            </svg>
            <span>Desliza para navegar</span>
        `;
        
        this.elements.viewport?.appendChild(hint);
        this.swipeHintShown = true;
        
        setTimeout(() => {
            hint.classList.add('hiding');
            setTimeout(() => hint.remove(), 400);
        }, 2500);
    },
    
    renderPages() {
        if (!this.elements.pagesWrapper || !this.currentMagazine) return;
        
        const pages = this.currentMagazine.pages || [];
        
        this.elements.pagesWrapper.innerHTML = pages.map((page, index) => {
            const imageSrc = this.getPageImageUrl(page);
            const altText = this.getPageAlt(page, index);
            
            const content = imageSrc
                ? `<img src="${imageSrc}" alt="${altText}" loading="${index < 3 ? 'eager' : 'lazy'}" draggable="false"
                       onerror="this.parentElement.innerHTML='<div class=\\'magazine-page-error\\'><p>Error cargando página ${index + 1}</p></div>'">`
                : `<div class="magazine-page-error"><p>Página ${index + 1} no disponible</p></div>`;
            
            return `
                <div class="magazine-page ${index === 0 ? 'active' : ''}" data-page="${index}">
                    <div class="magazine-page-inner">${content}</div>
                </div>
            `;
        }).join('');
    },
    
    renderThumbnails() {
        if (!this.elements.thumbnails || !this.currentMagazine) return;
        
        const pages = this.currentMagazine.pages || [];
        
        this.elements.thumbnails.innerHTML = pages.map((page, index) => {
            const thumbSrc = this.getPageThumbnail(page);
            const content = thumbSrc
                ? `<img src="${thumbSrc}" alt="Página ${index + 1}" draggable="false"><span class="thumbnail-number">${index + 1}</span>`
                : `<div class="thumbnail-placeholder">${index + 1}</div>`;
            
            return `
                <div class="magazine-thumbnail ${index === 0 ? 'active' : ''}" data-page="${index}" onclick="MagazineReader.goToPage(${index})">
                    ${content}
                </div>
            `;
        }).join('');
    },
    
    goToPage(pageIndex, direction = null) {
        if (pageIndex < 0 || pageIndex >= this.totalPages) return;
        if (pageIndex === this.currentPage) return;
        if (this.isAnimating) return;
        
        this.isAnimating = true;
        
        const pages = this.elements.pagesWrapper?.querySelectorAll('.magazine-page');
        if (!pages) return;
        
        const currentPageEl = pages[this.currentPage];
        const nextPageEl = pages[pageIndex];
        
        // Determinar dirección si no se especificó
        if (!direction) {
            direction = pageIndex > this.currentPage ? 'next' : 'prev';
        }
        
        const enterClass = direction === 'next' ? 'from-right' : 'from-left';
        const exitClass = direction === 'next' ? 'to-left' : 'to-right';
        
        // Limpiar estilos inline del arrastre
        const currentInner = currentPageEl?.querySelector('.magazine-page-inner');
        if (currentInner) {
            currentInner.style.transform = '';
            currentInner.style.opacity = '';
            currentInner.classList.remove('animating');
        }
        
        // Configurar página saliente
        currentPageEl.classList.remove('active');
        currentPageEl.classList.add('exiting', exitClass);
        
        // Configurar página entrante
        nextPageEl.classList.add('entering', enterClass);
        
        // Limpiar después de la animación
        setTimeout(() => {
            currentPageEl.classList.remove('exiting', exitClass);
            nextPageEl.classList.remove('entering', enterClass);
            nextPageEl.classList.add('active');
            
            this.isAnimating = false;
        }, 300);
        
        this.currentPage = pageIndex;
        
        // Actualizar thumbnails
        const thumbs = this.elements.thumbnails?.querySelectorAll('.magazine-thumbnail');
        thumbs?.forEach((thumb, i) => thumb.classList.toggle('active', i === pageIndex));
        
        // Scroll thumbnail a la vista
        const activeThumb = this.elements.thumbnails?.querySelector('.magazine-thumbnail.active');
        activeThumb?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' });
        
        this.updateNavigation();
    },
    
    nextPage() {
        if (this.currentPage < this.totalPages - 1) {
            this.goToPage(this.currentPage + 1, 'next');
        }
    },
    
    prevPage() {
        if (this.currentPage > 0) {
            this.goToPage(this.currentPage - 1, 'prev');
        }
    },
    
    updateNavigation() {
        if (this.elements.currentPageEl) {
            this.elements.currentPageEl.textContent = this.currentPage + 1;
        }
        if (this.elements.totalPagesEl) {
            this.elements.totalPagesEl.textContent = this.totalPages;
        }
        if (this.elements.prevBtn) {
            this.elements.prevBtn.disabled = this.currentPage === 0;
        }
        if (this.elements.nextBtn) {
            this.elements.nextBtn.disabled = this.currentPage === this.totalPages - 1;
        }
    },
    
    close() {
        this.elements.modal?.classList.remove('active');
        this.isOpen = false;
        this.isAnimating = false;
        this.currentMagazine = null;
        this.touch.isDragging = false;
        document.body.style.overflow = '';
    }
};

// Inicializar
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => MagazineReader.init());
} else {
    MagazineReader.init();
}

window.MagazineReader = MagazineReader;