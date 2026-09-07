# Google Auth (inicio de sesión con Google) — configuración e integración

Autenticación de **inversionistas/patrocinadores** con Google, **restringida por
invitación**: el correo que devuelve Google se contrasta contra el correo con el que
el admin invitó (tabla `users`). Solo entran correos previamente invitados.

> El admin sigue con correo + contraseña (o también Google, opcional). Turnstile
> permanece en el login clásico.

---

## 1. Datos a configurar en Google Cloud Console

En **APIs & Services → Credentials → Create credentials → OAuth client ID**,
tipo **Web application**.

### Authorized redirect URIs (CALLBACKS) — pegar exactamente

```
https://soccerid.co/panel/auth/google/callback
https://www.soccerid.co/panel/auth/google/callback
https://soccerid-landing-199fe9d7095c.herokuapp.com/panel/auth/google/callback
http://localhost:3000/panel/auth/google/callback
```

### Authorized JavaScript origins

```
https://soccerid.co
https://www.soccerid.co
https://soccerid-landing-199fe9d7095c.herokuapp.com
http://localhost:3000
```

> Deben coincidir **carácter por carácter** con lo que use la app (sin barra final
> en los origins; el path completo en los redirect URIs). Si cambian dominios o
> puertos, hay que agregarlos aquí.

### OAuth consent screen

- **User type**: External.
- **Scopes**: `openid`, `.../auth/userinfo.email`, `.../auth/userinfo.profile`.
- **Authorized domains**: `soccerid.co` (y `herokuapp.com` si se usa ese dominio).
- **Publishing status**: mientras esté en *Testing*, solo los correos agregados como
  *Test users* pueden entrar. Para producción abierta, **Publish app** (con scopes
  básicos email/profile no requiere verificación de Google).

---

## 2. Variables de entorno

| Variable | Uso |
|---|---|
| `GOOGLE_CLIENT_ID` | Client ID del OAuth client (público) |
| `GOOGLE_CLIENT_SECRET` | Client secret (**privado** — solo env, nunca en el repo) |
| `GOOGLE_CALLBACK_URL` | (opcional) callback absoluto; si se omite se deriva de `BASE_URL` + `/panel/auth/google/callback` |
| `GOOGLE_HD` | (opcional) restringe a un dominio de Google Workspace (`hd`) |

Producción (Heroku):
```
heroku config:set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=... --app soccerid-landing
```
Local: definir en `.env` (ignorado) o en el entorno. Las claves reales se guardan en
un `*.local.md` (gitignored), igual que Turnstile/Runway.

---

## 3. Flujo (restringido por invitación)

1. El admin **invita** al inversionista con su correo (tabla `users`, `status`
   `invited`). No hace falta contraseña para el flujo de Google.
2. En `/panel/login` el usuario elige **"Continuar con Google"** →
   `GET /panel/auth/google` (redirige a Google con `state` anti-CSRF + `scope`).
