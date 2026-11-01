# Segundo paquete de cambios · 31/10/2026

| # | Cambio | Estado |
|---|---|---|
| 01 | Home · Legends: «Encuentros exclusivos con leyendas del fútbol» | Hecho (EN: «Exclusive meet-ups with football legends») |
| 02 | Nosotros · Quiénes somos en dos párrafos con sus negritas | Hecho, con su traducción |
| 03 | Tour · Nuestros eventos | Hecho (default de `lib/sitioTour.js`; si se guardó texto en el admin, manda el admin) |
| 04 | EN · «What’s your dream match to watch live?» | Hecho (cierre de Travel) |
| 05 | EN · botón «Become a sponsor» | Hecho (Podcast) |
| 06 | Vista previa general: título, descripción e imagen | Hecho: `ui_translations.json` (og/twitter) y `og-image.jpg` desde la foto del header de Tour (`scripts/og-general.ps1`, con el logo en la esquina superior derecha) |
| 07 | Podcast · párrafo de «Sé patrocinador» a todo el ancho | Hecho (se quitó el tope de 760 px) |
| 08 | Podcast · 84.8K h y +35.3K en español | Hecho |
| 09 | Responsive iPhone Duo | Revisado en emulación; falta el dispositivo real |
| 10–12 | Títulos de Media (FOX, Publimetro, Diario de México) | Hecho, con su traducción |

## iPhone Duo (cambio 09)

Apple publica resoluciones físicas. Con el factor 3 de los iPhone, el viewport CSS estimado es:

| Configuración | Panel | Viewport CSS estimado | Probado con barras de Safari |
|---|---|---|---|
| Exterior, vertical | 1398 × 2034 | 466 × 678 | 466 × 580 |
| Interior, vertical | 1878 × 2670 | 626 × 890 | 626 × 780 |
| Interior, horizontal | 2670 × 1878 | 890 × 626 | 890 × 520 |

Son estimaciones: hay que medir `innerWidth` × `innerHeight` en el Safari del equipo real y anotarlo aquí.

Se revisaron 14 páginas en las tres medidas (inicio, secciones, fichas, artículo, inglés): ninguna tiene desplazamiento horizontal. Ajustes hechos para estos anchos:

- Inicio: puertas 3 × 2 en horizontal, ícono oculto en tarjetas bajas, encuadre alto de fotos sólo hasta 460 px.
- Rejillas sin tarjetas sueltas entre 561 y 1100 px (cifras, pilares, recuerdos, experiencias).
- Tour: ediciones en tres columnas entre 700 y 900 px.
- Podcast: cifras con tamaño según el ancho de su recuadro.

Pendiente en el equipo real: abrir/cerrar y girar sin recargar, teclado abierto en formularios, zonas seguras.
