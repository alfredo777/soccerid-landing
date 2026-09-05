# Panel de inversionistas — documentación

> Este documento describe **(A) el funcionamiento actual** del panel tal como está
> implementado en el código, y **(B) el diseño objetivo** ("Sistema de Inversionistas"
> multi-evento) que aparece en las capturas de referencia.
>
> **Todos los datos mostrados en las capturas y en las semillas son ficticios**
> (marcados como `DATOS DEMO`). Aquí se documenta el *comportamiento y la
> arquitectura*, no los valores de ejemplo.

---

# A. Funcionamiento actual

Sistema de **un solo evento** (SOCCER iD CUP 2027). No existe el concepto de
"portafolio de eventos": todas las tablas son globales y asumen un único evento.

## A.1 Stack y arranque

- **Node + Express + express-handlebars**, base de datos **PostgreSQL** vía **knex**
  (con `better-sqlite3` como dependencia opcional para local).
- El servidor arranca en `index.js` (`PORT` o 3000).
- `db/schema.js` → `init()` corre al arrancar: crea las tablas de forma
  **idempotente** (`ensureSchema`) y siembra datos demo (`seed`).
- Rutas del panel montadas en `routes/panel.js` bajo `/panel`.

## A.2 Autenticación (`lib/panelAuth.js`)

- Sesión **sin estado** con **JWT en cookie httpOnly** (`sid_panel`, 30 días).
  Sobrevive reinicios de dyno en Heroku.
- Contraseñas con **bcrypt**.
- **Invitación → activación**: el admin invita; se genera `invite_token`
  (válido 7 días); el usuario crea su contraseña en `/panel/activar/:token`.
- Middlewares:
  - `requireAuth` → adjunta `req.panelUser`; redirige a `/panel/login` si no hay sesión.
  - `requireAdmin` → además exige `role === 'admin'` (si no, 403 → `/panel`).
- **Roles actuales**: `admin` | `investor` | `sponsor`. No hay roles por evento
  ni "superadministración".

## A.3 Modelo de datos (`db/schema.js`)

Ninguna tabla tiene `event_id` — todo es global.

| Tabla | Rol | Campos clave |
|---|---|---|
| `users` | Inversionistas, patrocinadores y admin | `role`, `category` (tier), `amount`, `investment_type` (`fijo`\|`riesgo`), `status` (`invited`\|`active`\|`disabled`), `member_id`, overrides por cuenta (`advisor`, `benefits`, `return_rate`, `activations`), `notifications_seen_id` |
| `tiers` | Categorías | `key`, `role`, `label`, `color`, `bg`, `amount`, `count` (cupo), `benefits` (JSON), `sort` |
| `news` | Noticias | `tag`, `title`, `excerpt`, `body`, `image`, `date_label`, `size`, `featured`, `sort` |
| `events` | **Calendario** (día/mes/año) | `day`, `month`, `year`, `title`, `type`, `color`, `is_match` |
| `milestones` | Cronograma | `title`, `date_label`, `status` (`pendiente`\|`en_curso`\|`completado`), `owner`, `highlight`, `sort` |
| `notifications` | Comunicados | `title`, `body`, `audience` (`all`\|`investor`\|`sponsor`) |
| `user_documents` | Data room por usuario | `user_id`, `name`, `url`, `meta`, `ext`, `category` (`Legal`\|`Financiero`\|`Evidencia`\|`General`), `doc_date` |
| `capital_items` | Uso del capital | `label`, `budget`, `spent`, `note`, `source`, `sort` |
| `risks` | Matriz de riesgos | `title`, `level` (`alto`\|`medio`\|`bajo`), `mitigation`, `status` (`abierto`\|`monitoreo`\|`mitigado`), `sort` |
| `editions` | Ediciones públicas de la CUP | `year`, `status` (`past`\|`upcoming`\|`pause`), `data_es`/`data_en` (JSON), `sort` |
| `access_codes` | Códigos propuesta 2027 | `code`, `status` (`unused`\|`used`), `note` (`test`) |
| `leads` | Prospectos | `name`, `email`, `status` (`nuevo`\|`contactado`\|`cliente`\|`descartado`) |
| `access_log` | Registro de accesos 2027 | `code`, `lead_id`, `device_id`, `name`, `email`, `ip`, `user_agent`, `new_device` |
| `app_settings` | Clave-valor | `dashboard_config` (JSON), `notify_emails` |

