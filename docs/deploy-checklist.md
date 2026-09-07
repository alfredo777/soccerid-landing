# Qué hacer cuando se despliegue

Nada de esto está en producción todavía. Al 7 sep 2026 hay **14 commits** en
`origin/main` que `production` (Heroku) no tiene: desde `bb1bffc` hasta `b3bfcb8`.
`origin/main` está al día; solo falta `production`.

Los últimos cuatro (edición activa, unificación de ediciones y la puesta al día del
backlog) son los más delicados de este lote: tocan el modelo de datos de las ediciones.
Ver la sección 2b.

| Commit | Qué trae |
|---|---|
| `bb1bffc` | Buscador funcional, estado vacío en noticias, chips de categoría, cronograma sin duplicar |
| `abcf068` | Esta checklist |
| `65dab31` | Interruptor `GOOGLE_LOGIN` + `scripts/heroku-env.js` |
| `0ea3d79` | Donut fuera del inversionista, URL de la nota original, preview por modalidad |
| `ca37dae` | **Mi perfil** del inversionista (issue 15) |
| `08c0aeb` | **Notificaciones**: tipos, directas 1 a 1, canales, Twilio desde el admin (issue 13) |
| `7f99ee5` | Las llaves de Twilio son el interruptor del SMS |
| `9fafed6` | **Mapa de códigos 2027** + dueño asignado (issue 16) + arreglo del escapado de JSON |
| `8ae5809` | **Alta de ediciones** con filas repetibles, uploader y vista previa (issue 17) |
| `0d480b6` | **Página de gestión por edición** (issue 21) |
| `50ff3fe` | Esta checklist, puesta al día |
| `b2a0d8e` | **Edición activa** elegida por el admin + panorámica de ediciones para el inversionista |
| `7d3cada` | Backlog al día |
| `b3bfcb8` | **Una sola edición por año**: se unifican `editions` y `portfolio_events` |

`bae433b` (multievento + FAQ + fix del calendario) fue el último desplegado.

## 1. Antes de subir

Nada bloquea el deploy. Dos cosas que conviene tener presentes:

- **Google sigue oculto a propósito.** Las credenciales están fuera de Heroku (v245) y
  `GOOGLE_LOGIN=0` está puesta (v246). Tras el deploy el interruptor toma el relevo. No
  hay que tocar nada; detalle en `docs/google-auth.md` §6.
- **Twilio no necesita variables de entorno.** Las llaves se pegan desde el admin después
  del deploy (ver paso 4). No hay que setear nada en Heroku.

## 2. Desplegar

```
git push production main
heroku logs --tail --app soccerid-landing
```

El arranque corre migraciones y seed solos. Ambos son **idempotentes**:

- `db/schema.js` y `db/portfolioSchema.js` crean tablas y columnas con guardas
  `hasTable` / `hasColumn` / `createTableIfNotExists`.
- `db/portfolioSeed.js` corta antes de sembrar si ya hay datos. Los inversionistas demo
  se actualizan por email, no se duplican.

### Columnas nuevas que va a crear este deploy

Todas son `ALTER TABLE ... ADD COLUMN` con guarda, **ninguna borra ni renombra nada**:

- `users`: `language`, `phone`, `phone_extra`, `email_extra`, `assistant_email`,
  `assistant_phone`, `notify_email` (default `true`), `notify_sms` (default `false`).
- `notifications`: `type` (default `comunicado`), `user_id`, `event_id`, `channels`
  (default `in-app`), `sent_email`, `sent_sms`.
- `access_codes`: `assignee_name`, `assignee_email`, `assignee_phone`, `tags`,
  `assigned_at`.
- `access_log`: `matched_owner`.
- `portfolio_events`: `status`, `data_es`, `data_en` (contenido público, antes en la tabla
  `editions`).

Además corre **un UPDATE de una sola vez** sobre `notifications`: las filas anteriores a
esta migración se marcan como `comunicado`. Es seguro repetirlo — una notificación
`directa` sin destinatario no existe, así que la condición no vuelve a hacer match.

## 2b. La migración que más hay que vigilar: la unificación de ediciones

Este deploy junta `editions` y `portfolio_events` en una sola edición por año.
La migración **copia** el contenido público a `portfolio_events` y **no borra** la tabla
vieja, así que los datos originales siguen ahí si algo sale raro. Al arrancar, el log debe
mostrar la línea `✓ Edición 2026 traída de la tabla vieja al portafolio` (o nada, si ya
estaba). Verificar en producción, en este orden:

- [ ] `/es/socceridcup` muestra el timeline con **todos los años** (2023 a 2027) y 2026
  marcado como pausa.
- [ ] `/es/socceridcup/2025` y `/en/socceridcup/2025` cargan con su contenido real
  (partido, sede, estadísticas, galería y notas de prensa).
- [ ] En el admin hay **una sola pestaña "Ediciones"**, con las 5, ordenadas por año.
- [ ] Abrir una edición: el drawer trae identidad, contenido público con sus filas
  cargadas (no vacías), presentación y parámetros de inversión.
- [ ] Guardar sin cambiar nada y volver a abrir: nada se perdió.

