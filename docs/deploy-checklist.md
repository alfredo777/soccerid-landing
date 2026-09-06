# Checklist del deploy pendiente

Preparado el 6 sep 2026. Falta desplegar **2 commits** a Heroku:

| Commit | Qué trae |
|---|---|
| `bae433b` | Multievento = ediciones (2023/24/25/27), paquetes generales y privados, presentación ES/EN, FAQ editable, fix del calendario |
| `bb1bffc` | Buscador funcional, estado vacío en noticias, chips de categoría, cronograma sin duplicar |

`origin/main` ya está al día; solo falta `production`.

## Antes de desplegar

Nada pendiente. El tema de Google ya se resolvió el 6 sep: **queda oculto a
propósito** (credenciales quitadas de Heroku + `GOOGLE_LOGIN=0`). No hay que
tocar nada antes de subir; ver sección 6 de `docs/google-auth.md`.

## Desplegar

```
git push production main
heroku logs --tail --app soccerid-landing
```

El arranque corre solo las migraciones y el seed. Ambos son **idempotentes**, ya
verificado:

- `db/portfolioSchema.js` y `db/schema.js` crean tablas con guardas `hasTable` /
  `createTableIfNotExists` (14 y 25 usos) → no truena si ya existen.
- `db/portfolioSeed.js` corta antes de sembrar si ya hay datos
  (`if (await knex('portfolio_events').first()) return`, igual para `faqs`).
  Los inversionistas demo se actualizan por email, no se duplican.

## Verificar después (como inversionista, no como admin)

- [ ] `/panel` carga y el contador del sidebar marca los días correctos.
- [ ] `/panel/noticias` muestra las noticias. Si sale el mensaje "Aún no hay
  noticias publicadas", **es que la BD de producción no tiene noticias** —
  distinto del bug anterior, donde la página quedaba en blanco sin explicación.
- [ ] Los chips (Anuncio / Actualización / Prensa) filtran las tarjetas.
- [ ] El buscador de la barra superior: escribir "inversion" debe devolver
  resultados del FAQ primero.
- [ ] "Cronograma" en el sidebar baja al bloque del cronograma, no repite la
  vista del calendario.
- [ ] El calendario abre en el mes actual y las flechas navegan.
- [ ] `/panel/faq` carga el acordeón.
- [ ] **El login NO muestra nada de Google.** Tras el deploy el interruptor
  `GOOGLE_LOGIN=0` toma el relevo de las credenciales quitadas; confirmar que
  sigue sin aparecer el botón.
- [ ] Las 4 ediciones aparecen y cada una muestra su presentación.
- [ ] **Subir una imagen desde el admin** (noticia o edición): con S3 ya
  configurado, la URL debe quedar en `soccerid-landing.s3.us-east-1.amazonaws.com`
  y sobrevivir a un reinicio del dyno. Es lo primero que se prueba, porque este
  es el primer deploy con S3 activo.

## Notas

- `@aws-sdk/client-s3` es dependencia normal (no opcional), así que
  `NPM_CONFIG_OMIT=optional` no la omite. La única opcional es `better-sqlite3`,
  que solo se usa en local.
- Las variables de Heroku se pueden reponer solas con
  `node scripts/heroku-env.js --apply` (lee los `*.local.md` gitignored; nunca
  imprime valores). Sube Google **oculto** salvo que se pase `--google-on`.
- El callback de Google se deriva de `BASE_URL`, que no está seteada en Heroku;
  en producción cae por defecto en `https://soccerid.co/panel/auth/google/callback`,
  que coincide con el dominio del app.

## Si algo sale mal

```
heroku releases --app soccerid-landing
heroku releases:rollback vNNN --app soccerid-landing
```

El rollback revierte el código, **no** las tablas creadas por las migraciones.
Como las tablas nuevas solo las lee el código nuevo, dejarlas ahí no rompe la
versión anterior.