## A.4 Panel del inversionista / patrocinador

Layout `views/layouts/panel.hbs` (sidebar + contenido). Los datos se ensamblan
en `buildPanelData(user)` (`routes/panel.js`).

**Páginas** (todas requieren sesión; si el usuario es admin, redirige a `/panel/admin`):

- `GET /panel` → `dashboard.hbs`: "Mi inversión / Mi patrocinio". KPIs, categoría,
  retorno proyectado, contador al partido, distribución (donut), ventas y punto de
  equilibrio, uso del capital, riesgos, etapa del proyecto.
- `GET /panel/noticias` y `GET /panel/noticias/:id` → listado y lectura de noticias.
- `GET /panel/calendario` → calendario del mes en foco + cronograma.
- `GET /panel/notificaciones` → comunicados dirigidos al rol; marca como leídas
  (actualiza `notifications_seen_id`).
- `GET /panel/documentos` → documentos del usuario agrupados por categoría.

### Cálculo del retorno (`lib/panelSettings.js` → `computeReturn`)

Replica la calculadora pública. Dos modalidades:

- **Fijo**: `retorno = monto × (1 + fixedRate/100)`. Etiqueta "Retorno fijo".
- **Riesgo (50/50)**: participación efectiva `= (monto / projectCost) × investorSplit/100`;
  utilidad del proyecto `= referenceAttendance × ticketPrice − projectCost`;
  tu utilidad `= utilidad × participación efectiva`. Etiqueta "Participación a riesgo".
- **Override por cuenta**: si `users.return_rate` está definido, sustituye el % calculado.

Los parámetros (`fixedRate`, `investorSplit`, `projectCost`, `ticketPrice`,
`referenceAttendance`, ventas, etapa, asesor, carpeta compartida, fecha del evento)
viven en `app_settings.dashboard_config` y se editan desde el admin. Los defaults
salen de `contents/panel_config.json` y `contents/cup_project_2027.json`
(se guardan en BD porque el FS de Heroku es efímero).

## A.5 Panel del admin (`GET /panel/admin`, `views/panel/admin.hbs`)

Un solo template con **tabs de iconos horizontales** (no sidebar). Secciones:

| Tab | Qué hace | Endpoints principales |
|---|---|---|
| **Usuarios** | Invitar inversionistas/patrocinadores, editar, reenviar invitación, eliminar | `POST /admin/invite`, `/admin/user/:id/update`, `/resend`, `/delete` |
| **Noticias** | CRUD de noticias + "compartir" como notificación (email) | `/admin/news`, `/admin/news/:id/update`, `/delete`, `/notify` |
| **Calendario** | CRUD de eventos del calendario | `/admin/event`, `/admin/event/:id/update`, `/delete` |
| **Cronograma** | CRUD de hitos + reordenar ▲▼ | `/admin/milestone`, `/admin/milestone/:id/move`, `/update`, `/delete` |
| **Categorías** | Editar tiers (nombre, color, monto, cupo, beneficios) | `/admin/tier/:id/update` |
| **Notificaciones** | Enviar comunicado (opcional email) segmentado por rol | `/admin/notify`, `/admin/notification/:id/delete` |
| **Ediciones** | CRUD de ediciones públicas de la CUP (ES/EN) | `/admin/edition`, `/admin/edition/:id/update`, `/delete` |
| **Códigos** | Generar/agregar códigos de la propuesta 2027 | `/admin/code`, `/admin/codes/generate`, `/admin/code/:id/status`, `/delete` |
| **Accesos** | Log de accesos (dispositivo/IP) de la propuesta 2027 (solo lectura) | — |
| **Prospectos** | Leads capturados; cambiar estado, correo individual/masivo | `/admin/lead/:id/status`, `/email`, `/delete`, `/admin/leads/email` |
| **Uso del capital** | CRUD de rubros presupuestado vs ejercido + reordenar | `/admin/capital`, `/admin/capital/:id/update`, `/delete`, `/move` |
| **Configuración** | Guardado **parcial por grupo** de `dashboard_config` (asesor, carpeta, evento, inversión, ventas, etapa, trazabilidad) | `/admin/settings/dashboard`, `/admin/settings/notify` |

