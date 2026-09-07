# Pendientes del panel

## Asistente de contenidos con IA — Claude Haiku 4.5 — HECHO

Botón **"Redactar con IA"** en el admin. La IA **propone**, el admin **revisa, edita y
aplica**: nada se escribe solo en la base. La propuesta llega a un drawer con los campos
editables y solo pasa al formulario si el admin le da "Pasar al formulario".

- **Modelo `claude-haiku-4-5`** (decisión del usuario). Es previo a la familia 4.6, así que
  **no** lleva `effort` ni thinking adaptativo: esos parámetros dan error en este modelo.
- SDK oficial `@anthropic-ai/sdk`, no HTTP a mano.
- Tareas: **noticia** (título + extracto + cuerpo), **FAQ** (pregunta + respuesta),
  **presentación** de la edición, **comunicación**, y sobre un texto existente:
  **mejorar**, **acortar**, **traducir a inglés/español**.
- **Sabe de qué edición se está hablando**: el endpoint le pasa el contexto de la edición
  activa (título, partido, sede, fecha), para que no escriba sobre el año equivocado.
- **No inventa cifras.** El prompt se lo prohíbe explícitamente: si le falta un dato lo deja
  entre corchetes. Probado pidiéndole "di cuánto capital llevamos levantado": se negó y
  pidió los datos reales en vez de inventar un número.
- **Sin `ANTHROPIC_API_KEY` el asistente no aparece** y el endpoint responde 503. El admin
  sigue funcionando igual; no se rompe nada.
- Solo admin: un inversionista que llame al endpoint termina en su panel.

Pendiente de esta sección:
- [ ] **Rotar la API key**: se envió por chat en texto plano. Está en
  `anthropic-key.local.md` (gitignored) y se sube con `node scripts/heroku-env.js --apply`.
- [ ] **Extraer la imagen de una nota** a partir de su URL (og:image + imágenes del
  artículo) y subirla con el uploader. Necesita fetch + parseo del HTML, aparte de la IA.
- [ ] Botón de IA también en la página por edición (avances, comunicaciones, data room):
  hoy vive en la pantalla principal del admin.
- [ ] Registrar qué se generó y quién lo aplicó, para poder auditarlo después.


## Panel estadístico del ADMIN (no para inversionistas)
- [x] ~~Mover "Distribución de inversionistas" (donut por categoría) fuera de la vista
  del inversionista~~ **HECHO**: se quitó de `views/panel/dashboard.hbs` (con su CSS).
  Los datos (`panel.donut`, `panel.distribution`, `panel.investorTotal`) se siguen
  calculando en `buildPanelData` y están listos para el panel del admin de abajo.
- [x] **Panel estadístico en el admin** — HECHO. Pestaña "Estadísticas", ligada a la
  **edición activa**. Todo es derivado: se cuenta de lo cargado, no se captura.
  - Capital comprometido de la edición y % del presupuesto, cuánto falta por levantar
    (y si la edición no tiene presupuesto lo dice, en vez de un "$0 faltante" que se lee
    como "ya está cubierto"), capital de todas las ediciones.
  - **Retorno proyectado con la misma función `computeReturn` del panel del
    inversionista**, para que el admin no vea una cifra distinta a la que ve cada quien
    (incluye los overrides de retorno por inversión).
  - Reparto fijo / riesgo en monto, número y porcentaje.
  - **Dona de inversionistas reales contra el cupo planeado** de cada categoría: la
    diferencia es lo que falta por vender.
  - Cuentas por estado (activos, invitados, inactivos, patrocinadores).
  - Taquilla: vendidos, aforo, ingreso y punto de equilibrio, avisando si ya se superó.
  - Data room de la edición por estatus + documentos por cuenta.
  - Códigos 2027 (usados, por usar, con dueño, usados por otra persona), accesos y
    dispositivos nuevos.
  - Prospectos por estado y conteo de contenido publicado.

Pendiente de esta sección:
- [x] ~~Comparativo entre ediciones~~ **HECHO**: tabla con una fila por edición (capital,
  presupuesto, % cubierto, inversiones, paquetes, documentos y avances), con la activa
  resaltada. Las ediciones sin presupuesto muestran "—" en vez de un 0% engañoso.
- [x] ~~Evolución en el tiempo~~ **HECHO**: gráfica de **capital acumulado por mes**, a
  partir de la fecha de cada inversión. Si nadie tiene fecha capturada **no dibuja una
  línea inventada**: dice qué falta y dónde capturarlo. También avisa cuántas inversiones
  quedaron fuera por no tener fecha.

## Convención de UI (preferencia)
- **Preferir panel lateral (drawer) sobre lightbox/modal centrado.** Para ver/crear/editar,
  usar el drawer que sale de la derecha (ya existe el patrón). Reservar el lightbox
  solo para casos puntuales (p. ej. video en web si aplica).
- [x] ~~Revisar el **video tour**~~ **HECHO**: era lightbox en escritorio y drawer en
  móvil. Ahora es **drawer en todos lados**, según la convención del panel: tener dos
  comportamientos para lo mismo según el ancho de la pantalla confunde.
  pasar también a **drawer en web** para ser consistentes.


