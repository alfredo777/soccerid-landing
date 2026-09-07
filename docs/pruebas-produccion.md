# Probar en producción sin Turnstile

Para testear el panel en producción hace falta que el login **no pida el CAPTCHA**
de Cloudflare Turnstile. Todo es por variables de entorno: **no se toca código**.

## Apagar (antes de probar)

```
node scripts/heroku-env.js --turnstile-off --apply
```

Quita `TURNSTILE_SITE_KEY` y `TURNSTILE_SECRET_KEY` de Heroku. Sin la secret, el
servidor **omite** la verificación (`lib/turnstile.js` → `enabled()` es false);
sin la site key, el widget **no se dibuja** en `views/panel/login.hbs`. El login
queda abierto. Reinicia el dyno solo.

## Reactivar (al terminar)

```
node scripts/heroku-env.js --apply
```

Repone **todas** las variables de los `*.local.md`, incluidas las dos de Turnstile
(que se leen de `turnstile-keys.local.md`). El CAPTCHA vuelve a aparecer.

## Verificar

```
heroku config --app soccerid-landing | grep TURNSTILE
```

- Sin resultados = apagado (modo prueba).
- Con las dos claves = activo (normal).

## Notas

- Los dos comandos sin `--apply` hacen **ensayo**: muestran qué harían sin tocar
  nada. Útil para confirmar antes de ejecutar.
- El interruptor no afecta a nada más: S3, Google y Anthropic siguen igual.
- **No dejar Turnstile apagado más de lo necesario**: es la única barrera anti-bot
  del login. Reactivarlo apenas se termine de probar.
