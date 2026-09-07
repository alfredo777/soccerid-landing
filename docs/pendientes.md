# Pendientes del panel

## Asistente de contenidos con IA — Anthropic Claude Haiku (IMPORTANTE)
Integrar **Claude Haiku** en el admin para **crear y modificar contenidos** de la
landing y del panel. El admin escribe una instrucción, elige **sobre qué elemento**
escribir/modificar, la IA genera una propuesta y el admin la **revisa/edita antes de
guardar** (siempre editable).

Casos de uso:
- **Redacción de noticias**: generar título, extracto y contenido; reescribir/mejorar,
  ajustar tono, traducir ES/EN.
- **Extracción de imágenes de notas**: dado el **URL de la nota original**, extraer la
  imagen principal (og:image) y las imágenes del artículo para usarlas en la noticia
  (combinar fetch/parse del HTML + IA para elegir/pie de foto).
- **Creación/modificación de CUALQUIER elemento de la landing y el panel**: ediciones
  (info, presentación ES/EN, stats, media), FAQ, textos de secciones, descripciones,
  comunicaciones, beneficios/paquetes, etc.
- **Admin define el objetivo**: seleccionar el elemento/sección + escribir la
  instrucción ("sobre este elemento, escribe/ajusta…") → propuesta → aplicar.

Arquitectura:
- **Proveedor**: Anthropic API con **Claude Haiku** (modelo `claude-haiku-4-5-20251001`).
  Requiere `ANTHROPIC_API_KEY` (guardar en `*.local.md` gitignored + env/Heroku).
- `lib/ai.js` server-side (SDK `@anthropic-ai/sdk` o fetch) con funciones por tarea
  (redactar noticia, reescribir, traducir, extraer/seleccionar imágenes, generar
  presentación de edición, etc.). **Antes de implementar, leer la skill `claude-api`**
  (model ids, params, streaming, tool use) — no codear de memoria.
- UI en admin: botón/panel **"Asistente IA"** por sección (drawer lateral, según
  preferencia): campo de instrucción + selector de elemento + vista previa editable +
  "Aplicar/Guardar".
- Seguridad/control: la IA **propone**, el admin **aprueba y edita**; registrar qué se
  generó. Manejar límites/costos y errores del API.
- Imágenes: la extracción puede subir la imagen elegida al uploader existente
  (`/panel/admin/upload` → S3).



## Panel estadístico del ADMIN (no para inversionistas)
- [x] ~~Mover "Distribución de inversionistas" (donut por categoría) fuera de la vista
  del inversionista~~ **HECHO**: se quitó de `views/panel/dashboard.hbs` (con su CSS).
  Los datos (`panel.donut`, `panel.distribution`, `panel.investorTotal`) se siguen
  calculando en `buildPanelData` y están listos para el panel del admin de abajo.
- [ ] Crear un **panel estadístico en el admin** con métricas del portafolio/edición:
  distribución de inversionistas por categoría (donut), capital captado vs objetivo,
  # inversiones por modalidad (fijo/riesgo), retornos proyectados, boletos vendidos /
  punto de equilibrio, documentos/estatus, accesos y códigos (uso), leads por estado.
- [ ] Respetar preferencia de UI (drawers) y ligarlo a la **edición activa** (multievento).

## Convención de UI (preferencia)
- **Preferir panel lateral (drawer) sobre lightbox/modal centrado.** Para ver/crear/editar,
  usar el drawer que sale de la derecha (ya existe el patrón). Reservar el lightbox
  solo para casos puntuales (p. ej. video en web si aplica).
- [ ] Revisar el **video tour**: hoy es lightbox en web / drawer en móvil → evaluar
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
- [ ] **Mandar el código al dueño** por email/SMS desde el mismo drawer (el canal SMS ya
  existe; ver Notificaciones e Invitaciones).
- [ ] Vista de timeline por dueño (hoy el orden cronológico se ve por código, en el
  historial de accesos).
- [ ] Cadena de más de un salto (si Y reparte a Z, hoy Z cuelga del dueño original, no
  de Y): requiere saber con qué código entró Z, y hoy es el mismo código.


## Presentación / Propuesta dentro del panel (inversionista)
- [ ] Agregar una sección **"Presentación"** (o "Propuesta 2027") en el panel del
  inversionista que reproduzca el contenido de la propuesta pública
  (soccerid.co/en/socceridcup2027) **como la presentación original**: qué es la CUP,
  evento (Tigres vs Cruz Azul, Houston, 27 mar 2027), estructuras de inversión
  (fijo / a riesgo), proyecciones e ingresos, punto de equilibrio, uso del capital,
  timeline, experiencia (ediciones 2023/24/25) y contacto.
