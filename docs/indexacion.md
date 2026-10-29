# Indexación del sitio

Estado del 29/10/2026 (rama `claude/nueva-distribucion-web`).

## Qué hay

| Pieza | Dónde | Qué hace |
|---|---|---|
| `/robots.txt` | `index.js` (bloque «INDEXACIÓN») | En `soccerid.co` y `www.soccerid.co`: permite todo menos `/panel`, `/admin`, `/api/` y `/contents/`, y apunta al sitemap. En cualquier otro host (herokuapp.com, ngrok, localhost): `Disallow: /`. |
| `/sitemap.xml` | `index.js`, `paginasSitemap()` | Se arma en cada petición con los datos vivos: inicio, las seis secciones, ediciones de la copa, partidos futuros, artículos, fichas de viajes y de Legends, y las páginas legales. Las páginas que existen en los dos idiomas llevan sus `xhtml:link` hreflang. |
| hreflang | `views/layouts/main.hbs`, `v2.hbs`, `legal/*.hbs` | `es`, `en` y `x-default` (español), con el helper `urlIdioma`. Las páginas que sólo existen en español llevan `sinAlternas: true` y no emiten hreflang. |
| robots por página | `v2.hbs` | `index, follow` salvo `noIndexar` (fichas con «Texto pendiente»). |

## Lo que no se indexa

- Las propuestas de `/socceridcup2027/**`: todas llevan `noindex` (`lib/propuestas.js`). Tienen candado y la dirección se manda por correo.
- El panel (`noindex` en su layout y bloqueado en robots.txt).
- Las plantillas que sirve el comodín `/:lang/:page` (`/es/index`, `/es/galeria`…): responden con la cabecera `X-Robots-Tag: noindex`.
- Las fichas con «Texto pendiente»: salen del sitemap y llevan `noindex` hasta tener su texto.

## Al publicar

1. Desplegar y comprobar `https://soccerid.co/robots.txt` y `https://soccerid.co/sitemap.xml`.
2. Dar de alta la propiedad `soccerid.co` en Google Search Console (verificación por DNS) y enviar el sitemap.
3. Lo mismo en Bing Webmaster Tools (puede importar la propiedad desde Search Console).

## Pendiente de decidir

- `/es/socceridcup` (la página anterior de la copa, con la galería) sigue indexable pero fuera del sitemap: su contenido ya vive en Tour. Lo enlazan las propuestas. Opciones: redirigirla con 301 a `/es/tour` o marcarla `noindex`.
- El inglés de Travel y Legends sigue sin traducción aprobada: las páginas en inglés se indexan con el contenido que tienen hoy.