Si la parte pública se viera vacía, es que la copia no encontró los años; los datos siguen
en `editions` y se puede volver a correr el arranque.

## 3. Verificar después (entrando como inversionista, no como admin)

Lo primero, porque es lo único que no se pudo probar en local con la infraestructura real:

- [ ] **Subir una imagen desde Ediciones** (admin → Ediciones → Editar → botón "Subir" del
  banner o de la galería). La URL debe quedar en
  `soccerid-landing.s3.us-east-1.amazonaws.com` y **sobrevivir a un reinicio del dyno**.
  Es el **primer uso real de S3**: en local guarda en disco, en Heroku el disco se borra.
  Si la imagen desaparece al reiniciar, S3 no está tomando las credenciales.

Después, lo demás:

- [ ] `/panel` carga y el contador del sidebar marca los días correctos.
- [ ] `/panel/noticias` muestra las noticias y los chips filtran. Si sale "Aún no hay
  noticias publicadas", **es que la BD de producción no tiene noticias**, no un bug.
- [ ] El buscador de la barra superior: "inversion" devuelve resultados del FAQ primero.
- [ ] "Cronograma" en el sidebar baja al bloque del cronograma, no repite el calendario.
- [ ] El calendario abre en el mes actual y las flechas navegan.
- [ ] `/panel/faq` carga el acordeón.
- [ ] **El login NO muestra nada de Google.**
- [ ] Las ediciones aparecen y cada una muestra su presentación.
- [ ] **Mi perfil**: el chip de usuario arriba a la derecha abre el drawer, guarda
  teléfono y preferencias, y el cambio de contraseña funciona. **El drawer no debe
  aparecer para el admin.**
- [ ] **Notificaciones**: mandar una de prueba a un segmento y otra directa a una persona.
  La directa **solo** la ve esa persona.
- [ ] **Ediciones**: abrir el drawer de una edición existente y confirmar que las filas
  (estadísticas, imágenes, notas) salen cargadas y no vacías. Es lo que más se toca en
  este deploy: si algo salió mal en la conversión, se ve ahí.
- [ ] **Gestión por edición**: admin → Ediciones → "Gestionar". Que el Resumen muestre
  capital y presupuesto reales, y que se pueda agregar un avance.
- [ ] **Edición activa**: cambiarla desde Ediciones y confirmar que el panel del
  inversionista pasa a mostrar esa edición, y que `/panel/ediciones` lista las demás.

## 4. Configurar Twilio (después del deploy, desde el admin)

El canal SMS queda listo pero apagado hasta que existan las llaves.

1. Abrir una cuenta en Twilio y **comprar un número** (o crear un Messaging Service).
2. En el panel: **Administración → Configuración → SMS (Twilio)**.
3. Pegar **Account SID** (`AC…`), **Auth Token** y el **remitente** (`+52…` o `MG…`).
4. Guardar. Con las tres llaves puestas el canal **se activa solo**; no hay otro
   interruptor. La tarjeta debe pasar a "Activo".
5. Usar el botón **Enviar SMS de prueba** con un número propio. Twilio lo cobra como
   cualquier mensaje.

El token se guarda en la base y ya no se vuelve a mostrar completo. Para apagar el SMS se
borran las credenciales con el botón de la misma tarjeta.

## 5. Pendiente del lado del usuario (no bloquea)

- [ ] **Publicar la pantalla de consentimiento de Google** (sigue en *Testing*). Hasta
  entonces el login de Google se queda oculto.
- [ ] **Restringir `GOOGLE_API_KEY`** en Google Cloud Console (por API y por
  referrer/IP). Hoy está sin restringir.

## Notas

- `@aws-sdk/client-s3` es dependencia normal, no opcional, así que
  `NPM_CONFIG_OMIT=optional` no la omite. La única opcional es `better-sqlite3`, que solo
  se usa en local.
- Las variables de Heroku se pueden reponer con `node scripts/heroku-env.js --apply` (lee
  los `*.local.md` gitignored; nunca imprime valores). Sube Google **oculto** salvo que se
  pase `--google-on`.
- El callback de Google se deriva de `BASE_URL`, que no está seteada en Heroku; en
  producción cae en `https://soccerid.co/panel/auth/google/callback`, que coincide con el
  dominio del app.
- Este deploy incluye el arreglo del escapado de JSON dentro de `<script>`
  (`{{{json}}}` → `{{{jsonScript}}}`). Cerraba una vía de ejecución de scripts en la
  sesión del admin a través de los nombres y correos que cualquiera escribe en la página
  pública de la propuesta 2027. **Es la razón de más peso para no dejar el deploy
  parado indefinidamente.**

## Si algo sale mal

```
heroku releases --app soccerid-landing
heroku releases:rollback vNNN --app soccerid-landing
```

El rollback revierte el código, **no** las columnas creadas por las migraciones. Como las
columnas nuevas solo las lee el código nuevo, dejarlas ahí no rompe la versión anterior.
La única con valor por defecto que la versión vieja podría leer es `notifications.type`, y
la versión vieja ni la consulta.
