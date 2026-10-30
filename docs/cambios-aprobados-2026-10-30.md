# Cambios aprobados · ronda del 30/10/2026

Paquete «SOCCER-iD-Cambios-aprobados» (Indicaciones.txt + Negritas-aprobadas.txt + imágenes). Estado por apartado:

| # | Apartado | Estado |
|---|---|---|
| 1 | Home: iconos blancos, slogan nuevo con Black Italic real | Hecho (`assets/fonts/raleway-900-italic.ttf`) |
| 2 | Headers: velo oscuro, textos blancos, sin migas | Hecho (capa CSS en `.portada__velo`) |
| 3 | Media: orden Central FOX → revista → Esto (Cup 2025); sin pastillas | Hecho (`MEDIA_PRIMERO` en index.js) |
| 4 | Legends: orden Figo, América, Tigres, Roberto Carlos, Borja, Atlético Nacional | Hecho |
| 5 | Podcast: orden de invitados y Memo Navarro | Hecho; su descripción sale de la de su episodio en YouTube |
| 6 | Podcast: Caliente más grande | Hecho (logo recortado a su área visible) |
| 7 | Tour: «Anuncio en Diciembre 2026» | Hecho |
| 8 | Paginación entre ediciones compacta | Hecho |
| 9 | Inglés | Hecho sobre el español consolidado; fichas de viajes y Legends ya existen en inglés. El itinerario no se pinta en inglés (se captura en español) |
| 10 | Itinerarios de próximos viajes | **Pendiente de datos de León** |
| 11 | Imágenes aprobadas de Travel | Hecho (tarjeta y header) |
| 13 | Nosotros: redes y alcance | Hecho |
| 14 | Nosotros: cronología resumida | Hecho (`CRONOLOGIA` en index.js) |
| 15 | Tour: centrado en móvil | Hecho (≤ 720 px) |
| 16 | Prensa: «Ver más notas» sencillo y centrado | Hecho (`assets/js/ver-mas.js`) |
| 17 | Tour: descripción nueva | Hecho |
| 18 | Negritas | Hecho: `**segmento**` en contenido + helper `negritas`; `<strong>` en vistas |
| 19 | Favicon | Hecho (`scripts/favicon.ps1`, partial `favicon.hbs`) |
| 20 | Sin pastilla «Itinerario de ejemplo» | Hecho; se conserva «Fechas, horarios y servicios por confirmar.» |
| 21 | Cifras acumuladas en recuadro | Hecho |
| 22 | Relacionados compactos en fichas | Hecho (partial `relacionado.hbs`); listados principales intactos |
| 23 | «Real Madrid vs Barcelona» sin punto | Hecho |
| 24 | Nuestras sedes | Hecho |
| 25 | Prueba de grises | Lista para revisar: `?prueba=grises` (se recuerda en cookie), `?prueba=normal` la apaga. `assets/css/prueba-grises.css` |

## Pendiente

- Itinerarios reales: por viaje hacen falta fechas por día, hotel, vuelos/traslados, horarios, comidas, accesos y qué es incluido u opcional.
- Revisar la prueba de grises con León antes de hacerla definitiva.
- Negritas de testimonios completos (falta elegir la frase literal).
- La sede de la final de Champions 2027 no se dedujo de la foto del Bernabéu: la ficha no muestra sede.