## Vista previa del admin
- [x] ~~Elegir modalidad en "Ver como inversionista"~~ **HECHO**:
  `/panel/admin/preview/investor?modality=fijo|riesgo` + toggle en el banner de vista
  previa. Verificado que cada modalidad rinde su contenido (fijo: retorno fijo y el
  aviso de por qué se omite el simulador; riesgo: desempeño, participación efectiva
  y simulador).

## Login con Google (en pausa)
- [ ] Desplegar cuando el **admin esté listo con las invitaciones**.
- [ ] Flujo de invitación: registrarse **con Google o con contraseña** (verificando el email); cuenta predefinida por la invitación.
- [ ] Reactivar env vars en Heroku (`GOOGLE_CLIENT_ID/SECRET`, valores en `google-keys.local.md`) + publicar la pantalla de consentimiento.

## Códigos 2027: dueño asignado + mapa de relaciones — HECHO
Cada código de la propuesta 2027 se puede **asignar a una persona**, y cuando alguien
entra con él el panel dice si fue **el dueño** o **otra persona** — que es justo lo que
interesa: significa que lo reenvió, y ahí hay un referido que perseguir.

Lo que quedó construido:
- `access_codes` gana `assignee_name`, `assignee_email`, `assignee_phone`, `tags` y
  `assigned_at`. `access_log` gana `matched_owner` (true / false / **null**).
- **`null` es un tercer estado a propósito**, no un "false" disfrazado: significa que no
  se puede saber (el código no tiene dueño, o quien entró no dejó datos comparables).
  Decir "otra persona" sin base sería inventar un referido que no existe.
- Comparación en `lib/codeMap.js`: primero correo, luego teléfono (normalizado a los
  últimos 10 dígitos, así `+52 55 1234 5678` y `5512345678` son la misma persona) y al
  final el nombre sin acentos. El nombre es el criterio débil y por eso es el último.
- **Al asignar un dueño se recalculan los accesos que ya estaban registrados** con ese
  código. Si no, el mapa arrancaría vacío para todo lo que pasó antes de asignar.
- Drawer "Dueño del código" en la pestaña Códigos, con validación de correo y teléfono
  y un botón para quitar el dueño. La lista muestra dueño, tags y cuántos accesos fueron
  de otra persona.
- El historial por código marca cada acceso como **EL DUEÑO** / **OTRA PERSONA** /
  sin confirmar.
- El aviso al organizador cuando se usa un código ahora dice si entró el dueño o no.

### Mapa de relaciones (pestaña "Mapa de códigos")
Grafo en **SVG dibujado a mano, sin librería** (nada de D3 ni vis-network: no hace falta
meter una dependencia de 200 kB para esto, y el layout determinista no se mueve solo
como una simulación de fuerzas).

- Dos columnas: a la izquierda quien repartió el código, a la derecha quien entró con él.
  Cada línea es *"el código de X lo usó Y"*, con el grosor según cuántos accesos.
- **Línea sólida** = confirmado que no era el dueño. **Punteada** = no se pudo confirmar.
  La distinción importa: una es un referido real y la otra es un dato incompleto.
- Al pasar el mouse por un nodo se atenúa lo que no es su rama.
- Chips para filtrar por tag.
- Estados vacíos que explican qué falta hacer, en vez de un lienzo en blanco: "todavía no
  hay nada que mapear" (sin dueños) y "nadie ha usado un código ajeno" (con dueños pero
  sin reenvíos).
- Tarjetas arriba: códigos con dueño, códigos usados por otra persona, personas alcanzadas
  por reenvío y repartidores en el mapa.

Pendiente de esta sección:
- [x] ~~**Mandar el código al dueño** por email/SMS desde el mismo drawer~~ **HECHO**:
  botón "Enviar código" en el drawer del dueño, con casillas de correo y SMS. Reutiliza el
  mailer y el canal de Twilio; no hay un tercer camino de envío. Si un canal falla lo dice
  (p. ej. "faltan las llaves de Twilio") en vez de dar por bueno el envío. Queda registrado
  en la bandeja del organizador, sin mandar un correo extra por el mismo hecho.
- [x] ~~Timeline por dueño~~ **HECHO**: debajo del mapa, "Quién entró y cuándo" junta los
  accesos de **todos los códigos de cada dueño** en orden. El mapa dice *quién entró con el
  código de quién*; esto dice *cuándo*, que es lo que sirve para llamar a alguien en el
  momento justo. Primero los repartidores con más entradas ajenas.
- [ ] Cadena de más de un salto (si Y reparte a Z, hoy Z cuelga del dueño original, no
  de Y): requiere saber con qué código entró Z, y hoy es el mismo código.


## Presentación / Propuesta dentro del panel — HECHO
Sección "Presentación" en el panel del inversionista (`/panel/presentacion`,
`views/panel/presentacion.hbs`). **La presentación pertenece a la edición**: se guarda en
`portfolio_events.presentation_es` / `presentation_en` y se edita desde el admin junto con
el resto de la edición. El inversionista ve la de su edición activa.

Pendiente de esta sección:
- [x] ~~Traer más bloques de la propuesta pública~~ **HECHO**: la presentación suma **uso
  del capital** (rubros con presupuestado vs ejercido), **punto de equilibrio** (con la
  marca del break-even sobre la barra de venta) y el **calendario del proyecto**. Salen
  aunque la edición todavía no tenga texto de presentación: no dependen de él.

