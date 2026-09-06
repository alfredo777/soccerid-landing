# Video tour del inversionista — diálogos, voz, APIs y data

Onboarding con video la primera vez que un inversionista entra al panel, más el
re-ver el video (lightbox en web / drawer lateral en móvil).

---

## 1. Diálogos (guion) — fuente: `video-demo/segments.js`

### Retorno fijo
1. Este es tu panel de inversionista, en la modalidad de retorno fijo.
2. Aquí ves tu inversión de un vistazo: tu capital invertido y tu retorno fijo proyectado.
3. Tu retorno no cambia con la asistencia. Es fijo por contrato, sin sensibilidad al evento.
4. Aquí están los beneficios de tu categoría.
5. En uso del capital ves lo presupuestado contra lo ejercido, con trazabilidad.
6. En documentos y evidencias encuentras tus contratos y la documentación compartida contigo.
7. Y en el calendario sigues las fechas clave rumbo al evento.

### Participación a riesgo
1. Este es tu panel de inversionista, en la modalidad de participación a riesgo.
2. Aquí ves tu inversión de un vistazo: tu capital, el retorno proyectado y tu participación efectiva.
3. En desempeño del evento revisas el presupuesto, el ingreso proyectado y el avance operativo.
4. La venta en taquilla importa en esta modalidad, porque tu utilidad evoluciona con la asistencia.
5. Con el simulador mueves la asistencia y ves el escenario: ingreso neto, utilidad y tu retorno estimado. Es ilustrativo; tu retorno está sujeto al contrato.
6. Aquí están los beneficios de tu categoría.
7. En uso del capital ves lo presupuestado contra lo ejercido, con trazabilidad.
8. En documentos y evidencias encuentras tus contratos y la documentación compartida contigo.
9. Y en el calendario sigues las fechas clave rumbo al evento.

> Para editar diálogos: cambiar `video-demo/segments.js` y regenerar (ver §3).

---

## 2. Voz — estado actual y plan de mejora

**Actual (provisional):** voz **offline de Windows (SAPI)**, voz `Microsoft Sabina`
(es-MX). Gratis, sin claves, pero **robótica**. Se generó con PowerShell
`System.Speech.Synthesis`. Sirve para **probar diálogos**, no para la versión final.

**Mejora (voz natural) — falta elegir proveedor + API key:**

| Proveedor | API / cómo | Qué necesito |
|---|---|---|
| **ElevenLabs** (recomendado, español natural) | `POST https://api.elevenlabs.io/v1/text-to-speech/{voice_id}` con header `xi-api-key` | `ELEVENLABS_API_KEY` + `voice_id` (voz en español elegida) |
| **OpenAI TTS** | `POST https://api.openai.com/v1/audio/speech` (modelo `tts-1`/`gpt-4o-mini-tts`, voz p. ej. `alloy`/`nova`) | `OPENAI_API_KEY` |
| **Google Cloud TTS** (WaveNet/Neural2 es-US/es-MX) | `texttospeech.googleapis.com` | Service account o API key con TTS habilitado |

**Integración:** el pipeline ya está modularizado. Para cambiar de voz solo se
sustituye el paso de síntesis (hoy PowerShell SAPI) por una llamada al proveedor que
genere un WAV/MP3 por línea; el resto (ensamblado de audio + subtítulos + tiempos +
grabación + composición) **no cambia**. La clave se guarda en un `*.local.md`
gitignored y como env var; nunca en el repo.

> Pendiente del usuario: elegir proveedor y pasar la API key. Con eso se regeneran
> los 4 videos con voz natural y se **reemplazan los archivos** en
> `assets/videos/onboarding/` (mismos nombres → no hay que tocar código).

---

## 3. Pipeline (scripts en `video-demo/`)

1. `segments.js` — guion (fuente única).
2. `tts/manifest.json` — lista de clips a sintetizar (generado desde segments).
3. Síntesis de voz → `tts/<perfil>-NN.wav` (hoy SAPI; a futuro proveedor natural).
4. `voice-assemble.js` — arma `tts/<perfil>-audio.wav`, `tts/<perfil>.srt` y
   `tts/<perfil>-holds.json` (audio y subtítulos sincronizados por segmento).
5. `record-voiced.js` — graba el panel real (Playwright) con tiempos = narración.
6. `runway-intro.js` — intro cinematográfica (Runway) con el logo circular.
7. ffmpeg — escala + **subtítulos quemados** + voz + intro → `final/voiced/*.mp4`.

Grabado en local (mismo código/CSS que producción). Login de prod tiene Turnstile,
por eso no se automatiza contra prod.

---

## 4. Data — dónde vive todo

- **Videos servidos (producción):** `assets/videos/onboarding/tour-<modalidad>-<web|mobile>.mp4`
  (versionados en git → se despliegan a Heroku; se sirven por `/assets`).
- **Videos maestros + originales sin voz:** `video-demo/final/` y `video-demo/final/originals/`
  (carpeta `video-demo/` **gitignored**, solo local).
- **Intros reutilizables:** `video-demo/intros/intro-web.mp4`, `intro-mobile.mp4`.
- **Onboarding (código):**
  - Columna `users.onboarded_at` (bigint, null = no ha visto el onboarding).
  - `POST /panel/onboarded` marca como completado.
  - `buildPanelData` expone `panel.tour` (por modalidad) y `panel.showOnboarding`.
  - Overlay en `views/panel/dashboard.hbs` (portada → video → Continuar → mensaje VIP).
  - Re-ver en `views/layouts/panel.hbs`: botón "Video tour" + lightbox (web) / drawer (móvil).
- **Claves de voz (a futuro):** en `*.local.md` gitignored + env vars.
