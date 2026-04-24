document.addEventListener('DOMContentLoaded', () => {
    // 1. DATOS INICIALES
    const videosData = [
        "https://www.youtube.com/watch?v=6be3c9Q0aNI",
        "https://www.youtube.com/watch?v=D9_J0BIaqiM",
        "https://www.youtube.com/watch?v=aM7MoWc11hE",
        "https://www.youtube.com/watch?v=BfI0EsOZUwE",
        "https://www.youtube.com/watch?v=8veHWVVAPp4",
        "https://www.youtube.com/watch?v=8Qim8pHt8Dg",
        "https://www.youtube.com/watch?v=US64H15OCFU"
    ];

    const audiosData = [
        "https://open.spotify.com/episode/04hzI0itW5HeaBSkpNmK7V",
        "https://open.spotify.com/episode/2xvz2ocadzxSXmyVmXhrI3",
        "https://open.spotify.com/episode/176fZ2TrOAL0dEQnGIm11w",
        "https://open.spotify.com/episode/0B8qlsZ4YcQfYFoV1p62rg",
        "https://open.spotify.com/episode/67cQaOKPyD6HCamJQIZ1oh",
        "https://open.spotify.com/episode/49Tqe8QE8YbQgLtz1RGxnf",
        "https://open.spotify.com/episode/0nKIFK652CYV9NfyCbVJhZ"
    ];

    
    // 2. SISTEMA DE IDIOMAS (Integración con GKraken)
    const i18n = {
        es: {
            videoEpisodes: 'EPISODIOS EN VIDEO',
            audioEpisodes: 'EPISODIOS EN AUDIO',
            episode: 'Episodio',
            videoSubtitle: 'Video SOCCER iD',
            audioSubtitle: 'Podcast SOCCER iD'
        },
        en: {
            videoEpisodes: 'VIDEO EPISODES',
            audioEpisodes: 'AUDIO EPISODES',
            episode: 'Episode',
            videoSubtitle: 'SOCCER iD Video',
            audioSubtitle: 'SOCCER iD Podcast'
        }
    };

    function t(key) {
        const lang = (typeof GKraken !== 'undefined' && GKraken.currentLang) ? GKraken.currentLang : 'es';
        const safeLang = i18n[lang] ? lang : 'es';
        return i18n[safeLang][key];
    }

    const ytRegex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
    const spotifyRegex = /spotify\.com\/(track|album|playlist|episode|show)\/([a-zA-Z0-9]+)/;

    let currentMode = 'video';
    let currentFeaturedIndex = videosData.length - 1;

    const tabBtns = document.querySelectorAll('.widget-tab-btn');
    const playlistSection = document.querySelector('.widget-playlist-section');
    const featuredSection = document.querySelector('.widget-featured-section');
    const playlistContainer = document.getElementById('widget-playlist-container');
    const featuredContainer = document.getElementById('widget-featured-container');
    const playlistSubtitle = document.getElementById('widget-playlist-subtitle');
    const mobileToggleBtn = document.getElementById('widget-mobile-toggle-btn');
    const playlistWrapper = document.getElementById('widget-playlist-wrapper');
    
    // Contenedor donde quieras mostrar los botones sociales (Asegúrate de tener este ID en tu HTML)
    const socialContainer = document.getElementById('widget-social-container'); 

    // 3. FUNCIONES DE PLANTILLAS
    function getFeaturedHtml(data) {
        if (!data || !data.id) return '';
        if (data.isVideo) {
            return `<iframe src="https://www.youtube.com/embed/${data.id}?autoplay=1&mute=1" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>`;
        } else {
            return `<iframe src="https://open.spotify.com/embed/${data.type}/${data.id}?theme=0" allowtransparency="true" allow="encrypted-media"></iframe>`;
        }
    }

    function getPlaylistHtml(items) {
        return items.map(item => `
            <div class="widget-playlist-item" data-index="${item.originalIndex}">
                <div class="widget-item-thumb" style="${item.thumbStyle}">
                    ${item.iconSvg}
                </div>
                <div class="widget-item-info">
                    <div class="widget-item-title">${item.title}</div>
                    <div class="widget-item-subtitle">${item.subtitle}</div>
                </div>
                <div class="widget-play-icon">
                    <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                </div>
            </div>
        `).join('');
    }

    // NUEVA FUNCIÓN: Plantilla para los canales sociales
    function getSocialChannelsHtml() {
        return `
            <div class="widget-social-channels">
                <a href="https://www.youtube.com/channel/UC4Mf2_KUFB5PVfHlKhSpkiQ" target="_blank" class="social-link-w" title="YouTube">
                    <svg viewBox="0 0 24 24"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"></path></svg>
                </a>
                <a href="https://open.spotify.com/show/1sbpDSju5JcrnLqO2qhutY" target="_blank" class="social-link-w" title="Spotify">
                    <svg viewBox="0 0 24 24"><path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm5.45 17.34c-.21.346-.666.459-1.012.249-2.774-1.695-6.264-2.078-10.384-1.138-.396.09-.784-.158-.874-.554-.09-.396.158-.784.554-.874 4.508-1.028 8.356-.596 11.467 1.305.346.21.459.666.249 1.012zm1.43-3.195c-.266.432-.835.575-1.267.309-3.18-1.953-8.06-2.535-11.751-1.388-.506.157-1.042-.125-1.199-.631-.157-.506.125-1.042.631-1.199 4.227-1.312 9.615-.658 13.277 1.595.432.266.575.835.309 1.267zm.126-3.37c-3.81-2.262-10.084-2.47-13.73-.726-.607.29-1.332-.034-1.622-.641-.29-.607.034-1.332.641-1.622 4.227-2.023 11.166-1.785 15.602.852.55.326.732 1.037.406 1.587-.326.55-1.037.732-1.587.406z"></path></svg>
                </a>
            </div>
        `;
    }

    // 4. LÓGICA DE RENDERIZADO
    function renderApp() {
        const dataArray = currentMode === 'video' ? videosData : audiosData;
        
        if (currentFeaturedIndex >= dataArray.length || currentFeaturedIndex < 0) {
            currentFeaturedIndex = Math.max(0, dataArray.length - 1);
        }
        
        playlistSubtitle.textContent = currentMode === 'video' ? t('videoEpisodes') : t('audioEpisodes');
        
        if (currentMode === 'audio') {
            featuredContainer.classList.add('audio-mode');
        } else {
            featuredContainer.classList.remove('audio-mode');
        }

        if (dataArray.length <= 1) {
            playlistSection.style.display = 'none';
            featuredSection.style.width = '100%';
        } else {
            playlistSection.style.display = '';
            featuredSection.style.width = '';
        }

        const featuredUrl = dataArray[currentFeaturedIndex];
        let featuredData = {};
        
        if (featuredUrl) {
            if (currentMode === 'video') {
                const ytMatch = featuredUrl.match(ytRegex);
                if (ytMatch) featuredData = { isVideo: true, id: ytMatch[1] };
            } else {
                const spMatch = featuredUrl.match(spotifyRegex);
                if (spMatch) featuredData = { isVideo: false, type: spMatch[1], id: spMatch[2] };
            }
        }
        
        featuredContainer.innerHTML = getFeaturedHtml(featuredData);

        const playlistItemsData = [];
        if (dataArray.length > 1) {
            dataArray.forEach((url, index) => {
                if (index !== currentFeaturedIndex) {
                    if (currentMode === 'video') {
                        const match = url.match(ytRegex);
                        if (match) {
                            playlistItemsData.push({
                                originalIndex: index,
                                thumbStyle: `background-image: url('https://img.youtube.com/vi/${match[1]}/mqdefault.jpg');`,
                                title: `${t('episode')} ${index + 1}`,
                                subtitle: t('videoSubtitle'),
                                iconSvg: `<svg viewBox="0 0 24 24"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>`
                            });
                        }
                    } else {
                        const match = url.match(spotifyRegex);
                        if (match) {
                            playlistItemsData.push({
                                originalIndex: index,
                                thumbStyle: `background: linear-gradient(135deg, var(--color-secondary), var(--color-primary));`,
                                title: `${t('episode')} ${index + 1}`,
                                subtitle: t('audioSubtitle'),
                                iconSvg: `<svg viewBox="0 0 24 24"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>`
                            });
                        }
                    }
                }
            });
        }

        playlistContainer.innerHTML = getPlaylistHtml(playlistItemsData);

        // Renderizar botones sociales (si tienes un div con id="widget-social-container")
        if (socialContainer) {
            socialContainer.innerHTML = getSocialChannelsHtml();
        }
    }

    // 5. EVENTOS
    tabBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tabBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            currentMode = btn.dataset.target;
            const dataArray = currentMode === 'video' ? videosData : audiosData;
            currentFeaturedIndex = Math.max(0, dataArray.length - 1);
            
            renderApp();
        });
    });

    if (mobileToggleBtn) {
        mobileToggleBtn.addEventListener('click', () => {
            playlistWrapper.classList.toggle('open');
            mobileToggleBtn.classList.toggle('open');
        });
    }

    playlistContainer.addEventListener('click', (e) => {
        const item = e.target.closest('.widget-playlist-item');
        if (item) {
            const index = parseInt(item.dataset.index, 10);
            currentFeaturedIndex = index;
            renderApp();
            
            if (window.innerWidth <= 900) {
                playlistWrapper.classList.remove('open');
                mobileToggleBtn.classList.remove('open');
                document.querySelector('.soccer-id-widget').scrollIntoView({ behavior: 'smooth' });
            }
        }
    });

    // Inicializar
    renderApp();
});