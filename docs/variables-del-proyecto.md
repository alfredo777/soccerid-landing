# Catálogo de variables y contratos del proyecto

Nombres que sostienen el sitio. No son "variables" en el sentido de JavaScript:
son **acuerdos entre dos partes** —servidor y navegador, código y Heroku, ruta y
archivo—. Cada uno está escrito en dos lugares distintos, así que cambiar o
cerrar uno de los lados **rompe en silencio**: sin error, sin test rojo, sin
aviso en el despliegue.

> **La regla.** Antes de renombrar, mover o restringir cualquier nombre de este
> documento, busca el consumidor **real**: grep de la **URL o la cadena**, no
> del nombre de la función que la construye. Y abre la página.
>
> De dónde sale la regla: el commit `5a89915` cerró `GET /contents/:filename` a
> sesión de admin porque un grep de `loadJSON` pareció decir que nadie la
> llamaba. Sí la llamaban —`loadAllData()` en `assets/js/main.js:626`—, pero la
> URL se arma con un template literal, así que el grep del nombre no la vio. La
> landing estuvo cuatro días en producción mostrando `hero.tagline` y
> `contact.title` en crudo, sin traducciones, sin bento items y sin eventos.
> Arreglado en `a621398`.

---

## 1. Contenidos públicos — la lista blanca

`index.js` → `CONTENIDOS_PUBLICOS`. Estos seis archivos de `contents/` se sirven
**sin autenticación** por `GET /contents/:filename`, porque el front los necesita
para pintarse. Son exactamente los de `GKraken.dataFiles` en
`assets/js/main.js:25`. **Los dos lados tienen que coincidir.**

| Archivo en `contents/` | Variable en el front | Si falta |
|---|---|---|
| `ui_translations.json` | `GKraken.translations` | se ven las claves en crudo (`hero.tagline`) |
| `bento_items_first.json` | `bentoItemsFirst` | primera rejilla vacía |
| `bento_items_second.json` | `bentoItemsSecond` | segunda rejilla vacía |
| `upcoming_events.json` | `upcomingEvents` | sin próximos eventos |
| `panel_templates.json` | `panelTemplates` | paneles y revistas vacíos |
| `panel_classes.json` | `panelClasses` | cae a `DEFAULT_PANEL_CLASSES` (único con respaldo) |

**Todo lo demás en `contents/` es privado** y responde 404 a quien no sea admin
—404 y no 403, para no confirmar que el archivo existe—: `cup_project_2027`,
`cup_project_2027_b`, `cup_project_2027_codes`, `cup_editions`, `panel_config`,
`gallery_pages`, `instagram_gallery` y el listado `GET /api/contents`. Ahí viven
las propuestas de inversión, que están detrás del candado de código.

**Si agregas un archivo que el front deba leer, agrégalo a las dos listas.** Si
no es para el front, no lo agregues a ninguna.

## 1b. Colores de marca

El azul y el verde neón del logo (sep 2026). Se escriben en **tres sitios**,
porque son tres superficies que no comparten hoja de estilos:

| Dónde | Tokens | Para qué |
|---|---|---|
| `assets/css/main.css` `:root` | `--brand-blue`, `--brand-blue-deep`, `--brand-lime` (+ `-rgb`) | landing y blog |
| `views/layouts/panel.hbs` `:root` | `--pn-brand`, `--pn-brand-dark`, `--pn-brand-soft`, `--pn-lime` | panel e inversionistas |
| `assets/css/embedvideo.css` | `--embed-video-accent` (lee `--brand-blue` con respaldo) | reproductor de video |

Valores: azul `#1B17EF`, azul profundo `#0D0AA8`, verde neón `#78F750`.
**Si cambias uno, cambia los tres.** Las versiones `-rgb` existen para los
`rgba()` con transparencia: `rgba(var(--brand-blue-rgb), 0.3)`. No dupliques un
color a mano.

**El verde neón es para highlights, no para superficies.** Hoy vive en dos
sitios elegidos: los días que faltan en la tarjeta negra del panel y la barra
de avance del proyecto — donde el azul sobre fondo oscuro casi no se veía.