- [ ] Reutilizar la **fuente de contenido existente** (`contents/cup_project_2027.json`
  y la vista `socceridcup-project2027`) para no duplicar; renderizarla con el estilo
  del panel (marca) y responsive.
- [ ] **La presentación PERTENECE a la edición** (es un atributo de cada edición, no
  global): cada edición 2023/2024/2025/2027 tiene su propia presentación/propuesta.
  Guardarla como parte del modelo de edición (campos de contenido ES/EN por edición).
- [ ] En el panel se muestra la presentación de la **edición activa**.
- [ ] **Editable** desde el admin junto con el resto de datos de la edición (ver
  sección "Ediciones" y "Multievento = ediciones").

## FAQ editable (inversionistas y patrocinadores)
Sección de **Preguntas frecuentes** en el panel, **editable desde el admin**,
segmentada por audiencia (inversionista / patrocinador / general).

Feature:
- [ ] Modelo `faqs`: `id`, `audience` (all|investor|sponsor), `question`, `answer`,
  `sort`, `is_active`, timestamps. (Opcional ES/EN.)
- [ ] Admin: CRUD en **drawer lateral** (agregar/editar/ordenar/activar).
- [ ] Panel del inversionista/patrocinador: sección "Preguntas frecuentes"
  (acordeón), filtrada por su audiencia.
- [ ] Semilla inicial con el contenido de abajo (basado en el admin y en
  soccerid.co/en/socceridcup2027). Marcar cifras como **ilustrativas**.

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
- [ ] Mismo "Editar perfil" para **patrocinadores** (hoy el drawer se arma para
  cualquier no-admin, falta revisar qué campos aplican).
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
- [ ] Que el inversionista elija **por tipo** qué quiere recibir (hoy la preferencia es
  por canal, no por tipo).
- [ ] Disparadores que faltan del mapa: cambio de estatus de un documento
  (revisión→aprobado→firmado), asignación de inversión creada/actualizada, cambio de
  fase del evento y recordatorio de fecha de entrega.
- [ ] Notificaciones **push** (requiere service worker; no está hecho).
- [ ] Bandeja de notificaciones para el admin (hoy las suyas viven en el log de
  "Enviadas", mezcladas con las que él mandó).


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

## Navegación y separación de secciones
- [ ] **"Calendario" y "Cronograma" (sidebar) van a la misma URL** (`/panel/calendario`)
  → parece que no funciona. Separar: Cronograma con su propia vista/ancla, o dejar una
  sola entrada "Calendario y cronograma".
- [ ] **"Estado del evento" está mezclado**: muestra el **cronograma** (que también está
  en Calendario y cronograma) + las **noticias**. Separar: dejar esa sección como
  **"Noticias"** (solo noticias) y que el cronograma viva únicamente en la sección de
  cronograma. Evitar duplicar el cronograma.

## Bugs / a revisar
- [ ] **"Ver todas" en noticias manda al Home del dashboard**, no al listado de
  noticias. Corregir el enlace "Ver todas ›" para que vaya a `/panel/noticias`.
- [ ] **El buscador (search) no funciona** (barra superior del panel). En vistas del
  inversionista filtra elementos `[data-searchable]` que no existen → no hace nada.
  Definir qué debe buscar (noticias, documentos, hitos, inversiones, secciones) y
  hacerlo funcional; en admin delega en `window.__pnSearch`.
  - [ ] **Indexar preferentemente el FAQ**: el buscador debe priorizar/mostrar
    resultados del FAQ (preguntas y respuestas) además de las secciones.
- [ ] **"Estado del evento" se ve vacío** (vista del inversionista, `/panel/noticias`).
  El centro no muestra tarjetas de noticias aunque el sidebar (Próximos hitos, Tu
  categoría) sí carga. Revisar: ¿hay noticias en esa BD?, ¿el listado filtra por algo
  (evento/edición) y no encuentra?, ¿o el template no renderiza cuando la lista viene
  poblada? Al ligar noticias a la edición activa, contemplar estado vacío con mensaje.

## Calendario ↔ Cronograma (unificados y editables)
- [ ] **El calendario no despliega nada** (`/panel/calendario`). Revisar: usa
  `config.focus.month/year` + tabla `events`; si no hay eventos ese mes/año se ve vacío.
- [ ] **Calendario y cronograma a la vez** (una sola fuente por fecha, mostrada como
  calendario Y como línea de tiempo). Ligar hitos ↔ actividades del calendario.
- [ ] **Cronograma = ETAPAS** (estructura macro). Las etapas son **dinámicas y
  editables**, NO un set fijo: se pueden **agregar, editar, reordenar y eliminar**
  (nombre, orden, estado, fechas). Vista **cronograma por etapas**.
  - (Las etapas por defecto Planeación→Negociación→Producción→Evento→Cierre son solo
    un punto de partida; cada edición puede tener sus propias etapas.)
