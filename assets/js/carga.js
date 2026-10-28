/* Precarga de fotos: ninguna se ve a medio dibujar.
 *
 * Mientras una foto baja, su hueco muestra un brillo de carga; cuando ya
 * está entera, aparece con un fundido. Sin esto, las fotos grandes se
 * pintaban por franjas de arriba abajo y en la transición se veían cortadas.
 *
 * Dos tipos:
 *   <img> (portadas, cierres, miniaturas, logos): se ocultan hasta su `load`.
 *   Fondos en línea (style="background-image:url(...)" en galerías y
 *   tarjetas): el CSS les quita el fondo y pone el brillo; aquí se descarga
 *   la foto aparte, sólo cuando está cerca de la pantalla, y al terminar se
 *   le devuelve, ya completa.
 *
 * El <head> marca `html.js-carga` antes de pintar (para que nada asome) y
 * deja un seguro: si este archivo no llega en 8 s, pone `carga-lista`, que
 * lo muestra todo. Al arrancar, este archivo cancela el seguro. Estilos: assets/css/carga.css. */
(function () {
  var IMGS = '.portada__foto, .cierre__foto, .prensa__img, .opinion__foto, .marquesina__logo img, .revista__pagina img, .fila-ep__mini img';
  var FONDOS = '.mosaico__foto, .edicion__foto, .recuerdo__foto, .experiencia__foto, .somos__foto, .nota__foto, .invitado__foto, .bastidores';

  function lista(el) { el.classList.add('is-cargada'); }

  function vigilarImg(img) {
    if (img.complete && img.naturalWidth) return lista(img);
    img.addEventListener('load', function () { lista(img); }, { once: true });
    img.addEventListener('error', function () { lista(img); }, { once: true });
  }

  function cargarFondo(el) {
    var m = /url\(["']?([^"')]+)["']?\)/.exec(el.style.backgroundImage || '');
    if (!m) return lista(el);
    var im = new Image();
    im.onload = im.onerror = function () { lista(el); };
    im.src = m[1];
    if (im.complete && im.naturalWidth) lista(el);
  }

  function iniciar() {
    // Este archivo sí llegó: se cancela el seguro del <head>.
    clearTimeout(window.__cargaSeguro);
    Array.prototype.forEach.call(document.querySelectorAll(IMGS), vigilarImg);
    var fondos = document.querySelectorAll(FONDOS);
    if (!('IntersectionObserver' in window)) return Array.prototype.forEach.call(fondos, cargarFondo);
    // Sólo lo que está a punto de verse: con decenas de fotos, bajar todas
    // de golpe retrasaría las de arriba.
    // Al asomar una foto se cargan también sus hermanas: en el teléfono las
    // galerías son carruseles y las fotos de los lados nunca «entran» en
    // pantalla hasta deslizar; así ya están listas al llegar a ellas.
    var io = new IntersectionObserver(function (entradas) {
      entradas.forEach(function (e) {
        if (!e.isIntersecting) return;
        var grupo = e.target.parentNode ? e.target.parentNode.children : [e.target];
        Array.prototype.forEach.call(grupo, function (h) {
          if (!h.matches || !h.matches(FONDOS) || h.dataset.cargaPedida) return;
          h.dataset.cargaPedida = '1';
          io.unobserve(h);
          cargarFondo(h);
        });
      });
    }, { rootMargin: '600px 0px' });
    Array.prototype.forEach.call(fondos, function (el) { io.observe(el); });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
  else iniciar();
})();