**Tres trampas, por si toca repintar otra vez:**

1. **El color también es un dato.** `news.tag_color`, `events.color`,
   `tiers.color`/`bg`, `match_agenda.color` y `portfolio_events.accent` están
   guardados en filas. Cambiar el default de la columna solo afecta a las
   nuevas. Para las viejas está `recolorMarca()` en `db/schema.js`, idempotente
   y solo sobre valores que coincidan exactamente con el color anterior, para
   no pisar lo que el admin haya elegido a mano.
2. **No todo hex morado es nuestro.** El degradado de Instagram
   (`#F58529 → #515BD4`) se excluye a propósito.
3. **`var()` no sirve en todas partes.** Los literales que viven en
   `<input type="color" value="…">`, en atributos de presentación SVG
   (`fill="…"`) o dentro de cadenas de JavaScript tienen que seguir siendo hex.
   Ahí se cambia el valor, no se mete una variable.

Para revisar el resultado: `node scripts/capturas.js http://localhost:3000`
saca 11 capturas de landing y panel (escritorio y móvil, entrando con las
cuentas demo) en `capturas/`, que está gitignored.

## 1b-bis. El fondo del sitio

Un solo degradado para todas las páginas oscuras:

```css
linear-gradient(135deg, #16181B 0%, #1F2226 50%, #2A2E33 100%)
```

En `assets/css/main.css` son `--bg-dark-1/2/3`; la familia de páginas de la
copa (`socceridcup`, la ficha de edición, la galería y el layout `promo.hbs`)
lo repite a mano porque no carga esa hoja.

Hasta el 29 sep 2026 esa familia usaba una paleta propia —`#0A0A1A` de base y
`#0E0E28` para las secciones alternas, y el degradado terminaba donde
empezaba—, así que era más negra y más plana que la landing y se notaba el
salto al navegar entre ellas. Se unificaron.

Ese mismo día el fondo pasó del azul casi negro (`#0F0F1A · #1A1A2E · #16213E`)
al acero azulado y de ahí al **gris frío** de ahora, porque la página se veía
plana y sin cuerpo.

**El gris neutro hace que el azul de marca mande.** Con fondo azul, el botón
azul competía contra un fondo de su misma familia; sobre gris es el único color
de la página. Si la identidad es el azul, el fondo no debería serlo.
**Ojo: la mitad del problema no era el color, eran las tarjetas.** Estaban a
`rgba(255,255,255,0.04)` y no se despegaban del fondo; subirlas a `0.075` hizo
tanto o más que cambiar el tono. Si algo vuelve a verse plano, mira las
superficies antes que el fondo.

**Los velos sobre fotografía son el tercer sitio.** Hay 28 capas de
`rgba(...)` —el degradado que oscurece el hero, los scrims de las galerías,
sombras— escritas con el color del fondo **de su momento**. No son variables,
así que no siguen al token: tras dos cambios de fondo seguían tiñendo las fotos
del azul viejo. Búscalas por su forma decimal, no por hex:
`rgba(15, 15, 26, …)` era `#0F0F1A`. Hoy todas van en `rgba(22, 24, 27, …)`.

**Si cambias el fondo, cambia los tres sitios** —tokens, familia cup y velos—
y vuelve a pasar `scripts/contraste.js`: aclarar el fondo baja el contraste del texto claro. Al
unificarlo, las etiquetas en `#9896F8` cayeron de 6.83 a 6.54 y hubo que
subirlas al acento claro `#B4B3FA`, que es el mismo del año en los hero.

### Nada de texto con degradado

El sitio llegó a tener **13 textos con `background-clip: text`** —titulares,
el wordmark, los números grandes de la copa—. Se quitaron todos el 29 sep 2026:
se veían sucios, sobre todo los de degradado azul saturado, y encima **no se
pueden medir**: `scripts/contraste.js` los salta porque no tienen un color
sólido que comparar.