## FAQ editable (inversionistas y patrocinadores) — HECHO
Tabla `faqs` (audiencia, pregunta, respuesta, orden, activa), CRUD en drawer desde el
admin (pestaña FAQ) y vista `/panel/faq` con acordeón filtrado por audiencia. El buscador
del panel **indexa el FAQ primero**, que era el otro pedido.

Pendiente de esta sección:
- [x] ~~Reordenar arrastrando~~ **HECHO**: se arrastra la pregunta en la lista y el orden
  se guarda solo (endpoint `/admin/:kind/reorder`, que reescribe los `sort` completos).
  De paso quedó limpio el orden del FAQ, que traía números repetidos.
- [x] ~~Versión ES/EN de cada pregunta~~ **HECHO**: columnas `question_en` / `answer_en`,
  campos en el drawer y distintivo "EN" / "sin inglés" en la lista. **El idioma sale de la
  preferencia del propio usuario**, y si una pregunta no está traducida se muestra en
  español en vez de dejar el hueco vacío. Probado cambiando el idioma del perfil.

El contenido inicial de referencia queda abajo.


### Contenido inicial — Inversionistas
- **¿Qué es la SOCCER iD CUP 2027?** Evento internacional de futbol operado por SOCCER iD;
  edición 2027: Tigres vs Cruz Azul, 27 de marzo de 2027, Shell Energy Stadium (Houston, TX).
- **¿Cuál es la inversión mínima?** USD $30,000 (aprox. $500,000 MXN).
- **¿Qué modalidades de inversión hay?** *Retorno fijo* (hasta 25% contractual; ej.
  $100,000 → $25,000 de utilidad) y *Participación a riesgo* (socio del evento,
  reparto 50% SOCCER iD / 50% pool de inversionistas, proporcional a tu capital).
- **¿Cómo se calcula mi retorno a riesgo?** Tu participación efectiva = (tu capital /
  costo del proyecto) × 50%; se aplica a la utilidad del evento. Ejemplo ilustrativo:
  con lleno (21,800 asistentes) la utilidad estimada es ~$1.18M, el pool recibe ~$590,000.
- **¿Cuál es el punto de equilibrio?** ~10,000 boletos (45.9% de ocupación); por debajo
  no hay utilidad.
- **¿De dónde salen los ingresos?** Taquilla, derechos de TV, publicidad (transmisión y
  estadio), patrocinios, alimentos/bebidas/estacionamiento y merchandising.
- **¿En qué se usa el capital?** Garantías de clubes ($400k), estadio y operación ($200k),
  transporte y hospedaje ($250k), marketing ($100k), producción TV ($15k), permisos y
  seguros ($35k).
- **¿Cuándo recibo mi retorno?** Distribución estimada en agosto de 2027, tras el cierre
  financiero (evento 27 mar 2027 → conciliación abr–jul 2027).
- **¿Qué respaldo/experiencia tienen?** 3 ediciones previas: 2023 Pumas vs Comunicaciones
  (San José), 2024 América vs Atlético Nacional (Orlando), 2025 Pumas vs Tigres (Austin).
- **¿Hay contrato?** Sí, contrato formal; uso exclusivo de fondos para el evento y acceso
  a la documentación y seguimiento del proyecto.
- **¿Cómo doy seguimiento?** Desde tu panel: avances, documentos, comunicaciones, y el
  simulador (solo modalidad a riesgo).

### Contenido inicial — Patrocinadores
- **¿Qué incluye un patrocinio?** Presencia de marca y activaciones según categoría
  (definidas en el admin); exposición en estadio y transmisión.
- **¿Qué alcance tiene el evento?** Mercado hispano líder (Houston); antecedentes de
  llenos (Tigres 21,792 en Houston 2025; Cruz Azul 25,405 en LA 2024).
- **¿Qué categorías de patrocinio hay?** Configurables en el panel (nombre, monto,
  cupo, beneficios/activaciones).
- **¿Quiénes han patrocinado antes?** Caliente MX, Fox Sports, Voit, Nuestra Visión.
- **¿Cómo veo mis activaciones y beneficios?** En tu panel, sección de beneficios/categoría.

> Nota: cifras ilustrativas sujetas a contrato; editables desde el admin.

## Editar perfil de inversionista (autogestión) — HECHO
Drawer "Mi perfil" (se abre desde el chip de usuario, arriba a la derecha). Cubre
idioma, contraseña, celular y correo extra, datos del asistente y preferencias de
canal. Columnas nuevas en `users`: `language`, `phone`, `phone_extra`, `email_extra`,
`assistant_email`, `assistant_phone`, `notify_email`, `notify_sms`.

Detalles de la implementación:
- Nombre y correo principal se muestran **deshabilitados**: siguen siendo del admin.
  Categoría, monto y modalidad tampoco se tocan aquí.
- Los correos y teléfonos se validan en el servidor; lo que no parece correo o
  teléfono se descarta en vez de guardarse (evita basura que rebote en los envíos).
- El idioma escribe la cookie `lang`, que es como el sitio resuelve el idioma.
  **Ojo:** las vistas del panel siguen solo en español; la preferencia queda guardada
  y aplica al sitio público. Traducir el panel es trabajo aparte.
- Cambio de contraseña: pide la actual (bcrypt existente), mínimo 8, confirmación y
  que sea distinta de la actual.
- El drawer no se renderiza para admin ni en la vista previa.

