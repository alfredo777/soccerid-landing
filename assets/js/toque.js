/* Respuesta al toque: una onda que nace donde cae el dedo.
 *
 * Sólo con el dedo (pointerType "touch"): con ratón ya está el hover. La
 * onda va dentro de una capa propia (`.toque`) con `overflow: hidden` y el
 * radio del elemento, así que no hay que tocar el overflow de nadie. Se
 * apaga con "menos movimiento"; el `:active` del CSS sigue respondiendo.
 *
 * El escuchador de `touchstart` vacío no sobra: sin él, Safari de iOS no
 * aplica `:active` y los estados al presionar no se ven nunca. */
(function () {
  document.addEventListener('touchstart', function () {}, { passive: true });

  if (!window.PointerEvent) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var TOCABLES = [
    '.boton', '.nav__menu', '.nav__link', '.menu__item', '.menu__x', '.menu__idioma',
    '.red-icono', '.arriba', 'a.pilar', '.prensa__nota', '.via', '.entre__ir',
    '.entre__todas', '.nota', '.edicion', 'a.aliado', 'a.hito', '.fila-ep',
    '[data-ampliar]', '.bastidores', '.publicacion__escudo', '.carrusel__flecha',
    '.puerta', '.redes-v2__chip', '.lang-btn', '.recuerdo--enlace'
  ].join(',');

  // La onda pendiente: se queda grande mientras el dedo está abajo y se
  // desvanece al soltar. Si el dedo resulta ser un desplazamiento, el
  // navegador manda `pointercancel` y se va sin llegar a crecer del todo.
  var viva = null;

  function soltar(rapido) {
    if (!viva) return;
    var onda = viva;
    viva = null;
    onda.style.transitionDuration = rapido ? '.12s' : '.35s';
    onda.style.opacity = '0';
    setTimeout(function () {
      var capa = onda.parentNode;
      if (capa && capa.parentNode) capa.parentNode.removeChild(capa);
    }, 400);
  }

  document.addEventListener('pointerdown', function (e) {
    if (e.pointerType !== 'touch' || !e.isPrimary) return;
    var el = e.target.closest(TOCABLES);
    if (!el || el.disabled) return;
    soltar(true);

    var caja = el.getBoundingClientRect();
    var estilo = getComputedStyle(el);
    if (estilo.position === 'static') el.style.position = 'relative';

    var capa = document.createElement('span');
    capa.className = 'toque';
    capa.setAttribute('aria-hidden', 'true');
    capa.style.borderRadius = estilo.borderRadius;

    // El radio alcanza la esquina más lejana desde el punto de toque.
    var x = e.clientX - caja.left, y = e.clientY - caja.top;
    var r = Math.sqrt(Math.pow(Math.max(x, caja.width - x), 2) + Math.pow(Math.max(y, caja.height - y), 2));

    var onda = document.createElement('span');
    onda.className = 'toque__onda';
    onda.style.width = onda.style.height = (r * 2) + 'px';
    onda.style.left = (x - r) + 'px';
    onda.style.top = (y - r) + 'px';

    capa.appendChild(onda);
    el.appendChild(capa);
    viva = onda;
    // Un fotograma para que el navegador pinte el punto antes de crecer.
    requestAnimationFrame(function () { onda.classList.add('is-crece'); });
  }, { passive: true });

  document.addEventListener('pointerup', function () { soltar(false); }, { passive: true });
  document.addEventListener('pointercancel', function () { soltar(true); }, { passive: true });
  // Al volver con «atrás» la página puede venir de la caché con una onda a medias.
  window.addEventListener('pageshow', function () { soltar(true); });
})();
