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
