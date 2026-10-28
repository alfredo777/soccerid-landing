# Textos y cambios del sitio web (27/10/2026)

Implementación del documento «SOCCER iD · Textos y cambios del sitio web ·
Guía de implementación para el programador», revisado con León. Rama
`claude/nueva-distribucion-web`. Solo aprueba **español**; el inglés queda
con los textos que ya tenía el sitio hasta que llegue la traducción.

## Decisiones tomadas con el dueño

- **Todo lo de Tour se edita desde el admin**, en Panel › Sitio web › Tour.
- **Travel, Legends, Podcast, Media y Nosotros NO son editables por ahora**
  (27/10/2026): sus textos van en el código y en el admin aparecen en
  «Sitio web» como «Pendiente».
- **El itinerario de los viajes se edita desde el admin** (Panel › Sitio
  web › Itinerarios), aunque el resto de Travel siga en el código.
- **Marcas colaboradoras de Nosotros: pendientes** hasta tener los logos.
- **Inglés sin tocar**: el documento no aprueba traducciones, así que en `/en`
  sigue el contenido anterior (salvo contacto global y equipos del Tour).
- Los nombres de los equipos del Tour '27 **no se leen del registro de
  propuestas**: se escriben a mano en el admin («Equipos por anunciar»
  hasta el anuncio autorizado).

## Estado por apartado

| Apartado | Estado | Dónde |
|---|---|---|
| Contacto global (`hola@soccerid.co`, `+1 231 515 8991`) | Hecho | `CONTACTO` en `index.js`; las vistas usan `{{@root.contacto.*}}` |
| Tour: no publicar «Cruz Azul vs. Pumas» | Hecho | `index.js`, ruta `/:lang/tour` |
| 02–03 Tour: todos los textos, cifras, partidos, filas 2026/2027, cierre | Hecho, editable | `lib/sitioTour.js` (valores por defecto) y `/panel/admin/sitio/tour` |
| 02 Tour: asistencia 2023 = 18,000 | Hecho | ajuste de una sola vez en `db/portfolioSchema.js` (`ajusteAsistencia2023`), y `cup_editions.json` de respaldo. La suma de las tres ediciones (61,000) contra el «80K+» sigue por conciliar |
| 01 Inicio: descripciones de las seis tarjetas | Hecho | campo `lema` de `seccionesV2` en `index.js` |
| 04–05 Travel: portada, experiencias, aclaración, contacto, cierre personalizado | Hecho | `views/v2/travel.hbs` |
| 04 Travel: cuatro viajes próximos | Hecho | `contents/viajes.json` (sólo `es`); `upcoming_events.json` no se toca porque lo usan otras páginas |
| 06 Ficha de viaje (sin itinerario) | Hecho | `/es/viaje/:slug`, `views/v2/viaje.hbs` |
| 06 Ficha de viaje: dónde va «Solicitar cotización» | **Por confirmar** | puesto provisionalmente en la portada de la ficha |
| 06–07 Itinerario por días, editable | Hecho | `lib/itinerarios.js`, `/panel/admin/sitio/itinerarios`. Tres estados: oculto, ejemplo (con la pastilla «Itinerario de ejemplo») y publicado. Los cuatro viajes arrancan como ejemplo con el itinerario del documento; el del Tour literal, los demás con «Día 1, 2, 3» en lugar de las fechas de marzo |
| 05 Viajes pasados: tres tarjetas aprobadas | Hecho, fotos de muestra | `contents/viajes.json`, pastilla «Foto de muestra» |
| 05 «Ver todos los viajes» y archivo | Hecho | `/es/travel/viajes-pasados`, `views/v2/archivo.hbs` |
| 08 Ficha de viaje pasado | Hecho: Champions 2025 | `/es/travel/viajes-pasados/:slug`, `views/v2/pasado.hbs`. Libertadores 2024 y Mundial de Clubes 2025 esperan su contenido: su tarjeta no enlaza |
| 09–10 Legends: portada, qué es, próximos eventos, eventos pasados, contacto, cierre | Hecho | `views/v2/legends.hbs`, `contents/legends.json`; fotos de los pasados, de muestra |
| 11 Ficha de evento pasado de Legends | Hecho: Luis Figo | `/es/legends/eventos/:slug`, la misma plantilla. Roberto Carlos y Borja esperan sus textos |
| 12–13 Podcast: descripción, botones, cifras, formatos, cierre | Hecho | `views/v2/podcast.hbs`, cifras en la ruta de `index.js` |
| 12 Podcast: carrusel de invitados | Hecho | `contents/podcast.json` (`invitados`); cada uno unido a su episodio por el título publicado; foto = miniatura del episodio hasta tener la suya |
| 12 Podcast: Pepe Navarro | **Por confirmar** | el episodio #33 es de «Memo Navarro»; su tarjeta va sin botón hasta confirmar que es la misma persona |
| 13 Podcast: periodo de las cifras (7 M, 84.8 mil h, +35.3 mil) | **Por confirmar** | no se rotulan como históricas ni anuales |
| 14 Media: portada, títulos y cierre de prensa | Hecho | `views/v2/opiniones.hbs` |
| 15–16 Nosotros: portada, quiénes somos, qué hacemos, premios reales, sedes, cierre | Hecho | `views/v2/nosotros.hbs`, `contents/premios.json` |
| 17 Nosotros: marcas con las que hemos colaborado | Hecho, en marquesina | 36 logos de la entrega del 28/10; 33 son recreaciones con IA **por cotejar** contra los originales |
| Fotos de viajes y Legends | Hecho | entrega de diseño del 28/10 |
| **Texto de las fichas de Libertadores 2024, Mundial de Clubes 2025, Roberto Carlos y Enrique Borja** | **Pendiente: llevan lorem ipsum** | publicadas para ver el diseño, con la pastilla «Texto pendiente» en la ficha y en su tarjeta, y `noindex` para que los buscadores no las guarden. Al llegar el texto: reemplazar `ficha` y quitar `textoPendiente` en `contents/viajes.json` / `contents/legends.json` |

## Cómo funciona el admin del Tour

- Los textos se guardan en `app_settings`, clave `sitio_tour`, con la forma
  `{ comun, es, en }`. Lo que no se guardó sale de los valores por defecto de
  `lib/sitioTour.js`. Las listas (cifras, partidos, fotos) se reemplazan
  enteras al guardar.
- Fotos y logos (`comun`) son los mismos en los dos idiomas.
- Partido, estadio, ciudad y asistencia de cada edición jugada se guardan en
  su fila de `portfolio_events`, la misma que pinta `/socceridcup/:año`.
- «Volver los textos de este idioma a los de origen» borra lo guardado de ese
  idioma; las fotos no se tocan.
- El editor es genérico: `assets/js/admin-sitio.js` arma el formulario a
  partir del esquema que trae la vista (`views/panel/admin-sitio-tour.hbs`).
  Otra página del sitio se agrega con su propio esquema y su módulo en `lib/`.

## Ojo al desplegar

La base de producción es otra: lo que se edite en local no viaja. Tras
desplegar, la página del Tour sale con los valores por defecto (los textos
aprobados) y la asistencia de cada edición sigue siendo la que tiene la base
de producción hasta que se cambie en el admin.
