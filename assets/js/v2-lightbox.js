/* Lightbox de las galerías (layout v2).
 *
 * Toda foto con `data-ampliar="<url>"` se abre en grande al tocarla. Las
 * fotos del mismo contenedor (.mosaico, .somos__fotos o lo que lleve
 * `data-galeria`) forman un carrete y se recorren sin cerrar.
 *
 * El carrete es una pista con scroll-snap: deslizar con el dedo lo hace el
 * navegador, con su inercia de siempre. El script sólo pone las flechas, el
 * teclado (← → Esc), el contador y abre en la foto que se tocó. Sin
 * JavaScript las fotos se quedan como están: no hay enlace roto. */
(function () {
  var fotos = document.querySelectorAll('[data-ampliar]');
  if (!fotos.length) return;

  var es = document.documentElement.lang !== 'en';
  var t = es
    ? { cerrar: 'Cerrar', ant: 'Foto anterior', sig: 'Foto siguiente', galeria: 'Galería' }
    : { cerrar: 'Close', ant: 'Previous photo', sig: 'Next photo', galeria: 'Gallery' };

  var flecha = function (d) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="' + d + '"/></svg>';
  };

  var caja = document.createElement('div');
  caja.className = 'visor';
  caja.hidden = true;
  caja.setAttribute('role', 'dialog');
  caja.setAttribute('aria-modal', 'true');
  caja.setAttribute('aria-label', t.galeria);
  caja.innerHTML =
    '<div class="visor__barra">' +
      '<span class="visor__cuenta" aria-live="polite"></span>' +
      '<button type="button" class="visor__x" aria-label="' + t.cerrar + '">' + flecha('M6 6l12 12M18 6L6 18') + '</button>' +
    '</div>' +
    '<div class="visor__pista" tabindex="-1"></div>' +
    '<button type="button" class="visor__flecha visor__flecha--ant" aria-label="' + t.ant + '">' + flecha('M15 18l-6-6 6-6') + '</button>' +
    '<button type="button" class="visor__flecha visor__flecha--sig" aria-label="' + t.sig + '">' + flecha('M9 18l6-6-6-6') + '</button>';
  document.body.appendChild(caja);

  var pista = caja.querySelector('.visor__pista');
  var cuenta = caja.querySelector('.visor__cuenta');
  var btnAnt = caja.querySelector('.visor__flecha--ant');
  var btnSig = caja.querySelector('.visor__flecha--sig');
  var total = 0, origen = null;

  function actual() {
    return pista.clientWidth ? Math.round(pista.scrollLeft / pista.clientWidth) : 0;
  }

  function pintarCuenta() {
    var i = actual();
    cuenta.textContent = total > 1 ? (i + 1) + ' / ' + total : '';
    btnAnt.hidden = total < 2 || i === 0;
    btnSig.hidden = total < 2 || i === total - 1;
  }

  function ir(i, suave) {
    i = Math.max(0, Math.min(total - 1, i));
    pista.scrollTo({ left: i * pista.clientWidth, behavior: suave ? 'smooth' : 'auto' });
  }

  function abrir(foto) {
    var grupo = foto.closest('[data-galeria], .mosaico, .somos__fotos') || foto.parentNode;
    var lista = Array.prototype.slice.call(grupo.querySelectorAll('[data-ampliar]'));
    total = lista.length;
    pista.innerHTML = lista.map(function (f) {
      var alt = (f.getAttribute('aria-label') || '').replace(/"/g, '&quot;');
      return '<figure class="visor__foto"><img src="' + f.getAttribute('data-ampliar') + '" alt="' + alt + '" draggable="false"></figure>';
    }).join('');
    origen = foto;
    caja.hidden = false;
    document.documentElement.classList.add('con-visor');
    // Una entrada en el historial: el «atrás» del teléfono cierra el visor
    // en vez de sacar a la persona de la página.
    history.pushState({ visor: 1 }, '');
    // Primero se pinta la caja, luego se mide y se salta a la foto tocada.
    requestAnimationFrame(function () {
      ir(lista.indexOf(foto), false);
      pintarCuenta();
      pista.focus({ preventScroll: true });
    });
  }

  // Lo que de verdad cierra. Lo llama `popstate`, así que botón, fondo,
  // Esc y gesto pasan todos por el historial y no queda una entrada huérfana.
  function ocultar() {
    if (caja.hidden) return;
    caja.hidden = true;
    caja.style.transform = caja.style.opacity = caja.style.transition = '';
    pista.innerHTML = '';
    document.documentElement.classList.remove('con-visor');
    if (origen) origen.focus({ preventScroll: true });
  }

  function cerrar() {
    if (history.state && history.state.visor) history.back();
    else ocultar();
  }

  window.addEventListener('popstate', ocultar);

  // Deslizar hacia abajo cierra, como en la galería del teléfono. La caja
  // sigue al dedo y se desvanece; pasado el umbral se va, si no, regresa.
  // Sólo cuenta si el gesto empieza vertical: el horizontal es del carrete.
  var y0 = 0, x0 = 0, dy = 0, modo = null;
  pista.addEventListener('touchstart', function (e) {
    if (e.touches.length !== 1) { modo = 'no'; return; }
    y0 = e.touches[0].clientY; x0 = e.touches[0].clientX; dy = 0; modo = null;
    caja.style.transition = 'none';
  }, { passive: true });
  pista.addEventListener('touchmove', function (e) {
    if (modo === 'no' || e.touches.length !== 1) return;
    var my = e.touches[0].clientY - y0, mx = e.touches[0].clientX - x0;
    if (modo === null) {
      if (Math.abs(my) < 8 && Math.abs(mx) < 8) return;
      modo = my > 0 && Math.abs(my) > Math.abs(mx) ? 'bajar' : 'no';
    }
    if (modo !== 'bajar') return;
    dy = Math.max(0, my);
    caja.style.transform = 'translateY(' + dy + 'px)';
    caja.style.opacity = String(Math.max(0.3, 1 - dy / 400));
  }, { passive: true });
  pista.addEventListener('touchend', function () {
    if (modo !== 'bajar') return;
    modo = null;
    caja.style.transition = 'transform .2s ease, opacity .2s ease';
    if (dy > 90) {
      caja.style.transform = 'translateY(100%)';
      caja.style.opacity = '0';
      setTimeout(cerrar, 180);
    } else {
      caja.style.transform = '';
      caja.style.opacity = '';
    }
  });

  Array.prototype.forEach.call(fotos, function (f) {
    f.addEventListener('click', function () { abrir(f); });
  });

  caja.querySelector('.visor__x').addEventListener('click', cerrar);
  btnAnt.addEventListener('click', function () { ir(actual() - 1, true); });
  btnSig.addEventListener('click', function () { ir(actual() + 1, true); });
  // Tocar el fondo (no la foto) también cierra.
  pista.addEventListener('click', function (e) { if (e.target === pista || e.target.classList.contains('visor__foto')) cerrar(); });
  pista.addEventListener('scroll', pintarCuenta, { passive: true });
  window.addEventListener('resize', function () { if (!caja.hidden) ir(actual(), false); });

  document.addEventListener('keydown', function (e) {
    if (caja.hidden) return;
    if (e.key === 'Escape') cerrar();
    else if (e.key === 'ArrowLeft') { e.preventDefault(); ir(actual() - 1, true); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); ir(actual() + 1, true); }
  });
})();