Ahora: **titulares y cifras en blanco**, y el azul claro (`--brand-blue-on-dark`)
reservado para las etiquetas pequeñas y el año de los hero. Un toque de color,
no un efecto.

## 1c. Contraste: la regla que evita los choques gráficos

El 29 sep 2026 aparecieron en producción varios textos ilegibles a la vez:
"EDICIONES" y los años del timeline, el `@usuario` de los testimonios, el
`soccerid.co` del pie. **No eran incidencias sueltas: eran el mismo error.**

> **La regla, en una línea: el azul de marca es un color de SUPERFICIE, nunca
> de texto sobre fondo oscuro.**
>
> `#1B17EF` sobre el fondo de la landing da **1.45** de contraste. El mínimo de
> WCAG AA es 4.5 (3.0 para texto grande: ≥24px, o ≥18.7px en negrita). Sobre el
> fondo claro del panel sí se lee (8.69) y ahí se usa tal cual — por eso la
> regla habla de *fondo oscuro*, no del color a secas.

### La escala de texto sobre oscuro

Cuatro valores en el `:root` de `assets/css/main.css`, calculados contra el
**peor** de los fondos oscuros del sitio (`#0A0A1A` … `#313148`), así que
cumplen en todos. **No inventes grises ni azules nuevos para texto.**

| Token | Valor | Contraste | Para qué |
|---|---|---|---|
| `--texto-alto` | `#FFFFFF` | 12.6 | titulares y texto principal |
| `--texto-medio` | `#C0C1CE` | 7.1 | cuerpo secundario |
| `--texto-bajo` | `#999BB2` | 4.6 | metadatos, el mínimo |
| `--brand-blue-on-dark` | `#B1C5FB` | 8.3 | acentos en azul (matiz 224°, no morado) |

**Blanco translúcido: nunca por debajo de `0.75` de alfa para texto chico.**
`rgba(255,255,255,0.3)` da 2.6 y `0.6` se queda en 4.8 sobre los azules
saturados. Fue la causa de la mayoría de los fallos, las dos veces.

**Color de marca ajeno (WhatsApp, Instagram): no se repinta.** El degradado de
Instagram se deja intacto, y el botón de WhatsApp va en su verde brillante con
texto e icono blancos, que es como lo pinta la propia WhatsApp.

Ese par da **1.98** de contraste, por debajo del mínimo. Es una **excepción
asumida**, no un descuido: aquí pesa más el reconocimiento inmediato de la
marca que el número. Está declarada en `EXCEPCIONES` dentro de
`scripts/contraste.js`, así que la auditoría **la lista aparte con su motivo**
en vez de esconderla o de cantarla como fallo.

Probé antes la alternativa —verde brillante con texto oscuro, que sube a
8.00— y se descartó: el botón dejaba de leerse como el de WhatsApp. Si en el
futuro aparece otra excepción de este tipo, el sitio para declararla es esa
lista, nunca bajar el umbral global.

### El estándar de la casa: más contraste cuanto más chico el texto

WCAG AA (4.5 / 3.0) es el **suelo legal, no un objetivo de diseño**. El 29 sep
apareció un texto que pasaba el 4.5 y aun así se leía mal: la descripción de
las tarjetas del panel de medios, 12.8px en blanco al 60% sobre un azul
saturado. Medía 4.8 y era incómodo.

Perseguir 7.0 en *todo* tampoco sirve: deja la interfaz lavada en grises
pálidos y mata la jerarquía. El criterio que sí funciona es escalar la
exigencia con el tamaño, porque es donde está la molestia real:

| Tamaño | Mínimo |
|---|---|
| menos de 16px | **7.0** |
| 16px o más | **4.5** |

Con `--aa` se mide contra el mínimo legal en vez del estándar de la casa.

Los tokens históricos `--text-secondary`, `--text-muted` y `--text-subtle`
estaban en 0.8 / 0.6 / 0.5 de alfa y alimentaban decenas de reglas por debajo
del mínimo. Subirlos a **0.88 / 0.78 / 0.72** arregló la mayoría de golpe: es
más barato y más seguro que perseguir regla por regla.