- [ ] **Calendario = ACTIVIDADES por tipo** (además de las etapas): eventos, meetings,
  meet & greets, **junta de inversionistas**, prensa, **logística**, etc. Tipos de
  actividad configurables. Muestra todo lo que se haga, no solo las etapas.
  - [ ] Ampliar el select **"Tipo"** actual (Evento, Actualización, Patrocinio, Prensa,
    Partido) con más tipos: **Logística, Meeting, Meet & greet, Junta de inversionistas,
    Otro**.
  - [ ] Opción **"Otro"** → muestra un **campo de texto** (alert/input) para escribir el
    tipo personalizado y guardarlo con la actividad.
- [ ] **Todo editable desde el admin**: etapas (agregar/editar/orden/eliminar), tipos
  de actividad, actividades del calendario, fechas y estados.
- [ ] **"Agenda del partido" no es editable en el admin**: hoy la agenda del día del
  evento (Fan Fest, Apertura de Hospitality, Alfombra roja, Kickoff, etc.) viene de
  `contents/panel_config.json` (`matchAgenda`), no hay dónde editarla. Hacerla editable
  desde el admin (por edición).
- [ ] Estado vacío con mensaje; en multievento, filtrar por **edición activa** (cada
  edición tiene su calendario/cronograma).
- [ ] **Vinculación con Google Calendar** (el **API ya está habilitado** en Google Cloud;
  falta implementar). Alcance:
  - [ ] Sincronizar las **actividades del calendario del panel** con un calendario de
    Google (crear/actualizar/eliminar eventos; guardar `google_event_id` en la tabla
    de actividades para evitar duplicados).
  - [ ] Definir modo: **calendario de la organización** (service account con calendario
    compartido) y/o **calendario del usuario** (OAuth por inversionista para que agregue
    los hitos/actividades a su propia agenda).
  - [ ] Botón **"Agregar a mi Google Calendar"** por actividad/hito + opción de
    **suscripción** (iCal/ICS feed) como alternativa sin OAuth.
  - [ ] Credenciales: reutilizar el proyecto de Google ya creado (mismas
    `GOOGLE_CLIENT_ID/SECRET` del login, agregando el scope de Calendar) o una service
    account; guardar en `*.local.md` gitignored + env vars de Heroku. Se relaciona con
    la sección **"Login con Google (en pausa)"**.
  - [ ] Filtrar por **edición activa** y respetar tipos de actividad (etapas vs
    actividades) al exportar.

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
- [ ] Arrastrar para reordenar (hoy es con flechas, que funciona pero es más lento con
  muchas filas).
- [ ] Subir varias imágenes de golpe a la galería.
- [ ] Que la vista previa muestre también la versión en inglés (hoy previsualiza el
  español, que es el idioma principal).


## Multievento LIGADO a las ediciones (por año) — pedido de León
**Decisión (usuario): el admin multievento va ligado a las ediciones.** Una
**edición por año** es la **fuente única** que alimenta a la vez:
- la parte **pública** de la CUP (landing / timeline / página de la edición), y
- la parte del **inversionista** (portafolio: presupuesto, fase, avance, inversiones,
  documentos, comunicaciones, y **paquetes de inversión**).

Objetivo inmediato: llenar con **info real** las ediciones **2023 / 2024 / 2025** y
poner **2027** con info real + **paquetes de inversión reales**.

Modelo de datos (unificar/enlazar):
- [ ] Ligar `portfolio_events` ↔ `editions` por año/edición (una relación 1:1 por año,
  o consolidar en una sola entidad "edición" con campos públicos + de inversión).
  Regla: **una edición por año**; editar en un solo lugar impacta ambas vistas.
- [ ] Migrar los `portfolio_events` demo (Houston 2027 / Austin 2025 / Orlando 2024)
  a ediciones reales por año y agregar **2023**; marcar `is_demo=false` al cargar real.

Admin (ediciones):
- [ ] CRUD de **ediciones por año** con datos reales (2023/24/25 pasadas, 2027 activa),
  incluyendo los campos públicos (match, sede, fecha, banner, stats, media) y los de
  inversión (presupuesto, ingreso proyectado, fase, avance).
- [ ] **Paquetes de inversión** por edición (nuevo, sobre todo 2027): nombre, monto,
  modalidad (fijo/riesgo), % retorno, beneficios, cupo. (Confirmar si además hay
  paquetes de patrocinio.)
- [ ] Selector de **edición activa** en el panel del inversionista + secciones que
  respetan la edición seleccionada.

Resto del admin multi-evento (Fases 1, 2, 4, 6): sidebar "Sistema de Inversionistas",
secciones (Resumen, Inversiones, Cronología, Finanzas, Documentos, Evidencias, En
medios, Comunicaciones), roles por evento. (Fases 0, 3, 5 ya hechas.)
