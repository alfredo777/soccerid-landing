  /* ================================================
     EMBED VIDEO — JAVASCRIPT CONTROLLER
     ================================================ */

  // Mostrar mini-player embed al cargar
  document.addEventListener('DOMContentLoaded', function () {
    setTimeout(function () {
      var embedFloat = document.getElementById('embedVideoFloat');
      if (embedFloat) embedFloat.classList.add('embed-video-visible');
    }, 1500);
  });

  // Abrir Lightbox del embed
  function embedVideoOpenLightbox() {
    var embedOverlay = document.getElementById('embedVideoLightboxOverlay');
    var embedContent = document.getElementById('embedVideoLightboxContent');

    // Crear iframe embed CON sonido
    var embedIframe = document.createElement('iframe');
    embedIframe.setAttribute('id', 'embedVideoLightboxIframe');
    embedIframe.setAttribute('src',
      'https://www.youtube.com/embed/6be3c9Q0aNI?si=5weGQ8oXTyygY-bl?autoplay=1&mute=0&rel=0&modestbranding=1&playsinline=1&si=uDHJfnVqZKo-_qYR'
    );
    embedIframe.setAttribute('title', 'SOCCER iD Embed Video – Lightbox');
    embedIframe.setAttribute('frameborder', '0');
    embedIframe.setAttribute('allow',
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share'
    );
    embedIframe.setAttribute('allowfullscreen', '');
    embedIframe.style.width = '100%';
    embedIframe.style.height = '100%';
    embedIframe.style.border = 'none';
    embedIframe.style.display = 'block';

    // Insertar embed antes del botón cerrar
    var embedCloseBtn = document.getElementById('embedVideoLightboxClose');
    embedContent.insertBefore(embedIframe, embedCloseBtn);

    // Activar overlay
    embedOverlay.classList.add('embed-video-lightbox-active');

    // Ocultar mini-player embed
    document.getElementById('embedVideoFloat').style.display = 'none';

    // Pausar mini iframe embed
    var embedMiniIframe = document.getElementById('embedVideoMiniIframe');
    if (embedMiniIframe) {
      embedMiniIframe.contentWindow.postMessage(
        '{"event":"command","func":"pauseVideo","args":""}', '*'
      );
    }

    document.body.style.overflow = 'hidden';
  }



  // Cerrar Lightbox del embed
  function embedVideoCloseLightbox(e) {
    if (e && e.target !== document.getElementById('embedVideoLightboxOverlay') &&
        e.target !== document.getElementById('embedVideoLightboxClose')) {
      return;
    }

    var embedOverlay = document.getElementById('embedVideoLightboxOverlay');
    embedOverlay.classList.remove('embed-video-lightbox-active');

    // Remover iframe embed después de la animación
    setTimeout(function () {
      var embedLbIframe = document.getElementById('embedVideoLightboxIframe');
      if (embedLbIframe) embedLbIframe.remove();
    }, 450);

    // Restaurar mini-player embed
    var embedFloat = document.getElementById('embedVideoFloat');
    embedFloat.style.display = '';
    embedFloat.classList.add('embed-video-visible');

    document.body.style.overflow = '';
  }

  // Cerrar mini-player embed
  function embedVideoCloseMini() {
    var embedFloat = document.getElementById('embedVideoFloat');
    embedFloat.classList.remove('embed-video-visible');
    setTimeout(function () {
      embedFloat.style.display = 'none';
      var embedMiniIframe = document.getElementById('embedVideoMiniIframe');
      if (embedMiniIframe) {
        embedMiniIframe.src = '';
      }
    }, 400);
  }

  // Escape para cerrar lightbox del embed
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') {
      var embedOverlay = document.getElementById('embedVideoLightboxOverlay');
      if (embedOverlay.classList.contains('embed-video-lightbox-active')) {
        embedVideoCloseLightbox({ target: embedOverlay });
      }
    }
  });