### La herramienta

```bash
node scripts/contraste.js http://localhost:3000     # o https://soccerid.co
node scripts/contraste.js http://localhost:3000 --imagenes
node scripts/contraste.js http://localhost:3000 --aa
```

Abre Chrome headless, recorre **cada nodo de texto visible** de las páginas
principales, calcula el fondo efectivo (apilando capas translúcidas y midiendo
los degradados parada a parada) y reporta lo que no llega al mínimo. Sale con
código 1 si hay fallos, así que se puede enganchar antes de desplegar.

También **abre los ocho paneles bento** uno a uno: viven ocultos hasta que se
tocan, y ahí es justo donde aparecieron dos de los choques.

**Espera a que el DOM se calme, no un tiempo fijo.** La primera versión esperaba
900ms tras abrir cada panel; el de medios pinta sus tarjetas de forma asíncrona,
así que se auditaba un panel vacío y el informe decía "sin fallos" mintiendo. Si
alguna vez este script dice que todo está bien y tú ves un problema, **el script
está mal**: hay que arreglarlo antes de arreglar el color.

Lo que **no** puede medir: texto sobre fotografía, porque no hay un color de
fondo. Esos se listan aparte con `--imagenes` y hay que mirarlos a ojo; si uno
queda dudoso, la solución es un velo oscuro detrás del texto, no aclarar la
tipografía.

## 2. Contrato servidor → navegador

`views/layouts/main.hbs:97` inyecta `window.__GKRAKEN_CONFIG__`, y
`assets/js/main.js:22` lo funde sobre `GKraken.config`. Las claves se escriben
literalmente en los dos archivos:

`lang`, `supportedLangs`, `baseUrl`, `currentPath`, `version`.

Además, `<body data-lang="{{lang}}">` es el **segundo** origen del idioma en
`getSavedLanguage()` (orden: config del servidor → `data-lang` → localStorage →
navegador → `es`).

Variables que el servidor pasa a las vistas (`res.locals` / `app.locals`):
`baseUrl`, `isAuthenticated`, `isProduction`, `turnstileSiteKey`, `username`,
`version`, `year`.

Idiomas soportados: `es`, `en` (default `es`). Están declarados **dos veces** —
`index.js:39` y `assets/js/main.js:19`—; si agregas uno, los dos.

## 3. Endpoints que consume el navegador

Cerrarlos o renombrarlos rompe la página sin error visible en el servidor:

- `GET /contents/:filename` — los seis de la sección 1.
- `GET /api/info` — versión e idiomas.
- `POST /api/project2027/verify` — candado de código de la propuesta.
- `GET /api/propuesta/:variantId/contenido?lang=` — contenido de la propuesta.
- `/panel/onboarded`, `/panel/admin/upload`, `/panel/admin/upload-doc`,
  `/panel/admin/ai`, `/panel/admin/ai/aplicado`, `/panel/admin/faq/reorder`,
  `/panel/admin/link-preview`, `/panel/admin/link-preview/importar` — panel y admin.

## 4. Claves de almacenamiento del navegador

Cambiarlas no rompe nada, pero **deja fuera a quien ya tiene la clave vieja**
(vuelve a ver el idioma por defecto, el tour de bienvenida, etc.):

- `localStorage['gkraken_lang']` — idioma elegido (`LANG_STORAGE_KEY`).
- cookie `lang` — el mismo idioma, para que el servidor lo lea.
- `localStorage['adminScrollY']`, `localStorage['pnRail']` — estado de UI del panel.

## 5. Variables de entorno

Solo las que **el código lee de verdad**. Las de `node_modules` no cuentan.

### Críticas en producción

| Variable | Qué pasa si falta |
|---|---|
| `DATABASE_URL` | cae a SQLite efímero: **se pierden los datos al reiniciar el dyno** |
| `PANEL_JWT_SECRET` | cae al literal `'panel-dev-secret-change-me'`, que está en el repo **público**: cualquiera se firma una sesión de admin |
| `NODE_ENV=production` | modo desarrollo en producción |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | no se siembra el admin |
| `NPM_CONFIG_OMIT=optional` | el build compila `better-sqlite3` y **excede los 10 min** de Heroku |

