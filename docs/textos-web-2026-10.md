# Textos y cambios del sitio web (27/10/2026)

Implementación del documento «SOCCER iD · Textos y cambios del sitio web ·
Guía de implementación para el programador», revisado con León. Rama
`claude/nueva-distribucion-web`. Solo aprueba **español**; el inglés queda
con los textos que ya tenía el sitio hasta que llegue la traducción.

## Decisiones tomadas con el dueño

- **Todo lo de Tour se edita desde el admin**, en Panel › Sitio web › Tour.
- **El itinerario de los viajes se edita desde el admin**, no en un JSON.
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
| 01 Inicio: descripciones de las seis tarjetas | Pendiente | campo `lema` de `seccionesV2` en `index.js` |
| 04–05 Travel: portada, experiencias, contacto, cierre | Pendiente | |
| 04 Travel: cuatro viajes próximos (sustituyen los partidos de Liga MX en Travel) | Pendiente | necesita su propio origen de datos: `upcoming_events.json` lo usan otras páginas |
| 06–07 Ficha de viaje con itinerario editable | Pendiente | admin |
| 05, 08 Viajes pasados: listado y fichas | Pendiente | |
| 09–10 Legends: portada, experiencias, eventos, eventos pasados, contacto, cierre | Pendiente | |
| 11 Fichas de eventos pasados de Legends | Pendiente | |
| 12–13 Podcast: textos, cifras, invitados, cierre | Pendiente | |
| 14 Media: títulos y cierre de prensa | Pendiente | |
| 15–17 Nosotros: textos, pilares, premios, sedes, marcas colaboradoras | Pendiente | faltan los archivos de los 35 logos |

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