Además:
- **Edición por cuenta**: `GET /panel/admin/user/:id` → página dedicada por usuario,
  con overrides (asesor, beneficios, % rendimiento, activaciones) y documentos.
- **Documentos por usuario**: `POST /admin/user/:id/document`, `/admin/document/:id/delete`
  (enlaces tipo Google Drive; categoría Legal/Financiero/Evidencia/General).
- **Subida de imagen** AJAX: `POST /admin/upload` (→ S3 si está configurado, si no local).
- **Vista previa** (admin ve el panel como usuario):
  - `GET /admin/preview/user/:id` → panel real de una cuenta.
  - `GET /admin/preview/:role` (`investor`\|`sponsor`) → usuario de ejemplo (tier de mayor monto).

**Patrón de UI**: formularios POST clásicos con redirect + flash por querystring
(`?type=ok|error&msg=...#hash`); toasts; confirmaciones inline; drawers para editar.

---

# B. Diseño objetivo — "Sistema de Inversionistas" (multi-evento)

Rediseño mostrado en las capturas. Cambia la arquitectura de **un evento** a un
**portafolio de eventos**, con navegación por **sidebar** y todo *scoped* a un
**"Evento activo"** seleccionable.

## B.1 Cambio de fondo: multi-evento

- Nueva entidad **evento de portafolio** (distinta del `events` de calendario actual).
- **Selector de "Evento activo"** + pills de eventos en la parte superior.
- Casi todas las tablas hijas pasan a llevar **`event_id`**.
- Cada evento tiene: título, subtítulo ("Caso demostrativo"), descripción,
  `is_demo` (badge `DATOS DEMO`), **sede** (nombre + ciudad/país), **fecha** + fase
  de esa fecha, **presupuesto/objetivo**, **fase actual** y **% de avance**.
- Fases del evento: **Planeación → Negociación → Producción → Evento → Cierre**.

## B.2 Distribución (layout)

- **Sidebar vertical** (marca "SISTEMA DE INVERSIONISTAS", badge "Superadministración",
  usuario abajo) en lugar de las tabs de iconos actuales.
- El layout `views/layouts/panel.hbs` **ya tiene** sidebar + mini-card de evento:
  buena base para reutilizar.

## B.3 Secciones del admin (sidebar)

| # | Sección | Contenido | Estado hoy |
|---|---|---|---|
| 1 | **Resumen** (Vista ejecutiva) | KPIs (capital registrado, presupuesto, documentos, cobertura externa) + barra de fases con % + "Últimos avances" + sede/fecha | ❌ No existe |
| 2 | **Inversionistas** | Directorio **global**; un perfil participa en varios eventos; capital total, estado | 🟡 Hoy "Usuarios" (sin agregado multi-evento) |
| 3 | **Inversiones** | Asignaciones **por evento**: modalidad, capital, retorno, entrega | ❌ No existe (hoy el monto vive en `users`) |
| 4 | **Cronología** | Feed de avances por evento: fecha + **fase** + título + descripción | 🟡 Existe "Cronograma" (`milestones`) global, sin fase ni descripción |
| 5 | **Finanzas** | Presupuesto, ingreso proyectado, retornos proyectados, cobertura de capital, **donut de modalidades** (fijo/riesgo) | 🟡 Existe "Uso del capital" (solo presupuestado vs ejercido) |
| 6 | **Documentos** (Data room) | Carpetas por evento: Clubes, Estadio, Proveedores, Contratos de inversión, Finanzas, General | 🟡 Hay `user_documents` sin carpetas por evento ni estatus |
| 7 | **Evidencias** | Fotos/videos/docs operativos por evento | ❌ No existe |
| 8 | **En medios** | Hemeroteca: cobertura de terceros (fuente + fecha) | ❌ No existe (distinto de "Noticias" propias) |
| 9 | **Comunicaciones** | Mensajes oficiales por evento y **modalidad**, con estatus | 🟡 Existe "Notificaciones" (audiencia por rol, sin evento/modalidad) |
| 10 | **Eventos** (Portafolio) | Crear/configurar cada evento (sede, fecha, fase, % avance, demo) | ❌ No existe |
| 11 | **Accesos** | Usuarios y permisos: **Superadmin**, **Admin por evento**, **Inversionista** con eventos asignados; "autorización en dos niveles" | 🟡 "Accesos" hoy = log de dispositivos 2027, no gestión de roles |

