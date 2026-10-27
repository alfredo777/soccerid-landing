# Nueva distribución · experiencia táctil

Rama `claude/nueva-distribucion-web`. Objetivo: que el sitio nuevo (layout
`v2` y el inicio) se sienta **seminativo** en el teléfono: carruseles que se
arrastran, desplazamiento sin saltos y toques que responden al bajar el dedo.

Estado al 26 de octubre de 2026: **hecho y subido a la rama, no desplegado.**
Probado en Edge sin ventana con toques simulados. El dueño revisó en iPhone,
vía ngrok, el menú y la portada del podcast (de ahí salieron el regreso al
inicio y los botones en fila); la onda no se ha confirmado en un teléfono
real. Falta la prueba en Android (ver «Pendiente»).

## Revisión de partida

Se revisó el código de las vistas `views/v2/*`, `views/layouts/v2.hbs`,
`assets/css/v2.css`, las hojas `seccion-*.css`, `inicio.css`,
`partials/carrusel-js.hbs` y `assets/js/v2-lightbox.js`. Lo que ya estaba
bien y se conservó:

- Los carruseles (`.mosaico` en celular, `.opiniones`, `.publicaciones`) usan
  el desplazamiento del navegador con `scroll-snap`: inercia y rebote nativos,
  y funcionan sin JavaScript.
- Flechas solo con ratón (`hover: hover`), indicador de posición solo en
  táctil.
- El visor de fotos como pista con snap, una foto por pantalla.

Lo que fallaba, y cómo quedó:

| Problema | Arreglo | Commit |
|---|---|---|
| Cerrar el menú (`href="#"`) subía la página al principio, con animación | El menú abre y cierra con la clase `is-abierta`; el ancla `:target` queda solo como respaldo sin JS | `c2a6408` |
| Con el menú abierto, el dedo movía la página de abajo | `html.con-menu { overflow: hidden }` | `c2a6408` |
| El «atrás» del teléfono no cerraba el menú ni el visor | Ambos empujan una entrada al historial y se cierran en `popstate` | `c2a6408` |
| El carrusel de publicaciones de Instagram no se arrastraba: el iframe se quedaba con el gesto | Escudo transparente `.publicacion__escudo` sobre el embed: arrastrar desliza, tocar abre la publicación | `c2a6408` |
| Ningún estado `:active`: al presionar no pasaba nada | Bloque «Toque» en `v2.css` e `inicio.css`, más `touch-action: manipulation` | `c2a6408` |
| Podcast en una columna: tocar un episodio cambiaba un video fuera de vista | Sube hasta el reproductor si no se ve entero | `c2a6408` |
| Áreas de toque menores a 44 px (Cerrar, avisos del pie, redes e idioma del inicio) | Relleno o `::after` expandido, sin cambiar lo que se ve | `c2a6408` |
| El indicador del carrusel no aparecía al girar el teléfono | El riel se crea siempre y se esconde sin desborde | `c2a6408` |
| `scroll-behavior: smooth` ignoraba «reducir movimiento» | Apagado en `prefers-reduced-motion: reduce` | `c2a6408` |
| Sin cambio de idioma dentro de las secciones | ES/EN en el menú completo, a la misma página (`currentPath`); en un reportaje lleva a Media porque los ids no coinciden entre idiomas | `c2a6408` |
| El menú completo no tenía salida al inicio | «← Inicio» primero en la lista y el logo como enlace | `f91f34b` |
| Botones de 51 px de alto en celular | 44 px, letra de 14 px (`v2.css`, bloque «Celular») | `0bad3a5` |
| Podcast: tres píldoras apiladas de ancho distinto | En celular una fila: YouTube y Spotify a partes iguales, Instagram en círculo (`.escucha`) | `d0d3f3b` |
| El toque se sentía muerto | Onda desde el punto del dedo (`assets/js/toque.js` + `assets/css/toque.css`) | `5692594` |

## Cómo funciona la onda al tocar

- `assets/js/toque.js` y `assets/css/toque.css`, en archivos propios porque
  los cargan dos plantillas con hojas base distintas: el layout `v2` y
  `views/v2/inicio.hbs` (layout `main`).
- Solo con `pointerType === 'touch'`. La onda va en una capa `.toque` con
  `overflow: hidden` y el radio del elemento, así que no toca el overflow de
  nadie. Toma `currentColor`: clara en botones oscuros, oscura en los llenos.
- `pointercancel` (el dedo resultó ser un desplazamiento) la borra rápido.
- La lista de lo tocable está en `TOCABLES`, al inicio del script. Un
  componente nuevo que deba responder al toque se agrega ahí.
- **El escuchador vacío de `touchstart` no se quita**: sin él, Safari de iOS
  no aplica `:active` y ningún estado al presionar se ve.
- Con «reducir movimiento» no hay onda; los `:active` siguen.

## Recorrido en PDF

Se generó un PDF con portada, una hoja de lo común y tres hojas por página
(explicación, captura en celular a 390 px y en escritorio a 1440 px, de página
completa) para Inicio, Tour, ficha 2024, Travel, ficha de partido, Legends,
Podcast, Media, reportaje y Nosotros. **No está en git** por decisión del
dueño (pesa 12 MB): vive en `capturas-prod/recorrido-nueva-distribucion.pdf`
en la máquina local, ignorado por `.gitignore`.

Cómo se hizo, por si se repite: Edge sin ventana manejado por el protocolo de
depuración (CDP), `Page.captureScreenshot` con `captureBeyondViewport`, y
`Page.printToPDF` **una sección a la vez**, unidas después con `pdf-lib`. El
documento entero de una sola impresión se queda colgado. Los iframes de
YouTube e Instagram salen en negro en la captura de página completa: se
sustituyen por la portada del video y un marcador antes de capturar.

## Pendiente

1. **Probar en un Android real**: el «atrás» del sistema con el menú y con el
   visor, el arrastre del carrusel de publicaciones y la onda.
2. **Videos de YouTube como portada hasta tocarlos** (Podcast, ficha de
   edición). Hoy un dedo que empieza a bajar sobre el iframe no mueve la
   página. Además quitaría el JS de YouTube de la carga inicial.
3. **Pellizcar para acercar en el visor.** Se dejó fuera: caro de hacer bien,
   y con el cierre deslizando el visor ya se siente nativo.
4. **`assets/js/cast.js` falla en el inicio** (`playlistContainer` es null en
   la línea 244): el widget del podcast ya no está en el home pero el script
   sigue cargando. También pasa en `main`. No se ve, pero ensucia la consola;
   se arregla con una guarda.
5. **Instancia de la revisión de UI**: el repo no tiene `docs/revision-ui.md`
   (hojas, partials, el corte único de 900 px y la decisión inicio-`main` /
   secciones-`v2`), que la norma de revisión pide leer primero.
