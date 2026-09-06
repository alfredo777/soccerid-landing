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
- [ ] **Mover "Distribución de inversionistas" (donut por categoría) fuera de la vista
  del inversionista** → es info del negocio, solo para el **admin**. Hoy se muestra en
  el dashboard del inversionista (`views/panel/dashboard.hbs`); quitarla de ahí.
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
- [ ] En **"Ver como inversionista"** poder **elegir modalidad**: ver como **Fijo** o como **Riesgo**.
  Hoy `/panel/admin/preview/investor` usa un usuario de ejemplo que cae en `fijo` por defecto.
  Propuesta: `?modality=fijo|riesgo` (o un toggle) para previsualizar cada render
  (fijo = aviso "tu retorno no cambia"; riesgo = desempeño + simulador).

## Login con Google (en pausa)
- [ ] Desplegar cuando el **admin esté listo con las invitaciones**.
- [ ] Flujo de invitación: registrarse **con Google o con contraseña** (verificando el email); cuenta predefinida por la invitación.
- [ ] Reactivar env vars en Heroku (`GOOGLE_CLIENT_ID/SECRET`, valores en `google-keys.local.md`) + publicar la pantalla de consentimiento.

## Códigos: asignación a personas + mapa de relaciones
Para los **códigos de la propuesta 2027** (página pública `/es/socceridcup2027`).
Cada **código de acceso** se puede **asignar a una persona** y luego rastrear quién
lo usó realmente, para armar un **mapa de relaciones** (seguimiento de referidos).

Modelo de datos:
- En `access_codes` agregar **dueño/asignado**: `assignee_name`, `assignee_email`,
  `assignee_phone` (email y/o teléfono, o ambos) y uno o varios **tags**
  (ej. "León", "Arda", "Marcos", "cliente", "prensa"). Tabla `code_tags` o campo
  JSON de tags.
- `access_log` ya guarda nombre/email/IP/dispositivo por cada entrada. Al registrar
  un acceso, **marcar si coincide con el asignado original** o es **otra persona**
  (`matched_owner` boolean) → así sabemos si entró el dueño o alguien más con su código.

Funcionalidad:
- Vista de cada código: a quién se asignó (tag/persona) + lista de quiénes entraron
  y si eran el dueño o "otra persona" (posible referido/reenvío).
- **Mapa de relaciones gráfico**: nodo = persona/código; aristas = "el código de X
  lo usó Y". Visualizar como **mapa mental / grafo de red / timeline** de accesos.
  (Opciones de render: D3 force-graph, vis-network, o un timeline por código.)
- Sirve para seguimiento: ver la difusión (quién invita/reparte a quién) y priorizar
  contactos.

Relación con lo existente: se apoya en `access_codes`, `access_log` y `leads`
(propuesta 2027).

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

## Editar perfil de inversionista (autogestión)
Que el inversionista pueda editar su propio perfil desde el panel (en **drawer lateral**):
- [ ] **Cambiar idioma** (es / en) — preferencia de idioma del panel.
- [ ] **Cambiar contraseña** (pide contraseña actual + nueva; usa bcrypt existente).
- [ ] **Número de celular extra** (además del principal).
- [ ] **Email extra** (además del principal).
- [ ] **Email de asistente**.
- [ ] **Teléfono de asistente**.
- [ ] **Activar/desactivar notificaciones por email** y **por SMS** (preferencias de canal).

Modelo de datos (columnas nuevas en `users`):
`language`, `phone`, `phone_extra`, `email_extra`, `assistant_email`, `assistant_phone`,
`notify_email` (bool), `notify_sms` (bool).

Notas:
- Las **preferencias de canal** se conectan con la sección de Notificaciones (respetar
  `notify_email`/`notify_sms` al enviar) y con SMS (Twilio).
- El **idioma** debe integrarse con el sistema de idioma existente del sitio (es/en).
- Emails/teléfonos extra y de asistente pueden ser **destinatarios adicionales** en
  invitaciones/notificaciones/envíos.
- Considerar el mismo "Editar perfil" para **patrocinadores**.

## Notificaciones (mejora + mapa de dónde se necesitan)
Ampliar el sistema de notificaciones (hoy: tabla `notifications`, audiencia
all/investor/sponsor, badge in-app + email opcional) para cubrir **actividad,
envíos, documentos, posts, códigos**, con **canales** (in-app / email / SMS / push)
y notificaciones **directas** a un inversionista o patrocinador específico.

Mapa de eventos → a quién notificar → canal sugerido:

