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
- **El itinerario de los viajes se editará desde el admin**, no en un JSON;
  queda pendiente junto con el resto de Travel.
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
| 02 Tour: asistencia 2023 (18,000 en el documento, 15,000 en la base) | **Pendiente de dato** | Se cambia en el admin del Tour › Ediciones anteriores |
| 01 Inicio: descripciones de las seis tarjetas | Hecho | campo `lema` de `seccionesV2` en `index.js` |
| 04–05 Travel: portada, experiencias, aclaración, contacto, cierre personalizado | Hecho | `views/v2/travel.hbs` |
| 04 Travel: cuatro viajes próximos | Hecho | `contents/viajes.json` (sólo `es`); `upcoming_events.json` no se toca porque lo usan otras páginas |
| 06 Ficha de viaje (sin itinerario) | Hecho | `/es/viaje/:slug`, `views/v2/viaje.hbs` |
| 06 Ficha de viaje: dónde va «Solicitar cotización» | **Por confirmar** | puesto provisionalmente en la portada de la ficha |
| 06–07 Itinerario por días, editable | Pendiente | admin; el del documento es dummy y no se publica |
| 05 Viajes pasados: tres tarjetas aprobadas | Hecho, fotos de muestra | `contents/viajes.json`, pastilla «Foto de muestra» |
| 05, 08 Viajes pasados: «Ver todos los viajes», listado y fichas | Pendiente | modelo aprobado: Champions 2025 |
| 09–10 Legends: portada, qué es, próximos eventos, eventos pasados, contacto, cierre | Hecho | `views/v2/legends.hbs`, `contents/legends.json`; fotos de los pasados, de muestra |
| 11 Fichas de eventos pasados de Legends | Pendiente | modelo aprobado: Luis Figo |
| 12–13 Podcast: descripción, botones, cifras, formatos, cierre | Hecho | `views/v2/podcast.hbs`, cifras en la ruta de `index.js` |
| 12 Podcast: carrusel de invitados | Pendiente | faltan fotos y el episodio de cada invitado |
| 13 Podcast: periodo de las cifras (7 M, 84.8 mil h, +35.3 mil) | **Por confirmar** | no se rotulan como históricas ni anuales |
| 14 Media: portada, títulos y cierre de prensa | Hecho | `views/v2/opiniones.hbs` |
| 15–16 Nosotros: portada, quiénes somos, qué hacemos, premios reales, sedes, cierre | Hecho | `views/v2/nosotros.hbs`, `contents/premios.json` |
| 17 Nosotros: marcas con las que hemos colaborado | Pendiente | faltan los archivos de los 35 logos |

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