Pendiente de esta sección:
- [x] ~~Mismo "Editar perfil" para **patrocinadores**~~ **VERIFICADO**: el drawer ya
  servía tal cual — todos sus campos (idioma, contacto, asistente, avisos, contraseña)
  aplican igual a un patrocinador y no hay texto que hable de inversión. Probado con una
  cuenta de patrocinador: abre, guarda y sus páginas cargan.
  De paso salió un bug real: **el patrocinador veía los paquetes de inversión** ("Retorno
  fijo" y "Participación a riesgo"), y encima uno marcado como suyo, porque su modalidad
  caía en `fijo` por defecto. Ahora solo ve paquetes de **patrocinio**, y lo de "el tuyo"
  es solo para inversionistas.
- [x] Respetar `notify_email` / `notify_sms` **al enviar** — hecho en Notificaciones.

## Notificaciones (tipos, directas y canales) — HECHO
Todo pasa por un solo punto de envío: `lib/panelNotify.js` (`notify` para usuarios,
`notifyAdmins` para el organizador). Nadie más manda notificaciones por su cuenta.

Lo que quedó construido:
- Tabla `notifications` ampliada (migración idempotente en `db/schema.js`): `type`,
  `user_id` (directa), `event_id`, `channels`, `sent_email`, `sent_sms`.
  **`channels` es una lista** ('in-app,email') y no un solo valor, porque una misma
  notificación sale por varios lados a la vez.
- Tipos: actividad · envío · documento · post · código · inversión · directa · comunicado.
  Cada uno con su etiqueta de color, visible para el inversionista y en el log del admin.
- **Directas 1 a 1**: el admin elige "A una persona". Solo esa persona la ve; el filtro
  de `notificationsForUser` deja pasar las de su audiencia **sin destinatario** más las
  suyas propias. Verificado: el otro inversionista no la ve.
- **Canales**: in-app siempre; email por `lib/panelMailer.js` (el mailer que ya existía,
  no se creó otro camino); SMS por `lib/panelSms.js` (Twilio por HTTPS directo, sin
  agregar dependencias al build).
- **Respeta las preferencias del perfil** (`notify_email` / `notify_sms`): a quien apagó
  el email no le llega correo, a quien no aceptó SMS no le llega SMS. In-app siempre
  llega, para que nadie se quede sin ver un mensaje dirigido a él.
- El admin ve cuántos correos y SMS salieron de verdad (`sent_email` / `sent_sms`), no
  cuántos se intentaron.
- Disparadores ya conectados: **noticia compartida** (tipo post), **documento nuevo**
  para su dueño (tipo documento, con `silent=1` para cargar sin avisar) y **acceso con
  código 2027** al log del organizador (sin email: ese aviso ya salía por otro lado, no
  tiene caso mandarlo dos veces).

### Las llaves de Twilio se ponen desde el admin
Configuración → tarjeta **SMS (Twilio)**: Account SID, Auth Token y remitente. Se guardan
en `app_settings` (clave `twilio_config`), **no** en variables de entorno: en Heroku
cambiar una env var reinicia el dyno y hay que entrar por consola, y el organizador
necesita poder pegar sus llaves sin depender de un deploy. Las env vars
`TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_FROM` siguen sirviendo de respaldo.

- **Las llaves son el interruptor** (decisión del usuario): con SID, token y remitente
  puestos, el canal SMS queda activo solo. No hay un switch aparte que se pueda quedar
  apagado por olvido después de pegar las credenciales. Para apagarlo se borran las
  credenciales.
- El token **nunca se vuelve a mostrar**: la vista solo recibe una máscara (`••••••••1234`).
  Si se deja el campo vacío al guardar, se conserva el que ya estaba.
- Se valida el formato del SID (`AC` + 32 hex) y del remitente (`+52...` o `MG...`) antes
  de guardar, para no descubrir el error hasta el primer envío.
- Si faltan llaves, el admin dice **cuál** falta ("Falta el Auth Token y el remitente"),
  no un "no funciona" a secas.
- Botón de **SMS de prueba** y de **borrar credenciales**. El error de Twilio se muestra
  tal cual (probado: con llaves falsas responde "Authenticate", no truena).
- Mientras no estén las llaves, la casilla de SMS del formulario sale deshabilitada.
- Marcar SMS **en cada notificación** sigue siendo decisión por mensaje: el canal está
  disponible, pero no se manda SMS de todo por default (cada uno cuesta).

Pendiente de esta sección:
- [x] ~~Preferencias **por tipo**~~ **HECHO**: casillas en "Mi perfil" para cada tipo de
  aviso. Lo que desmarca deja de llegarle por correo y SMS, pero **se sigue guardando en su
  panel**: apagar un tipo es para que no le suene el teléfono, no para perder el registro.
  Los **mensajes dirigidos a él no se pueden apagar**.
  Se guarda lo **apagado** (`notify_off`), no lo encendido: así un tipo nuevo le llega a
  todos por defecto en vez de a nadie hasta que lo activen uno por uno.
- [x] ~~Disparador de **cambio de estatus de documento**~~ **HECHO**: al pasar a
  *aprobado* o *firmado* se avisa a los inversionistas de esa edición, respetando la
  visibilidad por modalidad del documento. Volverlo a "en revisión" **no** avisa: no es
  noticia para nadie y avisar de cada cambio sería ruido.
- [x] ~~Disparador de **inversión creada/actualizada**~~ **HECHO** (junto con el CRUD de
  inversiones). Al registrar o modificar una inversión se le avisa al inversionista, por
  panel y correo. Al editar **solo avisa si cambió el monto, la modalidad, el retorno o la
  fecha de entrega**: corregir una nota interna no tiene por qué molestar a nadie.
- [x] ~~Disparador de **cambio de fase**~~ **HECHO**: al mover la fase de una edición se
  avisa a sus inversionistas. Guardar la edición sin cambiar de fase no avisa: se edita a
  cada rato y sería ruido.
- [x] ~~**Recordatorio de fecha de entrega**~~ **HECHO**: `recordarEntregas()` avisa cuando
  faltan 30 días o menos, **una sola vez** (marca `reminded_at`). Corre al arrancar y cada
  24 h — no hay cron en Heroku sin add-on y el dyno se reinicia a diario, así que basta.
  No recuerda fechas ya pasadas: avisar de algo que debió entregarse hace meses no ayuda.
- [ ] Notificaciones **push** (requiere service worker; no está hecho).
- [x] ~~Bandeja de notificaciones del admin~~ **HECHO**: "Tu bandeja" separada de
  "Enviadas". Arriba lo que el sistema le avisa a él (accesos con código, envíos); abajo
  lo que él mandó. Antes estaba todo revuelto en una sola lista.


## Invitaciones por SMS + Email (diseño personalizado)
Poder enviar invitaciones **por SMS y por email**, con **diseño personalizado**
(plantilla de marca), en dos flujos:
- **Códigos de la propuesta 2027**: mandar el código de acceso por **SMS y/o email**.
- **Inversionistas**: mandar la invitación (activación de cuenta) por **SMS y/o email**.

Detalles:
- **Email**: ya existe envío vía nodemailer (`lib/panelMailer.js`, SMTP/Mailgun).
  Falta una **plantilla HTML de marca** personalizada (logo, colores SOCCER iD,
  botón CTA) para invitación de inversionista y para código 2027.
- **SMS**: el envío ya está listo (`lib/panelSms.js`, Twilio) y **las llaves se
  configuran desde el admin** (Configuración → SMS (Twilio)); ver la sección de
  Notificaciones. Falta que el usuario abra la cuenta de Twilio, compre un número y
  pegue el Account SID / Auth Token ahí. Lo que falta de esta sección es solo usar ese
  envío para **invitaciones y códigos**, no el canal en sí.
- Requiere tener **teléfono** del destinatario (se conecta con la asignación de
  códigos a persona: email y/o teléfono, ver sección de mapa de relaciones).
- UI en el admin: elegir canal (email / SMS / ambos) al invitar o al enviar código.

## Navegación y separación de secciones — HECHO
- Cronograma dejó de duplicarse: vive solo en `/panel/calendario#cronograma` y el enlace
  del sidebar apunta ahí.
- "Estado del evento" quedó como **Noticias** (solo noticias), sin el cronograma dentro.


## Bugs / a revisar — HECHO
- ~~"Ver todas" mandaba al Home~~: el `href` siempre estuvo bien; lo que fallaba era el
  redirect del **admin** al entrar a `/panel/noticias`. Va a `#noticias`.
- ~~El buscador no funcionaba~~: filtraba `[data-searchable]`, que no existía. Ahora hay
  un índice armado en el servidor (`searchIndex`) con **FAQ primero**, más noticias,
  hitos y secciones, con teclado y resaltado.
- ~~"Estado del evento" se veía vacío~~: la página no explicaba que no había noticias.
  Ahora tiene estado vacío con mensaje, y chips de categoría que filtran.


## Calendario ↔ Cronograma (editables y por edición) — HECHO, salvo Google Calendar

Antes el calendario y el cronograma eran **globales**: con varias ediciones, lo de 2025 se
mezclaba con lo de 2027. Ahora las actividades y las etapas **pertenecen a una edición** y
el inversionista ve las de la **edición activa** (la que elige el admin).

- [x] ~~El calendario no despliega nada~~: abre en el **mes actual** y las flechas navegan.
- [x] **Calendario = actividades por tipo.** La lista corta se amplió: Evento, Partido,
  Actualización, Patrocinio, Prensa, **Logística, Meeting, Meet & greet, Junta de
  inversionistas** y **Otro**.
- [x] **"Otro" abre un campo de texto** para escribir el tipo a mano, y eso es lo que se
  muestra después. El organizador hace cosas que no caben en una lista cerrada.
- [x] Las actividades tienen **hora y nota** opcionales.
- [x] **Cronograma = etapas dinámicas**, no un set fijo: se agregan, editan, **reordenan**
  (subir/bajar) y borran. Cada etapa puede tener descripción, fecha de inicio y de fin.
- [x] **Todo por edición**, con opción "Todas (sin edición)" para lo que no dependa del año.
  Las filas viejas, que no tenían edición, se siguen mostrando: si no, el panel se habría
  quedado vacío de golpe al migrar.
- [x] **Agenda del día del partido editable**. Vivía en `contents/panel_config.json`, donde
  no había forma de tocarla desde el admin **y que en Heroku ni siquiera sobrevive al
  deploy**. Ahora es la tabla `match_agenda`, por edición, con su sección en la página de
  la edición. La migración **siembra lo que ya estaba en el JSON**, así que no se pierde.
- [x] Estados vacíos con mensaje en actividades y etapas.

Validación (todo en el servidor, no solo en el navegador):
- Fechas que no existen se rechazan: un **31 de febrero** se guardaba igual y luego la
  actividad no aparecía en ningún mes del calendario, sin explicación.
- Día 1–31, mes 1–12, año 2000–2100; hora con formato `19:00`; título obligatorio.
- Si el tipo es "Otro", hay que escribir cuál.
- En las etapas, la fecha de fin no puede ser anterior a la de inicio.
- Los bloques de agenda solo se borran desde su propia edición.

Pendiente de esta sección:
- [x] ~~**Vinculación con Google Calendar**~~ **HECHO — falta probarlo en vivo**:
  `lib/googleCalendar.js` + tarjeta en Configuración. **Callback propio**
  (`/panel/auth/google/calendar/callback`, ya registrado por el usuario en Google),
  **scope propio** (`calendar.events`) e **interruptor propio** (`GOOGLE_CALENDAR=0`), para
  poder conectarlo aunque el login de Google siga oculto. Guarda `google_event_id` por
  actividad, así que re-sincronizar **actualiza en vez de duplicar**; borrar la actividad la
  borra también en Google; solo sube las de la edición activa.
  **El circuito completo (consentimiento → code real → evento creado) necesita navegador y
  cuenta de Google: lo tiene que probar el usuario.** Detalle en `docs/google-auth.md` §7.
- [x] ~~Botón **"Agregar a mi Google Calendar"** y **feed iCal**~~ **HECHO**, y **sin OAuth**:
  - **Feed iCal** en `/panel/agenda/<token>.ics`. El inversionista se suscribe una vez y las
    fechas le aparecen en Google, Apple u Outlook, actualizándose solas. **No pide permisos
    ni toca su agenda**: es una dirección que su calendario consulta.
  - La ruta va **sin sesión a propósito**: las apps de calendario no mandan cookies, así que
    no hay cookie que validar. Lo que autentica es un **token HMAC por usuario**, que no se
    puede adivinar ni fabricar sin el secreto del panel. Probado: token manipulado → 404,
    token de un admin → 404 (el admin no tiene agenda de inversionista).
  - Respeta la **edición activa**, igual que el resto del panel.
  - Botones de "Agregar a Google Calendar" y "Apple / Outlook" (`webcal://`), más la URL
    copiable, en la vista de calendario.
  - Cada actividad del mes es además un enlace de **"agregar esta fecha"** a Google: abre el
    formulario ya lleno, tampoco pide permisos.
- [x] ~~Una sola línea de tiempo~~ **HECHO**: bloque "Todo en orden" en el calendario, con
  etapas y actividades juntas de la más antigua a la más próxima, marcando lo ya pasado y
  resaltando lo de hoy. Convivían, pero cada una en su vista, y para saber qué pasa antes
  de qué había que ir mirando las dos. Solo entran las que tienen fecha real.
- [x] ~~Tipos de actividad configurables~~ **HECHO**: se agregan desde Configuración con su
  color y aparecen en los dos formularios del calendario. Los de fábrica **no se pueden
  borrar** (los usan las actividades ya cargadas) y **un tipo propio en uso tampoco**: el
  admin dice que primero hay que cambiarle el tipo a esas actividades.


## Noticias
- [x] ~~URL de la nota original + "Ver original"~~ **HECHO**: columna `news.source_url`
  (migración con guarda `hasColumn`), campo en alta y edición del admin, y enlace
  "Ver original" con `target="_blank"` + `rel="noopener noreferrer"`. El URL se valida
  server-side (`sourceUrl()` en routes/panel.js): solo http/https, para que no entre
  un `javascript:` en el href.

## Videos
- [ ] **Voz natural** en los videos (hoy voz offline provisional). Falta elegir proveedor + API key (ElevenLabs / OpenAI / Google TTS). Al tenerla se regeneran y se reemplazan los archivos.

## Ediciones: alta/edición más intuitiva — HECHO
Se fueron los textareas con formato de tubería (`valor | etiqueta | sub`), que obligaban
a recordar el orden de las columnas y se rompían con un pipe de más dentro de un texto.

Lo que quedó construido:
- **Filas repetibles** para estadísticas, notas en medios, imágenes, patrocinadores y
  videos: un campo por dato, con su etiqueta, y botones de **subir / bajar / eliminar**
  por fila más un **+ Agregar**.
- **Subida de imágenes** con el uploader que ya existía (`/panel/admin/upload` → S3 en
  producción, disco local en desarrollo) para banner, galería, logos de patrocinadores e
  imagen de las notas. Miniatura al lado del campo. Se sigue pudiendo pegar una URL.
- **Qué es compartido y qué es por idioma** ahora se ve: los campos comunes llevan la
  etiqueta *compartido* y hay una nota explicando que si el inglés se deja vacío, la
  página en inglés cae al español.
- **Validación del año en el servidor**, no solo en el navegador: 4 dígitos, entre 2000 y
  2100, y no puede chocar con otra edición. Antes se podía guardar cualquier cosa y el
  timeline público quedaba mal ordenado sin que nadie lo notara.
- **Vista previa** dentro del mismo drawer: banner, título, datos, estadísticas y
  miniaturas tal como van a quedar, con **avisos** de lo que está mal (año incompleto,
  falta el título, un enlace de nota que no empieza con http, un ID de YouTube que no lo
  parece). Es previa a guardar, con lo que hay en el formulario, no con lo que está en la
  base.

Notas de implementación:
- Cada colección viaja como JSON en un input oculto (`stats_es_json`, `images_json`, ...).
  **El formato viejo de tuberías se sigue aceptando** en el servidor: si llega un POST sin
  el campo `_json`, se parsea como antes. Así no se rompe nada que quedara en caché.
- El servidor filtra por claves conocidas y descarta las filas que quedaron vacías, así
  que una fila de más en el formulario no ensucia los datos.
- Al escribir en una fila se actualiza el estado sin redibujar; si se redibujara en cada
  tecla, el cursor saltaría fuera del campo.

Pendiente de esta sección:
- [x] ~~Arrastrar para reordenar~~ **HECHO**: las filas del editor (estadísticas, notas,
  imágenes, patrocinadores, videos) se arrastran. Las flechas siguen ahí para quien las
  prefiera.
- [x] ~~Subir varias imágenes de golpe a la galería~~ **HECHO**: botón "Subir varias" en la galería. Van de una en una por dentro (subir 20 en paralelo satura el dyno) y avisa cuántas fallaron.
- [x] ~~Vista previa en inglés~~ **HECHO**: la previa tiene botones ES/EN y cae al español
  cuando el campo en inglés está vacío, igual que hace el sitio. Avisa si falta el título
  en inglés.


## Multievento LIGADO a las ediciones (por año) — pedido de León
**Decisión (usuario): el admin multievento va ligado a las ediciones.** Una
**edición por año** es la **fuente única** que alimenta a la vez:
- la parte **pública** de la CUP (landing / timeline / página de la edición), y
- la parte del **inversionista** (portafolio: presupuesto, fase, avance, inversiones,
  documentos, comunicaciones, y **paquetes de inversión**).

Objetivo inmediato: llenar con **info real** las ediciones **2023 / 2024 / 2025** y
poner **2027** con info real + **paquetes de inversión reales**.

Hecho:
- [x] Datos reales cargados en `portfolio_events` (2023 San José, 2024 Orlando,
  2025 Austin, 2027 Houston), sin `is_demo`.
- [x] CRUD de ediciones con los campos públicos (match, sede, fecha, banner, stats,
  media) y los de inversión (presupuesto, ingreso proyectado, fase, avance).
- [x] **Paquetes de inversión** por edición: nombre, monto, modalidad, % retorno,
  beneficios, cupo, y además **paquetes privados** para una sola persona (`user_id`).

### Una sola edición por año — HECHO (era decisión del usuario, 7 sep 2026)

Ya no hay dos tablas ni dos pestañas para el mismo año. **`portfolio_events` es la única
edición**: ahí viven juntos el contenido público y los datos de inversión.

Sobrevivió `portfolio_events` porque paquetes, inversiones, avances, documentos, medios y
comunicaciones ya colgaban de su `event_id`: mover el contenido público hacia ella toca
una tabla, al revés habría tocado seis.

- [x] Migración con guarda: `portfolio_events` gana `status`, `data_es` y `data_en`, y se
  copia el contenido de `editions` emparejando por año. **No borra la tabla vieja** — sus
  datos siguen ahí por si hiciera falta mirarlos, pero ya nadie le escribe.
- [x] **2026 se rescató**: existía solo del lado público ("pausa por Mundial") y ahora
  tiene su fila en el portafolio. La copia solo toca filas sin contenido público, así que
  repetir la migración no pisa lo que el admin haya editado después.
- [x] `db/editions.js` (todo lo público: timeline, página por año, hemeroteca) lee de la
  tabla unificada. El respaldo por JSON sigue intacto.
- [x] El admin quedó con **una sola pestaña "Ediciones"**. Su drawer guarda de una vez
  identidad, estado público, contenido ES/EN con filas repetibles, presentación,
  presupuesto y parámetros del simulador.
- [x] Se retiraron las rutas `/admin/edition*` y el armado de datos de la tabla vieja.

Robustez del alta/edición:
- [x] **Un año, una edición**: el servidor rechaza crear o mover una edición a un año que
  ya existe, y lo dice con el año ("edita la que ya está").
- [x] Año validado (4 dígitos, 2000–2100) y título obligatorio, en el servidor.
- [x] **No se borra una edición con inversiones registradas**: son registros de dinero de
  gente real; el mensaje dice cuántas hay y dónde quitarlas.
- [x] Al borrar una edición sin inversiones se van con ella sus paquetes, avances,
  documentos, medios y comunicaciones, para no dejar filas apuntando a un `event_id` que
  ya no existe.
- [x] Si se borra la edición que estaba marcada como activa, la configuración vuelve a
  automática en vez de dejar al panel apuntando a algo que no está.
- [x] Las ediciones se ordenan por **año** (antes por un `sort` que se desalineaba al
  crear una fuera de secuencia).

Pendiente de esta sección:
- [ ] Retirar la tabla `editions` del esquema cuando haya pasado un tiempo en producción
  y se confirme que no hace falta.
- [x] ~~Migrar el `sort` viejo~~ **HECHO**: `sort` queda igual al año, y una edición nueva
  nace con `sort = año`. Antes era un contador aparte (1,2,3,4 y un 2026 suelto) que dejaba
  2026 hasta el final. Se conserva la columna para no romper nada que la lea.

### DECISIÓN DEL USUARIO (7 sep 2026): edición activa la elige el ADMIN

**El inversionista NO cambia de edición.** Nada de selector para él. En su lugar:

- [x] **"Edición activa" desde el admin** — HECHO. Selector arriba de la pestaña Eventos
  (`activeEditionId` en la config del dashboard) y distintivo "Activa" en la tarjeta.
  Sin configurar queda en **automática**: la de mayor año, marcada "Activa (auto)".
  `buildPanelData` ya no deduce la edición de la primera inversión del usuario.
- [x] **Vista general de las otras ediciones** — HECHO: `/panel/ediciones`, solo lectura
  (año, partido, sede, fecha), con la edición en curso destacada arriba. Sin datos de
  inversión de ediciones ajenas. Entrada nueva en el menú.
- Si el inversionista **no tiene inversión en la edición activa**, su panel no se queda en
  blanco: las cifras salen de los datos de su cuenta y la vista de ediciones se lo dice.
- El cambio es solo para admin (`requireAdmin`); un inversionista que intente el POST
  termina en su panel.

- [ ] Confirmar si además de los paquetes de inversión hay **paquetes de patrocinio**.

### Resto del admin multievento (fases 1, 2, 4, 6) — HECHO lo de contenido

Hay una **página por edición** en `/panel/admin/evento/:id` (botón "Gestionar" en cada
tarjeta de la pestaña Eventos), igual que `/panel/admin/user/:id` es la página por cuenta.
Las tablas `event_updates`, `event_documents`, `event_media` y `event_communications` ya
existían desde la cadena multievento, pero **no tenían dónde editarse**: solo se leían del
lado del inversionista. Eso es lo que se construyó.

Secciones de esa página:
- **Resumen**: capital registrado, presupuesto y % cubierto, documentos, evidencias,
  cobertura externa, avances y paquetes, más la **repartición fijo / riesgo** del capital.
  Todo **derivado**: se cuenta de lo que hay cargado, no se captura. Un número escrito a
  mano queda viejo en cuanto alguien agrega algo.
- **Cronología**: avances con fecha, fase y descripción.
- **Data room**: documentos por carpeta (Clubes, Estadio, Proveedores, Contratos de
  inversión, Finanzas, General), con **estatus** (en revisión → aprobado → firmado,
  cambiable desde la lista) y **visibilidad por modalidad**. Lo último importa: un
  contrato de participación a riesgo no tiene por qué verlo quien va a retorno fijo.
- **Evidencias**: misma tabla, carpeta `Evidencias`, con su propio formulario.
- **En medios**: cobertura de terceros, separada de "Noticias" (que son las propias).
- **Comunicaciones**: mensajes por edición y modalidad, con una casilla para **avisar en
  el momento**. El aviso sale por el despachador de notificaciones (no hay un segundo
  camino de envío) y **solo le llega a quien tiene una inversión en esa edición** y de esa
  modalidad. Verificado: un comunicado marcado "riesgo" le llegó al inversionista de
  riesgo y no al de fijo.
- **Inversiones**: quién tiene capital en la edición (lectura; se administra desde la
  cuenta de cada inversionista).

Detalles de implementación:
- Toda operación va **acotada por `event_id`**: borrar o cambiar el estatus de algo que
  pertenece a otra edición no hace nada y lo dice, en vez de responder "eliminado" sin
  haber eliminado.
- Los enlaces pasan por el mismo validador que las noticias: solo `http://` y `https://`
  (probado con un `javascript:`, rechazado).

Hecho después:
- [x] **CRUD de inversiones desde el admin** (sección "Inversiones" de la página por
  edición): alta, edición y baja, con validación de capital, porcentaje y fechas.
  **Una inversión por persona y edición** — dos filas del mismo par se pisan entre sí,
  porque el panel toma la primera activa. Todo acotado por `event_id`. Es lo que alimenta
  el retorno del inversionista y las cifras del resumen, así que era el hueco más grande
  que quedaba del lado operativo.

Pendiente de esta sección:
- [ ] **Roles por evento** (`event_admins` ya existe como tabla): admin por edición además
  del superadmin. Es un cambio al modelo de permisos y no conviene meterlo junto con todo
  lo demás sin haber desplegado nada todavía.
- [ ] **Sidebar "Sistema de Inversionistas"** en lugar de las tabs de iconos: es rehacer
  la navegación del admin completo, no una sección.
- [x] ~~**Directorio global de inversionistas**~~ **HECHO**: cada cuenta de la lista muestra
  su **capital sumado de todas las ediciones** y en cuáles participa. Antes solo se veía el
  monto de su ficha, que se queda corto en cuanto alguien invierte en más de un año.
- [x] ~~Finanzas por edición~~ **HECHO**: el comparativo trae ahora **retorno proyectado**
  (con la misma fórmula del panel del inversionista) e **ingreso proyectado** por edición,
  junto al capital, presupuesto y % cubierto.
- [x] ~~Subir archivos al data room y evidencias~~ **HECHO**: endpoint `/admin/upload-doc`
  (PDF, Word, Excel o imagen) y botón "Subir archivo" en ambos formularios. Si el nombre
  está vacío se rellena con el del archivo. Se siguen aceptando enlaces de Drive, y un
  `javascript:` se sigue rechazando.
