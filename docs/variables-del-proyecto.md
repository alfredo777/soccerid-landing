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