3. Google regresa a `GET /panel/auth/google/callback?code=...&state=...`.
4. El servidor:
   - valida `state`, intercambia el `code` por tokens y **verifica el `id_token`**
     (firma, `aud` = client_id, `iss`, expiración).
   - exige `email_verified === true`.
   - busca `users` por `email === email de Google` (case-insensitive).
   - **si existe** (rol `investor`/`sponsor`): marca `status='active'`, guarda
     `google_sub`, emite la **misma sesión JWT** actual (`lib/panelAuth`) y redirige a
     `/panel`.
   - **si no existe**: deniega → `/panel/login?error=noinvite` ("Este correo no tiene
     invitación. Usa el correo con el que te invitamos.").
5. Reingresos: se valida por `google_sub` o por email; sin cambios de contraseña.

**Contraste clave**: el correo verificado por Google debe existir en `users` (fue
invitado). Así "se contrasta contra el de la invitación".

---

## 4. Plan de implementación (cómo se integrará)

- **Librería**: `google-auth-library` (oficial) para verificar el `id_token`. El
  flujo de *authorization code* se hace con los endpoints estándar (sin passport,
  para mantener el estilo actual de `lib/panelAuth`).
- **Esquema** (aditivo): `users.google_sub` (string, nullable). `password_hash` ya
  es nullable, así que un inversionista puede existir solo con Google.
- **Rutas nuevas** (en `routes/panel.js`):
  - `GET /panel/auth/google` → arma la URL de consentimiento y redirige.
  - `GET /panel/auth/google/callback` → intercambia el code, verifica, contrasta con
    invitación, emite sesión.
- **Lib nueva**: `lib/googleAuth.js` (build auth URL, exchange code, verify id_token).
- **Login**: botón "Continuar con Google" en `views/panel/login.hbs`.
- **Feature flag**: si `GOOGLE_CLIENT_ID`/`SECRET` no están, el botón no aparece y el
  login clásico sigue igual (sin romper nada).

### Seguridad
- `state` aleatorio en cookie httpOnly para CSRF; validar en el callback.
- Verificar `id_token` con `google-auth-library` (`aud`, `iss`, exp) y `email_verified`.
- Opcional `GOOGLE_HD` para exigir dominio Workspace.
- La sesión sigue siendo el JWT httpOnly actual (30 días); no cambia el resto del panel.

---

## 5. Checklist para dejarlo listo

- [ ] Crear OAuth client (Web) con los redirect URIs y origins de arriba.
- [ ] Configurar consent screen (scopes email/profile, authorized domains).
- [ ] Publicar la app (o agregar test users mientras se prueba).
- [ ] Setear `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` en Heroku y local.
- [ ] Implementar `lib/googleAuth.js` + rutas + columna `google_sub` + botón.
- [ ] Probar: invitado entra; no-invitado es rechazado; correo no verificado rechazado.

---

## 6. Estado actual: OCULTO a proposito (6 sep 2026)

**Decision del usuario: no se debe ver nada de Google en el panel por ahora.**
La razon es la pantalla de consentimiento: sigue en *Testing*, asi que quien no
este en la lista de test users recibe un error de Google al presionar el boton.

Como quedo en produccion:

| Variable | Estado | Efecto |
|---|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | **quitadas** de Heroku (release v245) | `enabled()` es false → sin boton y rutas cerradas |
| `GOOGLE_LOGIN` | `0` (release v246) | Interruptor: mantiene todo oculto **aunque vuelvan las credenciales** |
| `GOOGLE_API_KEY` | sigue puesta | No se ve en la UI; es para el trabajo de Google Calendar |

Se hicieron las dos cosas a proposito. Quitar las credenciales es lo unico que
entiende el codigo **ya desplegado**; el interruptor `GOOGLE_LOGIN` es nuevo
(`lib/googleAuth.js`) y solo surte efecto **despues del proximo deploy**. Asi
queda cubierto antes y despues.

Verificado en `https://soccerid.co/panel/login`: cero botones, cero texto
"Continuar con Google" (solo quedan reglas CSS sin usar dentro del `<style>`),
y `/panel/auth/google` redirige a `/panel/login?error=1`.

### Volver a ponerlo (automatico)

Las variables se cargan solas desde `google-keys.local.md` y `s3-keys.local.md`
(gitignored), sin copiarlas a mano:

```
node scripts/heroku-env.js              # ensayo: dice que haria, no toca nada
node scripts/heroku-env.js --apply      # las sube con Google OCULTO (GOOGLE_LOGIN=0)
```

Para que el boton se vea, **primero** publicar la pantalla de consentimiento (o
agregar test users) y luego:

```
node scripts/heroku-env.js --apply --google-on   # GOOGLE_LOGIN=1
```

El interruptor acepta `0|off|false|no` para apagar; cualquier otra cosa (o no
definirlo) deja mandando la regla de siempre: hay login si hay client id + secret.

---

## 7. Google Calendar de la organización (7 sep 2026)

Va **aparte del login**: su propio callback, su propio interruptor y su propio
scope. Así se puede conectar el calendario aunque el login siga oculto por lo de
la pantalla de consentimiento en *Testing*.

### Redirect URIs registrados por el usuario

Los cuatro del login, más estos cuatro:

```
https://soccerid.co/panel/auth/google/calendar/callback
https://www.soccerid.co/panel/auth/google/calendar/callback
https://soccerid-landing-199fe9d7095c.herokuapp.com/panel/auth/google/calendar/callback
http://localhost:3000/panel/auth/google/calendar/callback
```

Verificado contra Google: con un `code` falso, el token endpoint responde
"Malformed auth code" y **no** `redirect_uri_mismatch`, así que la URI registrada
coincide con la que manda el servidor.

### Scope

```
https://www.googleapis.com/auth/calendar.events
```

Ver y editar eventos. No pide correo ni nada más.

**Ya está agregado a la pantalla de consentimiento** (usuario, 7 sep 2026).
Mientras la app siga en *Testing* **no hace falta verificación de Google**: basta
con que la cuenta que se conecte esté en la lista de usuarios de prueba. La
verificación solo entra en juego al publicar a Producción. Al conectar aparece el
aviso de "Google no ha verificado esta aplicación" → *Configuración avanzada → Ir
a soccerid.co*; es lo normal en Testing, no un error.

### Cómo funciona

- `lib/googleCalendar.js`. Comparte `GOOGLE_CLIENT_ID`/`SECRET` con el login,
  que es lo único que conviene compartir.
- Interruptor propio: **`GOOGLE_CALENDAR=0`** lo apaga sin tocar el login.
- Los tokens se guardan en `app_settings` (clave `google_calendar`), no en env:
  el refresh token llega después de que el admin autoriza, y en Heroku el proceso
  no puede escribirse una env var a sí mismo.
- `access_type=offline` + `prompt=consent`, porque si no Google deja de mandar el
  refresh token en la segunda autorización y la conexión se cae a la hora.
- El `state` va en cookie httpOnly y se compara en el callback (CSRF).
- Cada actividad guarda su `google_event_id`, así que al sincronizar de nuevo se
  **actualiza** en vez de duplicar. Si el evento se borró en Google, se limpia el
  id y se recrea en la siguiente pasada.
- Al borrar una actividad en el panel se borra también en Google.
- Solo se suben las actividades de la **edición activa** (más las que no dependen
  de ninguna): subir el calendario de 2023 no le sirve a nadie.

### Lo que falta probar

El circuito completo (consentimiento → code real → evento creado en Google)
**necesita un navegador y una cuenta de Google**, así que lo tiene que hacer el
usuario. Sí están probados: el arranque del flujo, el scope, la URI, el rechazo
por `state` que no coincide, el "cancelar" del usuario, el code inválido contra
el token endpoint real, y que un inversionista no pueda conectar nada.

