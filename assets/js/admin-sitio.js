/* Editor de páginas del sitio público (Panel › Sitio web).
 *
 * Genérico: arma el formulario a partir de un esquema que trae cada página
 * (`window.SITIO_ESQUEMA`) y de los datos que manda el servidor en
 * <script id="sitioDatos" type="application/json">: { lang, t, c, ... }.
 *   t = textos del idioma que se edita
 *   c = lo común a los dos idiomas (fotos, logos)
 * Una clave con prefijo `c.` vive en `c`; cualquier otra, en `t`.
 *
 * Tipos de campo: texto · area · img · select · textos (lista de frases) ·
 * lista (filas con columnas; cada columna es texto, area, img o select).
 * Guarda todo junto por fetch en JSON y avisa si se sale con cambios. */
(function () {
  var esquema = window.SITIO_ESQUEMA;
  var raiz = document.getElementById('sitioEditor');
  var fuente = document.getElementById('sitioDatos');
  if (!esquema || !raiz || !fuente) return;

  var datos = JSON.parse(fuente.textContent);
  var estado = { t: datos.t || {}, c: datos.c || {} };
  var sucio = false;

  // ── Utilidades ──────────────────────────────────────────────────────
  function el(tag, attrs, hijos) {
    var n = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) {
      if (k === 'texto') n.textContent = attrs[k];
      else if (k.indexOf('on') === 0) n.addEventListener(k.slice(2), attrs[k]);
      else if (attrs[k] !== false && attrs[k] != null) n.setAttribute(k, attrs[k]);
    });
    (hijos || []).forEach(function (h) { if (h) n.appendChild(typeof h === 'string' ? document.createTextNode(h) : h); });
    return n;
  }
  function donde(k) { return k.indexOf('c.') === 0 ? { obj: estado.c, ruta: k.slice(2) } : { obj: estado.t, ruta: k }; }
  function leer(k) {
    var d = donde(k);
    return d.ruta.split('.').reduce(function (o, p) { return o == null ? undefined : o[p]; }, d.obj);
  }
  function escribir(k, v) {
    var d = donde(k), partes = d.ruta.split('.'), o = d.obj;
    partes.slice(0, -1).forEach(function (p) { if (o[p] == null || typeof o[p] !== 'object') o[p] = {}; o = o[p]; });
    o[partes[partes.length - 1]] = v;
    marcar();
  }
  function marcar() {
    sucio = true;
    var b = document.getElementById('sitioGuardar');
    if (b) b.classList.add('is-pendiente');
  }

  var toastTimer;
  function toast(msg, error) {
    var t = document.getElementById('sitioToast');
    if (!t) { t = el('div', { id: 'sitioToast', 'class': 'st-toast', role: 'status' }); document.body.appendChild(t); }
    t.textContent = msg;
    t.classList.toggle('is-error', !!error);
    t.classList.add('is-visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('is-visible'); }, 3200);
  }

  function enviar(url, cuerpo) {
    return fetch(url, {
      method: 'POST', credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo)
    }).then(function (r) { return r.json().catch(function () { return { ok: false, error: 'Respuesta inválida' }; }); });
  }

  function subirImagen(alTerminar, boton) {
    var inp = el('input', { type: 'file', accept: 'image/*' });
    inp.addEventListener('change', function () {
      var f = inp.files && inp.files[0];
      if (!f) return;
      var texto = boton.textContent;
      boton.textContent = 'Subiendo…'; boton.disabled = true;
      var fd = new FormData(); fd.append('image', f);
      fetch('/panel/admin/upload', { method: 'POST', body: fd, credentials: 'same-origin' })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          boton.textContent = texto; boton.disabled = false;
          if (!j || !j.url) return toast('No se pudo subir: ' + ((j && j.error) || 'error desconocido'), true);
          alTerminar(j.url);
        })
        .catch(function (e) { boton.textContent = texto; boton.disabled = false; toast('No se pudo subir: ' + e.message, true); });
    });
    inp.click();
  }

  // ── Controles ───────────────────────────────────────────────────────
  // `get`/`set` abstraen dónde vive el valor: un campo suelto o una celda
  // de una fila de lista usan el mismo control.
  function control(def, get, set) {
    var tipo = def.tipo || 'texto';
    if (tipo === 'area') {
      var ta = el('textarea', { rows: def.filas || 3, placeholder: def.ej || '' });
      ta.value = get() || '';
      ta.addEventListener('input', function () { set(ta.value); });
      return ta;
    }
    if (tipo === 'check') {
      var cb = el('input', { type: 'checkbox' });
      cb.checked = !!get();
      cb.addEventListener('change', function () { set(cb.checked); });
      return el('label', { 'class': 'st-check' }, [cb, el('span', { texto: def.texto || 'Sí' })]);
    }
    if (tipo === 'select') {
      var s = el('select');
      (def.opciones || []).forEach(function (o) { s.appendChild(el('option', { value: o[0], texto: o[1] })); });
      s.value = get() || (def.opciones[0] || [])[0];
      s.addEventListener('change', function () { set(s.value); });
      return s;
    }
    if (tipo === 'img') {
      var vista = el('span', { 'class': 'st-img__vista' });
      var inp = el('input', { type: 'text', placeholder: '/assets/images/... o sube una imagen' });
      function pintar() { vista.style.backgroundImage = inp.value ? 'url("' + inp.value.replace(/"/g, '%22') + '")' : ''; }
      inp.value = get() || '';
      inp.addEventListener('input', function () { set(inp.value.trim()); pintar(); });
      var b = el('button', { type: 'button', 'class': 'st-mini', texto: 'Subir' });
      b.addEventListener('click', function () { subirImagen(function (url) { inp.value = url; set(url); pintar(); }, b); });
      pintar();
      return el('div', { 'class': 'st-img' }, [vista, inp, b]);
    }
    var i = el('input', { type: 'text', placeholder: def.ej || '' });
    i.value = get() || '';
    i.addEventListener('input', function () { set(i.value); });
    return i;
  }

  function campo(def) {
    var cuerpo;
    if (def.tipo === 'lista' || def.tipo === 'textos') cuerpo = lista(def);
    else cuerpo = control(def, function () { return leer(def.k); }, function (v) { escribir(def.k, v); });
    return el('div', { 'class': 'st-f' }, [
      el('label', { texto: def.l }), cuerpo,
      def.ayuda ? el('div', { 'class': 'st-ayuda', texto: def.ayuda }) : null
    ]);
  }

  // Lista de filas: agregar, quitar y subir/bajar. Se repinta entera al
  // cambiar su forma; al escribir no, para no perder el foco.
  function lista(def) {
    var caja = el('div', { 'class': 'st-lista' });
    var esTextos = def.tipo === 'textos';
    function filas() { var v = leer(def.k); return Array.isArray(v) ? v : []; }
    function pintar() {
      caja.innerHTML = '';
      var v = filas();
      v.forEach(function (fila, i) {
        var celdas = esTextos
          ? [control({ ej: def.ej }, function () { return v[i]; }, function (x) { v[i] = x; marcar(); })]
          : def.cols.map(function (col) {
              return el('div', { 'class': 'st-celda' + (col.ancho ? ' st-celda--' + col.ancho : '') }, [
                el('small', { texto: col.l }),
                control(col, function () { return fila[col.c]; }, function (x) { fila[col.c] = x; marcar(); })
              ]);
            });
        var acciones = el('div', { 'class': 'st-fila__acc' }, [
          el('button', { type: 'button', 'class': 'st-mini', title: 'Subir', 'aria-label': 'Subir', texto: '↑', disabled: i === 0 ? 'disabled' : false,
            onclick: function () { v.splice(i - 1, 0, v.splice(i, 1)[0]); escribir(def.k, v); pintar(); } }),
          el('button', { type: 'button', 'class': 'st-mini', title: 'Bajar', 'aria-label': 'Bajar', texto: '↓', disabled: i === v.length - 1 ? 'disabled' : false,
            onclick: function () { v.splice(i + 1, 0, v.splice(i, 1)[0]); escribir(def.k, v); pintar(); } }),
          el('button', { type: 'button', 'class': 'st-mini st-mini--quitar', title: 'Quitar', 'aria-label': 'Quitar', texto: '✕',
            onclick: function () { v.splice(i, 1); escribir(def.k, v); pintar(); } })
        ]);
        // Las columnas normales se reparten el ancho a partes iguales; las
        // anchas ocupan su propio renglón.
        var grid = el('div', { 'class': 'st-fila__celdas' }, celdas);
        if (!esTextos) grid.style.setProperty('--cols', def.cols.filter(function (c) { return !c.ancho; }).length || 1);
        caja.appendChild(el('div', { 'class': 'st-fila' + (esTextos ? ' st-fila--simple' : '') }, [grid, acciones]));
      });
      if (!v.length) caja.appendChild(el('div', { 'class': 'st-vacio', texto: 'Vacío: el bloque no se muestra en la página.' }));
      if (!def.max || v.length < def.max) {
        caja.appendChild(el('button', { type: 'button', 'class': 'st-agregar', texto: '+ ' + (def.agregar || 'Agregar'),
          onclick: function () {
            var nueva = esTextos ? '' : {};
            if (!esTextos) def.cols.forEach(function (col) { nueva[col.c] = col.tipo === 'select' ? col.opciones[0][0] : ''; });
            v.push(nueva); escribir(def.k, v); pintar();
          } }));
      }
    }
    pintar();
    return caja;
  }

  // Ediciones jugadas: cada una se guarda por su lado, sobre su fila en la
  // base, porque es la misma que pinta su ficha.
  function bloqueEdiciones() {
    var caja = el('div', { 'class': 'st-ediciones' });
    (datos.ediciones || []).forEach(function (ed) {
      var v = { match: ed.match, venue: ed.venue, city: ed.city, asistencia: ed.asistencia };
      var cols = [['match', 'Partido'], ['venue', 'Estadio'], ['city', 'Ciudad'], ['asistencia', 'Asistencia']];
      var boton = el('button', { type: 'button', 'class': 'st-mini st-mini--guardar', texto: 'Guardar ' + ed.year });
      boton.addEventListener('click', function () {
        boton.disabled = true;
        enviar(esquema.edicion.replace(':id', ed.id), Object.assign({ lang: datos.lang }, v)).then(function (j) {
          boton.disabled = false;
          toast(j.ok ? 'Edición ' + ed.year + ' guardada' : 'No se guardó: ' + j.error, !j.ok);
        });
      });
      caja.appendChild(el('div', { 'class': 'st-edicion' }, [
        el('strong', { 'class': 'st-edicion__anio', texto: String(ed.year) }),
        el('div', { 'class': 'st-fila__celdas', style: '--cols:' + cols.length }, cols.map(function (c) {
          return el('div', { 'class': 'st-celda' }, [el('small', { texto: c[1] }),
            control({}, function () { return v[c[0]]; }, function (x) { v[c[0]] = x; })]);
        })),
        boton
      ]));
    });
    if (!(datos.ediciones || []).length) caja.appendChild(el('div', { 'class': 'st-vacio', texto: 'No hay ediciones jugadas en la base.' }));
    return caja;
  }

  // ── Página ──────────────────────────────────────────────────────────
  var nav = el('nav', { 'class': 'st-nav', 'aria-label': 'Bloques de la página' });
  var secciones = esquema.secciones.map(function (s, i) {
    var sec = el('section', { 'class': 'pn-card st-sec' + (i === 0 ? ' is-activa' : ''), id: 'st-' + s.id }, [
      el('h3', { texto: s.titulo }),
      s.sub ? el('p', { 'class': 'st-sub', texto: s.sub }) : null
    ].concat(s.campos.map(campo)).concat(s.extra === 'ediciones' ? [el('h4', { 'class': 'st-h4', texto: 'Ediciones jugadas' }),
      el('p', { 'class': 'st-sub', texto: esquema.textoEdiciones || '' }), bloqueEdiciones()] : []));
    nav.appendChild(el('a', { href: '#' + s.id, 'data-sec': s.id, 'class': i === 0 ? 'is-activa' : '', texto: s.titulo }));
    return sec;
  });
  function activar(id) {
    if (!document.getElementById('st-' + id)) id = esquema.secciones[0].id;
    secciones.forEach(function (s) { s.classList.toggle('is-activa', s.id === 'st-' + id); });
    nav.querySelectorAll('a').forEach(function (a) { a.classList.toggle('is-activa', a.getAttribute('data-sec') === id); });
  }
  nav.addEventListener('click', function (e) {
    var a = e.target.closest('a[data-sec]');
    if (!a) return;
    e.preventDefault();
    activar(a.getAttribute('data-sec'));
    history.replaceState(null, '', '#' + a.getAttribute('data-sec'));
  });

  var guardar = el('button', { type: 'button', id: 'sitioGuardar', 'class': 'st-guardar', texto: 'Guardar cambios' });
  guardar.addEventListener('click', function () {
    guardar.disabled = true;
    enviar(esquema.guardar, { lang: datos.lang, textos: estado.t, comun: estado.c }).then(function (j) {
      guardar.disabled = false;
      if (j.ok) { sucio = false; guardar.classList.remove('is-pendiente'); toast('Guardado. Ya se ve en la página.'); }
      else toast('No se guardó: ' + j.error, true);
    });
  });

  raiz.appendChild(nav);
  secciones.forEach(function (s) { raiz.appendChild(s); });
  raiz.appendChild(el('div', { 'class': 'st-barra' }, [
    el('span', { 'class': 'st-barra__nota', texto: esquema.nota || ('Editando en ' + (datos.lang === 'en' ? 'inglés' : 'español') + '. Fotos y logos son los mismos en los dos idiomas.') }),
    guardar
  ]));
  activar((location.hash || '').slice(1));

  window.addEventListener('beforeunload', function (e) {
    if (!sucio) return;
    e.preventDefault();
    e.returnValue = '';
  });
})();