| Evento (disparador) | Destinatario | Canal |
|---|---|---|
| **Actividad / avances** (nuevo hito o avance en cronología, cambio de fase del evento) | Inversionistas/patrocinadores del evento | in-app + email |
| **Envíos** (invitación enviada, código enviado, correo/SMS entregado o fallido) | Admin (confirmación) + destinatario | in-app (admin) / email · SMS al destinatario |
| **Documentos** (nuevo doc compartido; cambio de estatus revisión→aprobado→firmado) | Inversionista/patrocinador dueño del doc | in-app + email |
| **Posts / Noticias** (nueva noticia publicada o compartida) | Audiencia (todos/inversionistas/patrocinadores) | in-app + email opcional |
| **Códigos 2027** (código usado, nuevo acceso, **acceso de otra persona** distinta al dueño → referido) | Admin (seguimiento) | in-app + email (resumen) |
| **Inversión** (asignación creada/actualizada, retorno/fecha de entrega próxima) | Inversionista de esa inversión | in-app + email |
| **Comunicaciones oficiales** por evento/modalidad | Segmento (fijo/riesgo/todos) | in-app + email |

Directas (1 a 1):
- [ ] **Notificación directa a un inversionista** específico (desde el admin o desde su cuenta): mensaje dirigido, con canal elegible (in-app/email/SMS).
- [ ] **Notificación directa a un patrocinador** específico, igual.
- [ ] Requiere `notifications` con `user_id` (destinatario individual) además de `audience`.

Base a construir:
- [ ] Modelo: `notifications` con `type` (actividad/envio/documento/post/codigo/inversion/directa),
  `user_id` opcional (directa), `event_id` opcional, `channel` (in-app/email/sms).
- [ ] **El canal email DEBE usar el mailer existente** (`lib/panelMailer.js`, nodemailer/SMTP-Mailgun);
  no crear otro envío de correo aparte. Reutilizar/añadir plantillas ahí.
- [ ] Preferencias por usuario (qué canales acepta) — opcional fase 2.
- [ ] Canal **SMS/push** depende de proveedores (ver sección de invitaciones SMS).

## Invitaciones por SMS + Email (diseño personalizado)
Poder enviar invitaciones **por SMS y por email**, con **diseño personalizado**
(plantilla de marca), en dos flujos:
- **Códigos de la propuesta 2027**: mandar el código de acceso por **SMS y/o email**.
- **Inversionistas**: mandar la invitación (activación de cuenta) por **SMS y/o email**.

Detalles:
- **Email**: ya existe envío vía nodemailer (`lib/panelMailer.js`, SMTP/Mailgun).
  Falta una **plantilla HTML de marca** personalizada (logo, colores SOCCER iD,
  botón CTA) para invitación de inversionista y para código 2027.
- **SMS**: es **nuevo** → requiere proveedor (p. ej. **Twilio**) + credenciales
  (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_FROM`). Guardar en `*.local.md`
  gitignored + env vars. Falta que el usuario dé la cuenta/credenciales.
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
- [ ] En **"Publicar noticia"** (admin) agregar campo **URL de la nota** (enlace al artículo original).
- [ ] En la nota (panel/vista) mostrar un enlace **"Ver original"** que abra en **pestaña nueva** (`target="_blank"` + `rel="noopener"`).
- [ ] Requiere columna nueva en `news` (p. ej. `source_url`) + campo en el form de alta/edición.

## Videos
- [ ] **Voz natural** en los videos (hoy voz offline provisional). Falta elegir proveedor + API key (ElevenLabs / OpenAI / Google TTS). Al tenerla se regeneran y se reemplazan los archivos.

## Ediciones: hacer el alta/edición más intuitiva
El formulario actual de ediciones (admin "Ediciones") es poco intuitivo: usa
**textareas con formato de tubería** (`valor | etiqueta | sub`, una por línea) para
stats, sponsors, media, videos e imágenes, y URLs pegadas a mano. Mejorar UX:

- [ ] Reemplazar los textareas "a | b | c" por **filas repetibles** (campos separados
  por ítem, con botones **+ Agregar** / eliminar y reordenar).
- [ ] **Subir imágenes** (banner, galería, sponsors) con el uploader existente
  (`/panel/admin/upload` → S3) en vez de pegar URLs.
- [ ] **Pestañas ES / EN** claras (ya existen) + indicar qué campos son compartidos vs
  por idioma.
- [ ] Placeholders/ayudas y validación (año, estado past/upcoming/pause).
- [ ] **Previsualización** de la edición antes de guardar.
- [ ] Todo en **drawer lateral** (según preferencia de UI) en vez de formulario denso.
- [ ] Alinear con la unificación "multievento = ediciones" (mismos campos alimentan
  público + inversionista; ver sección de multievento).

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