**KPIs del Resumen son derivados**, no se capturan:
- Capital registrado = Σ inversiones del evento (+ conteo).
- Documentos = conteo del data room del evento.
- Cobertura externa = conteo de "En medios".

## B.4 Vista del inversionista (por evento)

Filtrada por la **asignación del inversionista en el evento activo** y por su
**modalidad**. Existen **dos modos de previsualización** para el admin:

1. **Vista del inversionista** (modo de trabajo): encabezado "Vista del inversionista"
   con botón **"Asignar inversión"** y banda **"VISTA PREVIA · DATOS DEMO"** +
   "Salir de vista previa".
2. **Previsualización completa · Solo lectura**: encabezado de la sección
   (p. ej. **"Resumen"**), banda **"VIENDO COMO INVERSIONISTA"** con la etiqueta del
   perfil en formato `Perfil Demo · <plazo> · <modalidad>` (ej. "Plazo fijo · Retorno
   fijo" o "Participación a riesgo · Participación a riesgo"),
   toggle **"Vista inversionista"** arriba a la derecha y "Salir de vista previa".
   Replica exactamente lo que ve el inversionista dentro de la sección seleccionada.

> Comparado con el actual: hoy solo existe `GET /admin/preview/:role` y
> `/admin/preview/user/:id` (una sola previsualización, sin scope por evento ni
> alternancia de modos).

**Asignación de inversión** (nueva entidad: inversionista × evento). El modal
"Asignar / Editar inversión" (subtítulo: "Los cambios se guardarán para todos los
administradores y dispositivos autorizados") tiene estos campos exactos:

| Campo | Tipo | Notas |
|---|---|---|
| **Evento** | select | evento del portafolio |
| **Inversionista** | select | perfil (con su modalidad) |
| **Modalidad** | select | `Participación a riesgo` \| `Plazo fijo` (Retorno fijo) |
| **Capital invertido** | número (USD) | p. ej. 250000 |
| **Retorno (%)** | número | % pactado/estimado (ej. 50) |
| **Fecha de inversión** | fecha | ej. 28/08/2026 |
| **Fecha de entrega** | fecha | ej. 31/08/2027 |
| **Estado** | select | `Activa` (… otros por confirmar) |
| **Condiciones o notas** | textarea | ej. "participación variable 50–50 sobre utilidad neta; retorno ilustrativo con tope de 50% sobre el capital" |

En la lista de "Inversiones asignadas" cada fila muestra inversionista + modalidad,
capital, retorno, entrega, y acciones **Ver perfil / editar / eliminar**.

> ⚠️ **No perder el cálculo de inversión (A.4).** Este modal *captura* los datos por
> asignación, pero la lógica de cálculo actual de `lib/panelSettings.js`
> (`computeReturn`) debe conservarse y alimentarse desde aquí, no reemplazarse:
> - **Retorno (%)** de este modal = hoy el override `users.return_rate` (retorno
>   pactado/estimado explícito). Debe seguir teniendo prioridad sobre el % calculado.
> - **Plazo fijo**: `total a recibir = capital × (1 + retorno%/100)` — igual que la
>   rama `fijo` actual.
> - **Participación a riesgo**: el retorno mostrado sigue la fórmula 50/50 sobre la
>   utilidad del evento (utilidad = asistencia×boleto − presupuesto; participación
>   efectiva = capital/presupuesto × split), con el **tope** indicado en notas. El
>   **simulador** (B.4) es la versión interactiva de esa misma fórmula, ahora con
>   parámetros por evento en vez de globales.
>
> En corto: la migración mueve *dónde viven* los parámetros (de `dashboard_config`
> global a la asignación por evento), pero **la fórmula de retorno es la misma** y no
> debe romperse.

**El render cambia según la modalidad:**

| | Retorno fijo | Participación a riesgo |
|---|---|---|
| Subtítulo | "Retorno fijo conforme al contrato individual" | "Participación variable ligada al desempeño" |
| KPI 2 | **Rendimiento pactado** (monto + %) | **Retorno estimado** |
| KPI 3 | **Total a recibir** | **Total proyectado** |
| Bloque medio | Aviso 🛡️ "Tu retorno no cambia con la asistencia" | "Desempeño del evento" (presupuesto / ingreso proyectado / avance operativo) |
| **Simulador** | **No aparece** | **Sí** — "Escenario por asistencia" |
| Data room | filtrado por perfil | filtrado por perfil |

**Simulador (solo "a riesgo")** — "Escenario por asistencia", parámetros por evento:
- Slider de **asistentes**.
- Boleto promedio, **deducciones %**, **rebate por asistente**, **tope %** sobre capital.
- Calcula: **ingreso neto estimado**, **utilidad del evento** (= ingreso neto −
  presupuesto), **retorno estimado del perfil** (participación sobre la utilidad,
  **limitado por el tope**).
- Nota: "ejercicio ilustrativo; el retorno está sujeto al contrato y tiene un tope".

  *Ejemplo demo (ilustrativo):* boleto $100, deducciones 15%, rebate $5/asistente,
  tope 50% del capital, slider en 15,000 asistentes → ingreso neto 1,350,000,
  utilidad del evento 350,000, retorno del perfil 125,000 (= 50% de un capital de
  250,000, es decir el tope). El **retorno estimado del KPI** coincide con el
  `retorno_pct` de la asignación (50%), reforzando que el cálculo pactado manda
  y el simulador solo ilustra el escenario.

**Data room del inversionista** — cada documento:
- Carpeta (Clubes / Estadio / Evidencias / Finanzas / General / Contratos de inversión / Proveedores).
- **Estatus**: `En revisión` | `Aprobado` | `Firmado`.
- **Visibilidad por inversionista** (distintos perfiles ven distinto número de docs).

**Comunicaciones "para mí"**: título + fecha + estatus (`Activo` | `Concluido`),
segmentadas por perfil/modalidad.

**En medios / Cobertura externa**: título + fuente + fecha (contenido de terceros).

## B.5 Resumen de brechas (qué falta construir)

**Nuevas entidades / columnas:**
- `events` de **portafolio** (título, subtítulo, descripción, sede, ciudad/país,
  fecha, fase de fecha, presupuesto, fase actual, % avance, `is_demo`) — o extender
  el `events` actual separándolo del calendario.
- `investments` (usuario × evento): `modalidad`, `capital`, `retorno_pct`,
  `fecha_inversion`, `fecha_entrega`, `estado` (Activa…), `notas`, + parámetros de
  simulador para "a riesgo" (boleto, deducciones %, rebate, tope %). **`retorno_pct`
  hereda el rol del actual `users.return_rate`; conservar `computeReturn` (ver A.4).**
- `event_progress` / `avances` (cronología: fecha, fase, título, descripción, `is_demo`).
- `event_documents` (data room por evento con carpeta + estatus + visibilidad por inversionista).
- `event_media` ("En medios": fuente, fecha, enlace).
- `event_communications` (por evento + modalidad + estatus).
- Roles/permisos: `superadmin` + `admin` por evento + asignación de eventos por usuario.
- **`event_id`** en las tablas hijas relevantes.

**Cambios de UI:**
- Migrar el admin de tabs de iconos a **sidebar** + selector de evento activo.
- Vistas nuevas: Resumen, Inversiones, Evidencias, En medios, Portafolio de Eventos,
  gestión de roles en Accesos.
- Vista del inversionista por evento con simulador y data room con estatus.

## B.6 Progreso a conservar (no perder)

Estas piezas actuales **no aparecen en las capturas pero deben quedarse** — son de
operación real, no del mockup:

- **Ediciones** (CUP pública), **Códigos 2027**, **Prospectos/Leads**,
  **Accesos (log de dispositivos)**, **Categorías/Tiers**, **Noticias**,
  **Configuración del dashboard**, matriz de **Riesgos**.

Recomendación: el diseño objetivo sería el **panel por evento**, y estas piezas
quedarían en un grupo aparte del sidebar (p. ej. "Superadmin / Sitio público")
para no perderlas.

---

## B.7 Alcance prioritario según el stakeholder (León Rangel, superadmin)

> Feedback directo (5 sep 2026): "lo único que le falta a lo nuestro es la
> **diferenciación entre lo que ve un riesgo y un fijo**, y **poder tener otras
> ediciones** para poner las pasadas o una demo para enseñar."

Es decir, en la visión del stakeholder **lo nuestro ya cubre casi todo**; el MVP se
reduce a **dos entregables**:

> 🔒 **Restricción dura (no negociable):** el dashboard sigue usando **nuestra
> calculadora de fijo y riesgo** (`computeReturn` en `lib/panelSettings.js`). La
> diferenciación de vistas y el multi-evento se construyen *encima* de ella; **no se
> reemplaza ni se recalcula el retorno por otro lado**. Fijo = `monto × (1 +
> fixedRate/100)` (o `return_rate` por cuenta). Riesgo = participación efectiva sobre
> la utilidad del evento con tope. El simulador solo ilustra esa misma fórmula.

### Prioridad 1 — Diferenciar la vista de "riesgo" vs "fijo"

Estado real en código: **parcial**. `computeReturn` ya separa los números y
`dashboard.hbs` distingue algo (líneas ~183-190, ~236-241), pero falta separar las
vistas de verdad:

- [ ] **Fijo**: ocultar "Venta en taquilla" / sensibilidad del evento; mostrar el
      aviso "Tu retorno no cambia con la asistencia"; KPIs "Rendimiento pactado" y
      "Total a recibir".
- [ ] **Riesgo**: mostrar "Desempeño del evento" + **simulador "Escenario por
      asistencia"**; KPIs "Retorno estimado" y "Total proyectado".
- [ ] Reutilizar `computeReturn` sin cambiar la fórmula (ver A.4 / B.4).

### Prioridad 2 — Múltiples ediciones/eventos (pasadas + demo)

Estado real en código: **falta** (el panel es single-event).

- [ ] Poder crear/administrar **varios eventos** (activo, pasados, y uno **demo**
      para enseñar), con selección de evento activo.
- [ ] Marcar eventos como **demo** (badge `DATOS DEMO`) para presentación.
- [ ] (Alcance mínimo: no requiere aún todas las secciones nuevas de B.3; basta con
      poder alternar entre eventos y que la vista del inversionista respete el evento.)

> El resto de secciones nuevas de B.3 (Evidencias, En medios, Data room por carpetas
> con estatus, roles por evento, etc.) quedan como **mejoras posteriores**, no como
> bloqueo del MVP definido por León.

---

## B.8 Convención de UI: crear/editar en panel lateral derecho (drawer)

**Requisito transversal:** las acciones de **crear/agregar/editar** NO deben aparecer
como formularios expuestos dentro de las vistas de información. Deben abrirse en un
**panel lateral colapsable que se desliza desde la derecha** (drawer), y las páginas
de listado/consulta quedan limpias (solo datos + un botón "+ Nuevo…" / editar).

- **Base ya existente:** `views/panel/admin.hbs` ya define ese patrón en `.ad-modal`
  / `.ad-modal__card` (overlay + tarjeta a la derecha con `transform: translateX(100%)`
  → `translateX(0)` al abrir, scroll interno, cierre por ✕ o clic en overlay). Se
  **reutiliza**, no se crea de cero.
- **Cambio pendiente:** hoy varias secciones (Usuarios, Noticias, Calendario,
  Cronograma, Uso del capital) muestran el formulario **inline a la izquierda** junto
  al listado (`.ad-grid` = form + lista). Esos formularios de alta deben **moverse al
  drawer** disparado por un botón, dejando la vista solo con información.
- **Aplica a todo el panel nuevo:** Asignar/Editar inversión, alta de avances
  (Cronología), documentos del data room, medios, comunicaciones, eventos del
  portafolio y accesos → todos vía drawer derecho.

- [ ] Mover formularios de alta inline actuales a drawer derecho.
- [ ] Usar el mismo drawer para todas las secciones nuevas (crear y editar).
- [ ] Vistas de info sin formularios expuestos (solo datos + botón de acción).