`PANEL_JWT_SECRET` lo leen tres archivos con el mismo respaldo peligroso:
`lib/panelAuth.js:10`, `lib/ical.js:15`, `lib/propuestas.js:28`. Es además el
secreto que firma los feeds iCal: cambiarlo cierra las sesiones abiertas y
obliga a resuscribir los calendarios.

### Con respaldo sensato (opcionales)

`BASE_URL` (cae a `https://soccerid.co` en prod), `PORT` (3000),
`SMTP_PORT` (587), `SMTP_FROM` (`"SOCCER iD" <socceridco@soccerid.co>`),
`SESSION_SECRET`, `DATABASE_SSL`, `NOTIFY_EMAILS`, `S3_PUBLIC_BASE`,
`GOOGLE_HD`, `GOOGLE_CALLBACK_URL`, `GOOGLE_CALENDAR_CALLBACK_URL`,
`DEMO_PASSWORD`, `SEED_DEMO`, `HEROKU_APP`, `CHROME_PATH`.

### Interruptores (su ausencia apaga una función, no rompe nada)

- `TURNSTILE_SITE_KEY` + `TURNSTILE_SECRET_KEY` — sin ellas **no hay CAPTCHA** en
  el login. Es el modo de pruebas en producción, a propósito
  (`scripts/heroku-env.js --turnstile-off` para quitarlas, `--apply` para reponerlas).
- `GOOGLE_LOGIN` — `0` oculta el login de Google (default apagado).
- `GOOGLE_CALENDAR` — `0` apaga Google Calendar (default apagado; el scope exige
  verificación de marca).
- `ANTHROPIC_API_KEY` — sin ella, el asistente de IA del admin no responde.
- `AWS_*` / `S3_BUCKET` — sin ellas no hay subida de archivos.
- `TWILIO_*`, `RUNWAY_API_KEY` — funciones sueltas.

### Cómo se ponen

`node scripts/heroku-env.js` (simulacro) y `--apply`. Lee los `*.local.md`
gitignored y nunca imprime valores, solo nombres. **Si agregas una variable que
venga de un `*.local.md`, ponla en su `WANTED`.**

## 6. Antes de desplegar algo que toque esta lista

```bash
# los seis públicos deben dar 200
for f in ui_translations bento_items_first bento_items_second \
         upcoming_events panel_templates panel_classes; do
  printf "%-22s %s\n" "$f" "$(curl -s -o /dev/null -w '%{http_code}' https://soccerid.co/contents/$f.json)"
done

# los privados deben dar 404
for f in cup_project_2027 cup_project_2027_b cup_project_2027_codes panel_config; do
  printf "%-24s %s\n" "$f" "$(curl -s -o /dev/null -w '%{http_code}' https://soccerid.co/contents/$f.json)"
done
curl -s -o /dev/null -w "/api/contents %{http_code}\n" https://soccerid.co/api/contents
```

Y **abre `https://soccerid.co/es` en el navegador.** Si ves un texto con punto en
medio y sin espacios (`contact.title`, `footer.followUs`), el front se quedó sin
`ui_translations`.

---

## Pendientes que deja este catálogo

1. `GOOGLE_API_KEY` está puesta en Heroku y listada en `scripts/heroku-env.js`,
   pero **ningún archivo del proyecto la lee**. O sobra, o falta cablearla.
2. Los tres respaldos a `'panel-dev-secret-change-me'` siguen ahí. En producción
   convendría que la app **reviente al arrancar** en vez de caer al literal en
   silencio.
3. El repo de GitHub sigue **público** (decisión tomada, anotada a propósito).
4. La lista blanca de la sección 1 y `GKraken.dataFiles` se mantienen a mano en
   dos archivos. Un test que compare ambas evitaría que vuelvan a separarse.
