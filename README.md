# Nick System — Backend

API REST Express 4 + MySQL (`mysql2`) en ESM. Es la fuente de verdad de los endpoints: los **controllers** definen los shapes de request/response.

Despliegue en Render (`render.yaml` + `Dockerfile`, Node 20 Alpine).

> Documentación general del proyecto (ambos proyectos) en [`../README.md`](../README.md).
> Frontend en [`../Nick System Frontend`](../Nick%20System%20Frontend).

---

## Requisitos

- Node.js 20+
- **pnpm siempre** (nunca npm). El `pnpm-lock.yaml` es la fuente autoritativa; los `package-lock.json` residuales están obsoletos.
- MySQL local (XAMPP/MariaDB): usuario `root`, sin contraseña, **puerto 3307**.

---

## Puesta en Marcha

```bash
pnpm install
pnpm dev       # nodemon src/server.js (puerto 4000)
pnpm start     # producción
node --check src/<archivo>.js   # verificar sintaxis sin ejecutar
```

Crear la base de datos:

```bash
mysql -u root -p nicksystemlocal < database/schema.sql
```

> `database/schema.sql` usa `CREATE TABLE IF NOT EXISTS`. Si existiera un dump de producción, se restaura directamente.

- Frontend: http://localhost:5173
- Backend API: http://localhost:4000
- Health check: http://localhost:4000/health

---

## Variables de Entorno (`.env`)

`DATABASE_URL` y `JWT_SECRET` hacen que el servidor **no arranque** si faltan.

```env
PORT=4000
NODE_ENV=development
TRUST_PROXY=1
DATABASE_URL=mysql://root@localhost:3307/nicksystemlocal
JWT_SECRET=tu_clave_secreta
JWT_EXPIRES_IN=1d
TICKET_CODIGO_SECRET=
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=Nick System <soporte@nicksystem.com>
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173
RESEND_WEBHOOK_SECRET=
WHATSAPP_TOKEN=
WHATSAPP_PHONE_NUMBER_ID=
WHATSAPP_VERIFY_TOKEN=
WHATSAPP_APP_SECRET=
WHATSAPP_GRAPH_VERSION=v25.0
WHATSAPP_CONVERSACION_MINUTOS=30
WHATSAPP_INTENTOS_MAXIMOS=2
WHATSAPP_CONSULTA_TICKET_DIAS=90
WHATSAPP_MENSAJES_DIAS=7
TICKET_EMPRESA_CORREO=G
TICKET_EMPRESA_WHATSAPP=WhatsApp
TICKET_URGENCIA_TELEFONO=
TICKET_URGENCIA_EMAIL=
TICKET_NOTIFICACION_EMAIL=
WARMUP_URL=
WARMUP_MINUTOS=10
WARMUP_HORARIO=08:00-22:00
```

| Variable | Notas |
|---|---|
| `PORT` | Puerto del servidor (default 4000) |
| `NODE_ENV` | `development` hace el CORS permisivo y activa logs |
| `DATABASE_URL` | URI de pool mysql2 (**obligatoria**) |
| `JWT_SECRET` | Clave para firmar tokens (**obligatoria**) |
| `JWT_EXPIRES_IN` | Expiración del token (`1d`, etc.) |
| `TICKET_CODIGO_SECRET` | Clave del HMAC con el que se genera el código público del ticket. Si se deja vacía cae a `JWT_SECRET`, así que no es obligatoria. En Render se genera sola |
| `RESEND_API_KEY` | API key de Resend (envío de emails) |
| `EMAIL_FROM` | Remitente de los emails |
| `FRONTEND_URL` | URL del frontend (se usa en los enlaces de seguimiento de los acuses) |
| `ALLOWED_ORIGINS` | Orígenes adicionales permitidos (separados por comas) |
| `RESEND_WEBHOOK_SECRET` | Signing secret del webhook de Resend. Vacía en dev (se omite la verificación); **obligatoria en producción** |
| `WHATSAPP_TOKEN` | Token de acceso de Meta Cloud API |
| `WHATSAPP_PHONE_NUMBER_ID` | ID del número de WhatsApp Business |
| `WHATSAPP_VERIFY_TOKEN` | Token que Meta exige al suscribir el webhook |
| `WHATSAPP_APP_SECRET` | App secret de Meta para validar `x-hub-signature-256`. Vacía en dev; **obligatoria en producción** |
| `WHATSAPP_GRAPH_VERSION` | Versión de la Graph API (usada en los envíos) |
| `WHATSAPP_CONVERSACION_MINUTOS` | Minutos que se espera la respuesta con los datos antes de volver a pedirla (default 30) |
| `WHATSAPP_INTENTOS_MAXIMOS` | Intentos fallidos que el cliente tiene antes de que se cree el ticket igual, con los valores por defecto (default 2). Evita el bucle infinito de "faltan datos" |
| `WHATSAPP_CONSULTA_TICKET_DIAS` | Ventana hacia atrás para buscar el ticket en "ya vieron mi caso" (default 90 días). Evita devolver un caso de hace meses |
| `WHATSAPP_MENSAJES_DIAS` | Días que se conserva el registro de idempotencia del webhook (default 7). Pasado ese plazo Meta ya no reintenta y la fila solo ocupa espacio |
| `TICKET_EMPRESA_CORREO` | `empresa_solicitante` por defecto cuando el correo viene de un proveedor gratuito (Gmail, Hotmail, etc.). Solo importa su inicial para el código |
| `TICKET_EMPRESA_WHATSAPP` | `empresa_solicitante` por defecto cuando el mensaje de WhatsApp no incluye empresa |
| `TICKET_URGENCIA_TELEFONO` / `TICKET_URGENCIA_EMAIL` | Contacto de urgencias que se agrega al acuse de ticket creado. Si ambos están vacíos, la línea no se incluye |
| `TICKET_NOTIFICACION_EMAIL` | Destinatarios del correo interno con el detalle de cada ticket entrante (separados por comas). Se dispara con **los dos canales de entrada**: correo y WhatsApp. **Vacía = no se envía nada**, o sea el ticket se crea y nadie se entera. En `render.yaml` está declarada con `sync: false`: hay que rellenarla a mano en el panel de Render |
| `WARMUP_URL` | Destino del ping de mantenimiento. Si se deja vacío se usa `RENDER_EXTERNAL_URL`, que Render define sola en producción |
| `WARMUP_MINUTOS` | Cada cuántos minutos se hace el ping (10). `0` lo desactiva |
| `WARMUP_HORARIO` | Franja horaria (hora de Lima) en la que se hace el ping, p. ej. `08:00-22:00`. Fuera de ella no se hace, para no gastar las 750 h/mes del plan gratis de Render |

Referencia completa en `.env.example`.

---

## Arquitectura y Código

### Capas

```
routes → validators → controllers → services → MySQL (pool)
```

Los controllers son la **fuente de verdad** de los shapes de request/response. La mayoría consulta el pool directamente; la capa `services` cubre `admin`, entidades, emails, WhatsApp y la ingesta de tickets.

### Estructura de `src/`

```
src/
├── config/
│   └── db.js                           # Pool de conexiones MySQL (mysql2)
├── routes/                             # Definición de rutas + middlewares
│   └── webhooks.routes.js              # /webhooks/resend/email y /webhooks/whatsapp
├── validators/
│   ├── validators.js                   # Validación genérica (lanza ValidationError → 400)
│   └── ticketValidators.js             # Validadores de tickets y esUUID()
├── controllers/                        # Fuente de verdad de request/response
│   ├── ticketsController.js            # Tickets + seguimiento público
│   └── webhooks.controller.js          # Handlers de Resend y Meta
├── services/
│   ├── ticketService.js                # crearTicket (genera el código), transiciones, COLUMNAS_TICKET
│   ├── ticketIngesta.service.js        # Parseo y alta de tickets entrantes
│   ├── acceso.service.js               # Quién puede ver cada reporte, ticket o gasto
│   ├── gastos.service.js               # CRUD de ticket_gastos
│   ├── health.service.js               # Preflight de MySQL para webhooks y /health
│   ├── warmup.service.js               # Ping de mantenimiento contra la URL pública
│   ├── email.service.js                # Resend: reportes y acuses
│   ├── whatsapp.service.js             # Meta Cloud API: envío + verificación de firma
│   ├── svix.service.js                 # Verificación de firma Svix (Resend)
│   └── resendInbound.service.js        # Descarga del email recibido
├── middlewares/                        # auth, role, error
├── app.js                              # Express, CORS, rawBody, montaje de rutas
└── server.js                           # Punto de entrada (escucha en PORT)
```

### Roles y autenticación

JWT en `Authorization: Bearer <token>`. Payload `{ id, uuid, role }`.

- `admin` — acceso total.
- `tecnico` — crear/editar sus reportes, ver clientes.
- `cliente` — ver sus reportes, aprobar/rechazar.

Dos estilos de protección:

- Router completo: `router.use(authMiddleware, roleMiddleware('rol'))` (admin, cliente, tecnicos).
- Por ruta individual (categorias, notificaciones).
- Evidencias solo exige `authMiddleware`, sin restricción de rol.

`validators.js` lanza `ValidationError`; el `errorHandler` de `error.middleware.js` la convierte en respuesta 400.

#### `req.user` trae la entidad resuelta

Además de `{ id, uuid, name, email, role }`, el `authMiddleware` cuelga la fila
del técnico o del cliente:

```js
req.user.tecnico = { id, uuid }   // rol tecnico
req.user.cliente = { id }         // rol cliente
```

El motivo es que el middleware ya hace un `LEFT JOIN` a `tecnicos` / `clientes`
para comprobar que la cuenta esté activa, así que la fila está ahí. **Usa
`req.user.tecnico` en vez de volver a llamar a `getTecnicoByUserId`**: repetirlo
costaba una query extra en cada request de todo el router (un alta de gasto eran
5 consultas donde bastaban 3).

`acceso.service.js` y `notificaciones.service.js` conservan el fallback a la
query para cuando `user` no trae la entidad, que es el caso de las llamadas que
no pasan por el middleware. Los guards de rol no cambian.

### Rate limiting

- Global (router `/`): 1000 requests / 15 min, excluye `/health`.
- `POST /auth/login`: 15 requests / 15 min (solo cuenta los fallidos).
- `PATCH /auth/password`: 10 requests / 15 min.
- `POST /notificaciones/reporte/:uuid/enviar`: 20 requests / 15 min.
- `GET /publico/tickets/:uuid`: 60 requests / 15 min (limitador propio).
- `PATCH /publico/tickets/:uuid/conformidad`: 10 requests / 15 min (limitador propio, más estricto porque escribe).

### Seguridad

- **Helmet** global.
- **Compression** global (se desactiva por request con `x-no-compression`).
- **CORS**: permisivo en desarrollo; en producción permite `nicksystem.com`, `www.nicksystem.com`, `localhost:5173` y los orígenes de `ALLOWED_ORIGINS`.
- **Graceful shutdown**: SIGTERM/SIGINT cierran server + pool.
- **Password hashing**: bcrypt, 10 rounds (máximo 72 caracteres, límite de bcrypt).
- **Sesiones revocables**: ver la sección de autenticación.
- **Auditoría de credenciales**: ver la sección de credenciales.
- **Errores de base de datos mapeados**: `responderError` (`error.middleware.js`) traduce `ER_DUP_ENTRY` → 409, `ER_DATA_TOO_LONG` → 400, `ER_NO_REFERENCED_ROW_2` → 400, etc. Los controllers lo usan en sus `catch` para que esas respuestas sí lleguen al cliente.
- **Webhooks**: firmados con `node:crypto` + `fetch` (sin dependencias extra). `app.js` captura el **cuerpo crudo** con `express.json({ verify })` porque la firma se calcula sobre los bytes originales. **No quitar ese `verify`.**

### Mantenimiento en segundo plano

`server.js` corre `limpiarConversacionesVencidas()` (`whatsappConversacion.service.js`) cada 15 minutos para que `whatsapp_conversaciones` no crezca sin control. El `setInterval` usa `unref()` y se cancela en el shutdown.

### Rutas montadas (sin prefijo `/api`)

`/auth`, `/admin`, `/tecnicos`, `/clientes`, `/categorias`, `/evidencias`, `/notificaciones`, `/publico`, `/webhooks`, `/health`.

> `/webhooks` se monta **fuera** del router con rate limit global y **no** lleva autenticación.

---

## Endpoints

### Autenticación

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/auth/login` | Público | Login, devuelve `{ token, user }` |
| GET | `/auth/me` | Autenticado | Usuario de la sesión actual |
| POST | `/auth/logout` | Autenticado | Revoca **todos** los tokens del usuario |
| PATCH | `/auth/password` | Autenticado | Cambia la contraseña propia (`{ password_actual, password_nuevo }`) y revoca los tokens |

### Sesiones revocables

El token lleva `sv` (`users.sesion_version`). Cada petición autenticada compara ese valor con el de la base:

- `POST /auth/logout`, `PATCH /auth/password`, el cambio de contraseña de un cliente/técnico y su inactivación incrementan `sesion_version` → todos los tokens previos dejan de servir.
- Si el técnico o el cliente está `inactivo`, el middleware responde **401** aunque el token no haya expirado.
- `authMiddleware` hace una consulta indexada por request (`users.id` + `users.uuid`); a cambio, un cambio de rol o un bloqueo surte efecto de inmediato.

### Admin (requiere rol `admin`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/admin/dashboard` | Estadísticas del sistema (reportes + tickets) |
| GET | `/admin/reportes` | Listar reportes (con filtros) |
| PUT | `/admin/reportes/:uuid` | Editar reporte |
| GET | `/admin/claves` | Listar credenciales (**queda auditado**) |
| GET | `/admin/claves/auditoria` | Registrar de consultas/ediciones de credenciales |
| POST | `/admin/claves` | Crear credencial |
| PUT | `/admin/claves/:id` | Actualizar credencial |
| DELETE | `/admin/claves/:id` | Inactivar credencial (soft delete) |
| PATCH | `/admin/claves/:id/restaurar` | Restaurar credencial |
| GET | `/admin/tecnicos` | Listar técnicos |
| GET | `/admin/tecnicos/:uuid` | Detalle de técnico |
| POST | `/admin/tecnicos` | Crear técnico (**password obligatorio**) |
| PUT | `/admin/tecnicos/:uuid` | Actualizar técnico (update parcial) |
| DELETE | `/admin/tecnicos/:uuid` | Inactivar técnico |
| PATCH | `/admin/tecnicos/:uuid/restaurar` | Restaurar técnico |
| GET | `/admin/clientes` | Listar clientes |
| GET | `/admin/clientes/:uuid` | Detalle de cliente |
| POST | `/admin/clientes` | Crear cliente |
| PUT | `/admin/clientes/:uuid` | Actualizar cliente (update parcial) |
| DELETE | `/admin/clientes/:uuid` | Inactivar cliente |
| PATCH | `/admin/clientes/:uuid/restaurar` | Restaurar cliente |

> `PUT /admin/clientes/:uuid` y `PUT /admin/tecnicos/:uuid` son **update parcial**: solo se escriben los campos enviados. Un body vacío responde 400.

### Categorías

El formulario del técnico usa un `datalist`: puede elegir del catálogo o escribir una nueva. Si el nombre no existe, el backend **crea la fila** en `categorias` dentro de la misma transacción y devuelve `categoria_creada: true`. Como el cotejo usa la collation `utf8mb4_unicode_ci`, escribir "servicio de backups" en minúsculas reutiliza la categoría existente y no duplica nada.

Esto evita el problema original (reportes con categorías que no existen en `categorias` y salen duplicadas/partidas en `/admin/reportes/por-categoria`). Para corregir o quitar las que se hayan creado por error: `GET/PUT/DELETE /categorias` y `PATCH /categorias/:id/restaurar`.

### Técnicos (requiere rol `tecnico`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/tecnicos/mi-perfil` | Perfil del técnico |
| GET | `/tecnicos/mis-reportes` | Listar mis reportes |
| GET | `/tecnicos/mis-estadisticas` | Estadísticas propias |
| POST | `/tecnicos/reportes` | Crear nuevo reporte (si la categoría no existe, **se crea automáticamente**) |
| PUT | `/tecnicos/reportes/:reporteUUID` | Editar mi reporte |
| POST | `/tecnicos/reportes/:reporteUUID/reenviar` | Reabrir y re-notificar: si estaba `no_conforme` vuelve a `por_confirmar` (limpia `aprobado_por`) y manda el correo |
| GET | `/tecnicos/clientes` | Listar clientes (para asignar reporte) |
| GET | `/tecnicos/mis-tickets` | Tickets asignados |
| PATCH | `/tecnicos/tickets/:uuid/iniciar` | Poner en proceso |
| PATCH | `/tecnicos/tickets/:uuid/atender` | Marcar atendido (nota opcional) |

> **El técnico no marca la conformidad.** `POST /tecnicos/reportes` ignora `cliente_conforme` y `aprobado_por` y siempre guarda `por_confirmar`; `PUT /tecnicos/reportes/:reporteUUID` los descarta del body. La conformidad solo la registra el cliente en `PATCH /clientes/reportes/:uuid/conformidad`.
>
> **Reabrir un reporte rechazado** es la única excepción: `POST /tecnicos/reportes/:reporteUUID/reenviar` pone un reporte `no_conforme` de vuelta en `por_confirmar`, limpia `aprobado_por` y envía la notificación al cliente. El técnico reabre la revisión, nunca la aprueba.

### Clientes (requiere rol `cliente`)

| Método | Ruta | Descripción |
|---|---|---|
| GET | `/clientes/mi-perfil` | Perfil del cliente |
| GET | `/clientes/mis-reportes` | Listar mis reportes |
| GET | `/clientes/reportes/:uuid` | Detalle de un reporte propio |
| PATCH | `/clientes/reportes/:uuid/conformidad` | Aprobar/rechazar (solo reportes activos) |

### Categorías

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/categorias` | Cualquier autenticado | Listar categorías |
| POST | `/categorias` | Admin | Crear categoría |
| PUT | `/categorias/:id` | Admin | Actualizar |
| DELETE | `/categorias/:id` | Admin | Inactivar |
| PATCH | `/categorias/:id/restaurar` | Admin | Restaurar |

### Evidencias (requieren auth, sin restricción de rol)

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/evidencias/reporte/:reporte_uuid` | Técnico, Admin | Subir evidencia (URL de Cloudinary) |
| POST | `/evidencias/reporte/:reporte_uuid/batch` | Técnico, Admin | Subir varias (`{ evidencias: [...] }`, máx. 50) |
| GET | `/evidencias/reporte/:reporte_uuid` | Autenticado | Listar evidencias del reporte |
| PUT | `/evidencias/:uuid` | Técnico, Admin | Actualizar evidencia (parcial, valida `url`/`tipo`/`descripcion`/`orden`) |
| DELETE | `/evidencias/:uuid` | Técnico, Admin | Eliminar (hard delete) |
| PATCH | `/evidencias/reporte/:reporte_uuid/reordenar` | Técnico, Admin | Reordenar (`{ orden: ["uuid1", ...] }`) |

Autorización: además de autenticado, el usuario debe ser propietario del reporte (el técnico dueño, el cliente dueño) o `admin`. Si no, responde **404** para no filtrar la existencia de reportes ajenos. Vive en `src/services/acceso.service.js`.

`PATCH .../reordenar` valida que la lista no tenga UUIDs repetidos, que todos pertenezcan al reporte y los deja en transacción. Las evidencias que no vengan en la lista se van al final, sin huecos.

### Notificaciones

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| POST | `/notificaciones/reporte/:uuid/enviar` | Tecnico, Admin | Email al cliente con el reporte (el técnico solo puede notificar reportes propios) |
| GET | `/notificaciones/verificar` | Admin | Verificar configuración de Resend |

> Si Resend falla la respuesta es **502** con un mensaje genérico: el detalle del proveedor solo queda en el log del servidor.

### Tickets (admin)

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/admin/tickets` | Admin | Listar tickets |
| POST | `/admin/tickets` | Admin | Crear ticket manual |
| GET | `/admin/tickets/:uuid` | Admin | Detalle de ticket |
| PATCH | `/admin/tickets/:uuid/asignar` | Admin | Asignar técnico (`{ tecnico_uuid }`) |
| PATCH | `/admin/tickets/:uuid/cancelar` | Admin | Cancelar ticket |
| PATCH | `/admin/tickets/:uuid/vincular-cliente` | Admin | Vincular/desvincular cliente (`{ cliente_uuid }` o `null`) |
| GET | `/admin/tickets/:uuid/gastos` | Admin | Gastos del ticket (**solo lectura**) |

Filtros de `GET /admin/tickets`: `estado`, `tecnico_uuid`, `cliente_uuid`, `sin_cliente=true`, `empresa`, `fecha_desde`, `fecha_hasta`.

### Tickets (técnico)

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/tecnicos/mis-tickets` | Tecnico | Tickets asignados |
| PATCH | `/tecnicos/tickets/:uuid/iniciar-servicio` | Tecnico | Marcar que el servicio ya empezó (`fecha_inicio_servicio`) |
| PATCH | `/tecnicos/tickets/:uuid/atender` | Tecnico | Marcar atendido (`{ nota }`) |
| GET | `/tecnicos/tickets/:uuid/gastos` | Tecnico | Listar gastos del ticket |
| POST | `/tecnicos/tickets/:uuid/gastos` | Tecnico | Registrar gasto (`{ concepto, detalle?, monto }`) |
| PUT | `/tecnicos/tickets/:uuid/gastos/:gasto_uuid` | Tecnico | Editar gasto |
| DELETE | `/tecnicos/tickets/:uuid/gastos/:gasto_uuid` | Tecnico | Borrar gasto |

Los gastos viven en `ticket_gastos` (`concepto`, `detalle`, `monto` en soles). **El rol `cliente` no puede verlos**: el backend los bloquea a propósito porque son coste interno. Solo el técnico asignado al ticket escribe; el admin solo lee.

**Se congelan al cerrar el ticket**: si `estado` es `atendido` o `cancelado`, agregar, editar y borrar devuelven **409** con *"El ticket está cerrado: los gastos ya no se pueden agregar, editar ni borrar"*. Se bloquean las tres operaciones y no solo el alta, para que el total que vio el cliente no pueda cambiar después de terminado el servicio. En la interfaz el bloque queda en solo lectura y muestra ese mismo aviso.

### Estados del ticket

```
pendiente → asignado → en_servicio → atendido
     ↘          ↘            ↘
                      cancelado
```

- `en_servicio` — **el técnico ya inició el servicio**. Sella `tickets.fecha_inicio_servicio` y aparece como cuarto hito en el seguimiento público.
- No hay un estado intermedio tipo "tomo el ticket, lo voy a mirar": si a un técnico se le asigna un ticket, lo tiene que hacer.
- **Marcar el inicio del servicio es obligatorio**: `atender` solo acepta `en_servicio`. Un `atender` desde `asignado` responde **409**, aunque el botón esté oculto en la interfaz. El único camino a `atendido` es pasando por `en_servicio`.
- `cancelado` se puede aplicar desde los tres estados no cerrados.
- **La nota de cierre es obligatoria** (`validarAtencion`): sin ella, o solo con espacios, devuelve 400 con *"Describe qué se hizo para poder cerrar el ticket: el cliente lo lee al confirmar el servicio"*. Es lo único que queda escrito del trabajo y lo lee el cliente al confirmar, así que no puede quedar en `NULL`. La interfaz marca el textarea como `required` y deshabilita el botón mientras esté vacío.

#### Si cambias un estado, toca estos sitios

Añadir un estado es fácil; quitarlo **rompe en silencio**. MySQL no da error al
hacer `MODIFY` de un ENUM si hay filas con el valor que se quita: las convierte a
`''`, y `''` no existe en el `ESTADOS` del frontend, así que `ESTADOS[estado].descripcion`
revienta y el portal público —la cara del cliente— se cae entero.

Para añadir:

1. `ENUM` en `schema.sql`.
2. `ESTADOS_TICKET` en `validators/ticketValidators.js` (valida el `?estado=` del admin).
3. `TRANSICIONES` en `ticketService.js`.
4. El `ORDER BY FIELD(...)` de `misTickets` (el orden de la lista del técnico).
5. `ESTADOS` en `estados.ts` del frontend (badge, filtro del admin y descripción del portal público).
6. `TicketEstado` en `core/types/index.ts`.
7. `COLUMNAS_TICKET` y el `SELECT` de `seguimientoPublico` si hay fecha nueva.

Para quitar: además de lo anterior, **mover primero las filas** que usen el valor
(`UPDATE tickets SET estado = 'asignado' WHERE estado = 'en_proceso'`), porque el
`MODIFY` no avisa.

### Paginación

Todos los listados aceptan `?pagina=N&por_pagina=M` (máx. 500). Cuando se usan, la respuesta trae `X-Total-Count`, `X-Page-Size` y `X-Page-Offset`. **Sin esos params el comportamiento es el de siempre**: se devuelve el listado completo (tope de seguridad 5000), así que el frontend existente no se rompe.

Se puede filtrar por texto con `?buscar=` en `/admin/clientes`, `/admin/tecnicos` y `/admin/claves`.

> **No quitar `exposedHeaders` del CORS** (`app.js`). El navegador solo expone a
> JavaScript las cabeceras CORS seguras, así que sin
> `exposedHeaders: ['X-Total-Count', 'X-Page-Size', 'X-Page-Offset']` esas tres
> cabeceras llegan al panel de red pero **no** a `response.headers`, y el frontend
> lee siempre `total = 0`. El síntoma es silencioso: los paginadores simplemente
> no se dibujan (pasó con el de la auditoría de claves, que se quedaba en 20
> filas sin forma de avanzar).

### Auditoría de credenciales

Cada lectura o escritura de `/admin/claves` deja una fila en `claves_auditoria` (`user_id`, `user_email`, `accion`, `ip`, `user_agent`, `created_at`). No bloquea la respuesta: si el insert falla solo se avisa por consola.

La tabla `claves` tiene `created_at` / `updated_at` (ver migración `002`). `/admin/claves` expone `updated_at` (columna "Último cambio" en el portal) pero **no** `created_at`.

### Webhooks (tickets entrantes)

Sin autenticación. Firmas verificadas con `node:crypto` + `fetch`.

| Método | Ruta | Descripción |
|---|---|---|
| POST | `/webhooks/resend/email` | Evento `email.received` de Resend. Firma Svix (`svix-id`, `svix-timestamp`, `svix-signature`) |
| GET | `/webhooks/whatsapp` | Verificación de Meta (`hub.mode=subscribe`, `hub.verify_token`, `hub.challenge`) |
| POST | `/webhooks/whatsapp` | Mensajes entrantes de Meta. Firma `x-hub-signature-256` (HMAC SHA-256 sobre el cuerpo crudo) |

Respuesta típica:

```json
{ "recibido": true }
```

- Duplicado o evento no soportado → `{ "recibido": false }`.
- En **producción**, si falta `RESEND_WEBHOOK_SECRET` o `WHATSAPP_APP_SECRET` responde **503**. En desarrollo se omite la verificación y se avisa por consola.

### Seguimiento público de tickets

```http
GET /publico/tickets/:identificador
```

Acepta **UUID** o **código de ticket** (`TK-AJ7ZQVQ`, o `TK-AJ0001` en los anteriores); se normaliza a mayúsculas.

### Confirmación del servicio por el cliente

```http
PATCH /publico/tickets/:uuid/conformidad
```

```json
{ "conforme": true, "aprobado_por": "Juan Perez" }
```

```json
{ "conforme": false, "aprobado_por": "Juan Perez", "motivo": "La impresora sigue sin imprimir" }
```

Sin autenticación (es público), pero con **limitador propio de 10 intentos / 15 min** y **solo acepta UUID**: el código `TK-...` es adivinable, así que da para leer el seguimiento pero no para escribir la conformidad.

Reglas:

- Solo aplica si el ticket está en `estado = 'atendido'`. Uno `cancelado` no se conforma.
- **Es irreversible.** El `UPDATE` exige `cliente_conforme = 'por_confirmar'`; si ya estaba confirmada responde **409** con un mensaje que remite a soporte para gestionarlo por otro canal.
- `aprobado_por` es **obligatorio**: como la respuesta no se puede editar, tiene que quedar escrito de una vez.
- `motivo` es **obligatorio cuando `conforme` es `false`** (máx. 500 caracteres) y se ignora cuando es `true`. Sin motivo, un "no conforme" no le sirve de nada al técnico.
- Marcar **no conforme** dispara un correo al personal con el motivo (`emailService.enviarAvisoNoConforme`). Si `TICKET_NOTIFICACION_EMAIL` está vacía no se envía nada.

Respuesta: `{ uuid, codigo, empresa_solicitante, nombre_solicitante, asunto, cliente_conforme, aprobado_por, motivo_no_conforme, fecha_conformidad }`.

### Health Check

```http
GET /health
```

Comprueba también MySQL: responde **200** si la base responde y **503** con `"status": "degradado"` si no. Eso hace que Render reinicie el servicio cuando se cae la base.

El mismo chequeo (`SELECT 1` con 8 s de timeout) se ejecuta como **preflight dentro de los dos webhooks**, después de validar la firma y antes de procesar. Si MySQL no responde el webhook devuelve **503** en vez de 500, para que el proveedor reintente la entrega en lugar de darla por perdida.

Aparte, `warmup.service.js` hace ping a `/health` cada `WARMUP_MINUTOS` (10) dentro de `WARMUP_HORARIO` (`08:00-22:00`, hora de Lima) para que la instancia no entre en suspension. El destino es `WARMUP_URL` o, si no se define, la URL pública que Render inyecta como `RENDER_EXTERNAL_URL` — un ping a `localhost` **no** mantiene viva la instancia, porque el sleep lo decide el tráfico que entra por el proxy de Render. Fuera del horario el ping se omite y el preflight es lo que absorbe el arranque en frío.

```json
{
  "status": "ok",
  "message": "Backend funcionando 🚀",
  "database": "ok",
  "environment": "production",
  "timestamp": "2026-01-15T10:30:00.000Z"
}
```

---

## Tickets Entrantes (WhatsApp y Correo)

Flujo: **webhook → parseo → `crearTicket` → acuse automático**. Todo en `src/services/ticketIngesta.service.js`.

### Código del ticket

```
TK-<inicial empresa><inicial cliente><5 caracteres>
TK-AJ7ZQVQ
```

El código **es una columna**: `tickets.codigo` (`VARCHAR(20)`, con `UNIQUE KEY`).

| Empresa | Cliente | Código |
|---|---|---|
| Acme | Juan Perez | `TK-AJ7ZQVQ` |
| G | Antonio Benavente | `TK-GA8CXWY` |

Los 5 caracteres salen de un **HMAC-SHA256 del `uuid`** con `TICKET_CODIGO_SECRET` (si falta, cae a `JWT_SECRET`), leyendo 25 bits y traduciéndolos con el alfabeto Crockford base32 (sin `I`, `L`, `O`, `U`, para que no se confundan con `1` y `0`). Se generan en `crearTicket`, en `ticketService.js`.

Se hizo así por dos razones:

- **No es adivinable.** Antes el sufijo era `LPAD(id, 4, '0')`, o sea `TK-AJ0001`, `TK-AJ0002`… consecutivos y recorribles con peticiones. Como el `GET /publico/tickets/:id` devuelve `aprobado_por` (el nombre que escribió el cliente) y `motivo_no_conforme`, eso permite leer el histórico de un cliente. Con el HMAC no.
- **Usa índice.** `WHERE codigo = ?` sobre el `UNIQUE KEY`, en vez de un `CONCAT(...)` que obligaba a escanear la tabla entera en cada consulta pública.

La colisión de código y la deduplicación de webhooks lanzan las dos `ER_DUP_ENTRY`, así que `crearTicket` distingue los dos casos antes de reintentar (hasta 5 intentos). Confundirlas haría que un ticket se perdiera en silencio.

#### Tickets que ya existían

Conservan su código antiguo (`TK-AJ0001`, 4 dígitos) para que no se rompan los que el cliente ya tiene anotados. Por eso el seguimiento público acepta los dos formatos:

```js
REGEX_CODIGO_TICKET = /^TK-[A-Z0-9]{2}(?:[0-9A-HJKMNP-TV-Z]{5}|[0-9]{4})$/i
```

El regex solo evita consultas inútiles: la columna es la fuente de verdad. El frontend replica el mismo patrón en `TicketSeguimiento.tsx`.

El `PATCH` de conformidad sigue aceptando **solo UUID**. La asimetría es a propósito: quien tiene el código no puede derivar el UUID, y el UUID es el token real (viaja en el enlace del correo y del WhatsApp).

### Interacción de WhatsApp

El canal de WhatsApp pide los cuatro campos (Empresa, Nombre, Asunto y **Descripción opcional**) y **crea el ticket en el mismo mensaje** en cuanto tiene los tres obligatorios:

| Situación | Qué hace el cliente | Qué hace el sistema |
|---|---|---|
| Sin datos | Escribe cualquier mensaje (ej. "hola") | Responde con `mensajeBienvenida()`. **No crea ticket** |
| Datos completos | Envía Empresa, Nombre y Asunto | Crea el ticket en el acto y responde con `mensajeTicketCreado()` (código + enlace) |
| Datos incompletos | Envía solo algunos campos, con la conversación ya abierta | Responde con `mensajeFaltanDatos(recibidos, faltantes)`, reconociendo lo que ya llegó |
| Consulta de estado | Escribe "ya vieron mi caso", "cómo va mi ticket", "nadie me contesta"… | Busca el último ticket de ese número y responde con `mensajeConsultaEstado(codigo, url)` |
| Consulta sin tickets | Lo mismo, pero sin tickets en la ventana | Responde con `mensajeSinTicket()` y abre la conversación |
| Audio, foto o documento | Manda algo que no es texto | Responde con `mensajeSinTexto(tipo)` y pide los datos escritos |
| Se agota la paciencia | Insiste sin poder con el formato | Crea el ticket igual con `TICKET_EMPRESA_WHATSAPP` y el nombre del perfil |

El estado pendiente se guarda en `whatsapp_conversaciones` (clave primaria = número, con `intentos`). La fila se borra al crear el ticket.

**Modo estricto vs. libre.** `interpretarMensaje(texto, { permitirLibre })` acepta dos niveles:

- **Estricto** (primera vez que escribe, sin conversación abierta): **solo** el formato con etiquetas. Sin él, "Hola, buenas tardes, mi PC no enciende" se convertiría en empresa="Hola" y crearía un ticket basura.
- **Libre** (ya recibió la bienvenida): además acepta el formato por comas y el de 3 líneas.

**Idempotencia del webhook.** Los reintentos de Meta duplicaban respuestas: el ticket queda protegido por `mensaje_externo_id`, pero los mensajes del bot no. La tabla `whatsapp_mensajes` (PK = `mensaje_origen`) registra cada `wamid` **justo antes** de responder, mediante `responder()`. Un reintento sale por `duplicado: true` sin escribir nada. `limpiarMensajesAntiguos()` borra esas filas a los `WHATSAPP_MENSAJES_DIAS`.

> El acuse del ticket usa la clave `acuse:<wamid>`: si el ticket se creó pero el acuse se perdió, el reintento lo recupera con `ticketPorMensajeExterno()` en vez de dejar al cliente sin código.

> **Trade-off del registro previo:** si el proceso muere entre registrar el `wamid` y enviar el mensaje, el reintento de Meta no lo recupera y el cliente queda sin respuesta. Se prefirió eso a duplicar mensajes, que es el defecto que se estaba reportando.

- **Ventana**: `WHATSAPP_CONVERSACION_MINUTOS` (default **30**). Vencida, el siguiente mensaje vuelve a pedir los datos desde cero.
- **Paciencia**: `WHATSAPP_INTENTOS_MAXIMOS` (default **2**). Pasados los intentos, el ticket se crea con valores por defecto en vez de seguir pidiendo.
- La consulta de estado solo se evalúa si el mensaje tiene ≤ `LARGO_CONSULTA_MAXIMO` (120) caracteres **y** no hay conversación abierta.
- `whatsapp_conversaciones` se depura con `limpiarConversacionesVencidas()` (mismo cron de 15 min en `server.js`).
- La búsqueda del ticket usa `ultimosTicketsPorContacto(contacto, { limite, dias })`, acotada por `WHATSAPP_CONSULTA_TICKET_DIAS`.

### Bitácora de webhooks

Cada mensaje entrante deja **una única línea**. Todas las salidas de consola llevan hora de **America/Lima** en formato `DD/MM/AAAA - HH:MM:SS`, precedida de `||`, porque `src/config/logs.js` parchea `console` al arrancar. Las PII van enmascaradas (`j***@acme.com`, `519****1064`).

```
|| 17/10/2026 - 02:08:11  [whatsapp] Mensaje de 519****1064 → respondí pidiendo los datos
|| 17/10/2026 - 02:08:32  [whatsapp] Mensaje de 519****1064 → creé el ticket TK-PA0001 y le devolví el código
|| 17/10/2026 - 02:09:13  [resend] Mensaje de a***@acme.com → ticket TK-AC0002 creado
|| 17/10/2026 - 02:09:13  [resend] Aviso interno del ticket TK-AC0002 → enviado a s***@nicksystem.com
|| 17/10/2026 - 02:09:14  [resend] Respuesta a a***@acme.com → le envié el acuse con el código TK-AC0002
```

Las líneas que emite `bitacora()` llevan el prefijo `[canal]`; el resto (errores, avisos, banners de arranque) no lo llevan. En Render la línea aparece con **dos** timestamps porque la plataforma antepone el suyo propio en UTC y no es configurable:

```
2026-10-17T07:08:11Z || 17/10/2026 - 02:08:11  [whatsapp] Mensaje de 519****1064 → ...
```

Canales: `whatsapp` (una línea por mensaje) y `resend` (tres: la entrada, el aviso interno y la respuesta al cliente).

Posibles desenlaces del canal `whatsapp`:

| Línea | Cuándo |
|---|---|
| `respondí pidiendo los datos (intento 1)` | Primer mensaje, sin datos suficientes → bienvenida |
| `faltan datos (intento 2)` | Mensaje siguiente, con la conversación abierta → `mensajeFaltanDatos()` |
| `2 intentos sin formato, creo el ticket igual` | Se agotó `WHATSAPP_INTENTOS_MAXIMOS` → ticket con valores por defecto |
| `le devolví el estado del ticket TK-XX0000` | Consulta de estado ("¿ya vieron mi caso?") con ticket previo |
| `preguntó por su caso pero no tiene tickets` | Consulta de estado sin tickets en la ventana |
| `llegó audio, le pedí que lo escriba` | Mensaje sin texto (audio, foto, documento…) |
| `reenvío de Meta, no respondí otra vez` | El `wamid` ya estaba en `whatsapp_mensajes` |
| `creé el ticket TK-XX0000 y le devolví el código` | Datos completos, ticket creado y acuse enviado |
| `creé el ticket TK-XX0000 pero el acuse falló: <motivo>` | El ticket se creó, el acuse no salió |
| `ese mensaje ya tenía un ticket` | Reenvío del mismo `wamid` con ticket ya creado |
| `falló la bienvenida: <motivo>` | No se pudo pedir los datos |

Posibles desenlaces del canal `resend`:

| Línea | Cuándo |
|---|---|
| `Mensaje de <correo> → ticket TK-XX0000 creado` | Entrada procesada |
| `Mensaje de <correo> → ese mensaje ya tenía un ticket` | Reenvío del mismo `email_id` |
| `Aviso interno del ticket TK-XX0000 → enviado a <destinatarios>` | Aviso al equipo entregado |
| `Aviso interno → omitido, TICKET_NOTIFICACION_EMAIL está vacía` | Notificación interna desactivada |
| `Aviso interno → no se pudo enviar: <motivo>` | Resend rechazó el aviso interno |
| `Respuesta a <correo> → le envié el acuse con el código TK-XX0000` | Acuse entregado |
| `Respuesta a <correo> → no pude enviar el acuse: <motivo>` | Resend rechazó el envío |
| `Respuesta a <correo> → sin remitente, no pude enviar el acuse` | El correo llegó sin dirección de retorno |

Fuera de esas líneas solo aparecen **errores**, por `console.error`: rechazos por firma inválida, secreto de webhook ausente en producción, errores de Meta/Resend, `5xx` con su método y ruta, `429` por rate limit y rechazos de token.

Mensajes enviados al cliente:

```
Buenas noches 👋 Te damos la bienvenida a *Nick System*.

Este canal es *solo para registrar tickets de soporte*. Aquí no se resuelven consultas técnicas.

Para crear tu ticket, envíame en un solo mensaje:

🏢 *Empresa:* nombre de tu empresa
👤 *Nombre:* tu nombre completo
📝 *Asunto:* resumen del problema o solicitud
📄 *Descripción (opcional):* detalles extra del problema

*Ejemplo:*
Empresa: Acme
Nombre: Juan Pérez
Asunto: Mi computadora no enciende desde esta mañana
Descripción: se queda con luz verde y no arranca

Recibirás un código y un enlace para seguir el estado de tu solicitud.
```

```
✅ *Tu ticket fue creado correctamente.*

🎫 Código: *TK-AJ7ZQVQ*

🔎 Consulta el estado aquí:
http://localhost:5173/ticket/<uuid>

Gracias por contactarnos.

🚨 Si es una *urgencia*, llámanos o escríbenos: 51987654321
```

```
Ya registramos tu ticket *TK-AJ7ZQVQ*. Puedes ver su estado aquí: http://localhost:5173/ticket/<uuid>

Si quieres crear una solicitud nueva, envíame Empresa, Nombre y Asunto.
```

```
⚠️ Recibí tu empresa y tu nombre.

Me falta:
• 📝 *Asunto:* resumen del problema o solicitud

Envíame los datos que faltan en un solo mensaje.
```

```
Recibí un *audio* pero por este canal solo puedo leer texto. ✍️

🏢 *Empresa:* nombre de tu empresa
👤 *Nombre:* tu nombre completo
📝 *Asunto:* resumen del problema o solicitud
📄 *Descripción (opcional):* detalles extra del problema
```

> El saludo se adapta a la hora de **America/Lima**: `Buenos días` (5–11), `Buenas tardes` (12–18), `Buenas noches` (19–4).
> La línea de urgencias solo aparece si hay `TICKET_URGENCIA_TELEFONO` o `TICKET_URGENCIA_EMAIL`.

### Parseo del mensaje de WhatsApp

`interpretarMensaje(texto, { permitirLibre })` acepta cuatro formatos. Los tres últimos solo cuando `permitirLibre` es `true` (es decir, cuando el cliente ya recibió la bienvenida):

```
Empresa: Acme
Nombre: Juan Perez
Asunto: Mi PC no enciende
```

```
Acme, Juan Perez, Mi PC no enciende
```

```
Acme
Juan Perez
Mi PC no enciende
```

```
Empresa: Acme
Nombre: Juan Perez
Asunto: Mi PC no enciende
Descripción: Solo pasa cuando hay luz verde y no arranca   ← campo opcional
Desde las 8am, ya probé en otro enchufe                       ← también sirve
```

**Fuente única de etiquetas.** `ALIAS_ETIQUETA` es el único lugar donde viven los nombres. El regex es genérico (`/\b([a-zA-Z...]{3,12})\s*(?::\s*|\s+[-=]\s+)/g`): matchea cualquier `palabra:` y `ubicarEtiquetas()` descarta las que no son alias. Consecuencias:

- `\b` evita que `username:` active `name:`.
- El separador exige `:` pegado o espacios alrededor de `-`/`=`, así `cliente-servidor` no activa `cliente:`.
- No hay una lista de nombres duplicada que pueda desincronizarse (antes estaba copiada en el regex, en `sinEtiquetas()` y en el mapa de alias).
- `mensaje`, `error` y `errors` se quitaron del mapa: `Mensaje de error: ...` colisionaba con texto libre.

El cuarto campo **`descripcion`** es opcional y llena `tickets.descripcion`:

- Con etiqueta explícita: `Descripción:`, `Desc:`, `Detalle:`, `Detalles:`, `Comentario:`, `Comentarios:`, `Nota:`, `Notas:`. Se guarda **completa, con todas sus líneas**.
- Sin etiqueta: **cualquier línea extra debajo de `Asunto:`** se guarda como descripción.
- Si no hay nada: `Sin descripción adicional`. Ya no se repite empresa/nombre/asunto como descripción, que solo confundía al técnico. En modo libre (texto sin etiquetas) sí se conserva el mensaje entero, porque ahí **es** la información.

`camposFaltantes(datos)` devuelve los obligatorios que no llegaron (`empresa`, `nombre`,
`asunto`) y esa lista es la que se muestra en `mensajeFaltanDatos(recibidos, faltantes)`.

Las etiquetas se comparan ya **normalizadas** (`normalizarEtiqueta`: sin tildes, sin `ñ`,
en minúsculas), así que `Compañía:`, `Descripción:` y `DESCRIPCION=` funcionan igual que
`empresa:` y `descripcion:`.

Con una sola etiqueta y 2+ comas, el valor se reinterpreta con `porComas()` como
la terna `empresa, nombre, asunto`. Un asunto con comas propias **no** se parte,
porque hay etiqueta explícita.

| Entrada | Resultado |
|---|---|
| `Empresa: Acme\nNombre: Juan\nAsunto: PC` | los tres separados |
| `Empresa: Acme, Juan, PC` | `Acme` / `Juan` / `PC` (solo modo libre) |
| `Empresa: Acme, Juan, mi PC no prende` | `Acme` / `Juan` / `mi PC no prende` |
| `Asunto: el PC no prende, hace ruido` | un solo `asunto`, **sin partir** |
| `Acme / Juan / PC` (3 líneas) | los tres separados (solo modo libre) |
| `hola, mi laptop no funciona, ayuda` | los tres separados (**solo modo libre**) |
| `Empresa: Acme Peru` (2 partes) | solo `empresa`, no inventa nombre |
| `Compañía: Acme\nCliente: Juan\nAsunto: PC` | los tres separados (tildes y `ñ`) |
| `…\nAsunto: PC\nParó a las 8am` | `asunto` + `descripcion` con la línea extra |
| `…\nAsunto: PC\nParó a las 8am\nAyer iba bien` | `descripcion` con **las dos** líneas |
| `username: jperez no me deja entrar` | nada: `\b` bloquea el alias `name` |
| `el cliente-servidor no responde` | nada: el `-` sin espacios no es separador |
| `Hola, buenas tardes, mi PC no enciende` | nada en modo estricto (evita ticket basura) |
| `hola\ngracias\nadios` | nada en modo estricto (evita ticket basura) |

Si no reconoce ninguno: empresa `TICKET_EMPRESA_WHATSAPP`, nombre del perfil de WhatsApp y asunto = primera línea del mensaje.

### Parseo del correo

- `nombre` y `email` salen del header `From` (soporta `"Nombre" <correo@dominio>`).
- `empresa` = dominio del remitente, salvo proveedores gratuitos (Gmail, Hotmail, Outlook, Yahoo, etc.), donde usa `TICKET_EMPRESA_CORREO`.
- `asunto` = subject; `descripcion` = body en texto (con fallback de HTML a texto plano).
- Se ignoran remitentes automáticos (`noreply`, `no-reply`, `notifications`, etc.).

### Deduplicación

`tickets.mensaje_externo_id` es **UNIQUE**:

- WhatsApp → `wamid.*` (id del mensaje de Meta)
- Correo → `email_id` de Resend

Si el mismo webhook llega dos veces se captura `ER_DUP_ENTRY` y se devuelve `{ duplicado: true }` sin crear un ticket nuevo.

### Acuse automático

Al crear el ticket se envía un acuse con el código y el enlace `{FRONTEND_URL}/ticket/{uuid}`:

- **Correo**: `emailService.enviarAcuseTicket` (HTML con el código en grande).
- **WhatsApp**: `enviarMensajeTexto` con texto libre.

> El acuse de WhatsApp usa **texto libre**, que Meta solo entrega dentro de la **ventana de 24 h** abierta por el cliente. Fuera de esa ventana Meta responde `success: true` pero no entrega. Las plantillas aprobadas siempre funcionan.

Si el acuse falla, el ticket **ya quedó creado** y se registra un `console.warn`.

### Notificación interna del ticket

Además del acuse al cliente, se puede enviar un correo con el detalle del ticket (empresa, nombre, contacto, asunto y descripción) a una o varias direcciones internas:

```env
TICKET_NOTIFICACION_EMAIL=admin@nicksystem.com, tecnico@nicksystem.com
```

- Método: `emailService.enviarNotificacionTicketInterna`. Asunto `Nuevo ticket por correo - TK-GA0006`.
- Si la variable está **vacía** no se envía nada y no se registra ningún error (queda `omitido: true`).
- Si el envío falla, **nunca** interrumpe la ingesta: el ticket ya quedó creado y solo se loguea con `console.error`. Un fallo aquí no hace que el webhook devuelva 500 ni que Resend reintente la entrega.
- Por ahora solo se dispara en el canal **correo**. Para WhatsApp basta llamar al mismo método en `ingestarWhatsapp` con `canal: 'whatsapp'`.
- Cuenta contra la misma cuota de Resend que el acuse: **2 envíos por ticket entrante**.

### Pruebas locales sin túnel

Los scripts llaman a los servicios directamente, así que no requieren webhook, DNS ni túnel:

Los scripts de prueba por canal se eliminaron. Para probar la ingesta hoy hay dos vías:

1. **Llamar a los servicios directamente** desde un `.mjs` propio, importando `ingestarWhatsapp` / `ingestarCorreo` de `src/services/ticketIngesta.service.js`. Necesita `DATABASE_URL` en el `.env`, pero no túnel ni webhook configurado en Meta/Resend.
2. **Configurar el túnel y disparar el webhook de verdad**, que es lo único que valida la firma de Meta y de Resend de punta a punta.

Quedan dos utilidades: `scripts/crear-admin.js` (crea o restablece el admin; **es la forma correcta de tener un admin en producción**) y `scripts/hash.js`.

> Para el admin en local, `schema.sql` siembra una cuenta de ejemplo, pero su contraseña va **en texto plano** y `bcrypt.compare` la rechaza, así que no sirve para iniciar sesión. Usa `crear-admin.js` en cualquier caso:
> ```bash
> ADMIN_EMAIL=correo@dominio.com ADMIN_PASSWORD='clave-larga' node scripts/crear-admin.js
> ```

### Configuración en Resend

Resend **no permite dominios públicos gratuitos** (`.onrender.com`, etc.) como dominio de email: hay que usar un dominio propio.

- **Envío**: el dominio raíz debe estar `Verified` con DKIM + SPF. Resend usa registros **CNAME** hacia su infraestructura Forge:
  - `send` → `send.forge.rmta.net`
  - `rsend` → `rsend.forge.rmta.net`
- **Recepción**: requiere un **registro MX**. Si la raíz ya recibe correo (Google Workspace, Microsoft 365, MailBaby, etc.), **no activar Receiving en la raíz**: usar un **subdominio** (por ejemplo `inbound.nicksystem.com`) con su propio MX.

Restricciones de DNS:

- Un **CNAME no puede coexistir** con un MX o un TXT en el mismo nombre. Si existen registros viejos de `send` (MX `feedback-smtp...amazonses.com` y TXT `v=spf1 include:amazonses.com`), hay que **borrarlos** antes de crear el CNAME `send`.
- Borrar y volver a registrar un dominio en Resend genera una **clave DKIM nueva**: hay que actualizar el TXT `resend._domainkey`.
- Un `pending` normalmente es propagación (5–15 min). Si persiste después de varias horas, el registro **no existe** en la zona DNS.

### Webhook público y túnel

Meta y Resend necesitan una URL **HTTPS pública**:

- **Producción**: URL pública de Render (`https://<servicio>.onrender.com`).
- **Pruebas locales**: túnel **solo hacia el backend**, nunca hacia el frontend:

```bash
cloudflared tunnel --url http://localhost:4000
```

El túnel solo reenvía al puerto indicado: `4000` = API/webhooks, `5173` = frontend.

---

## Base de Datos

Tablas:

- `users` — usuarios del sistema (admin, técnicos, clientes). `sesion_version` invalida los JWT emitidos antes de un cambio.
- `tecnicos` — información de técnicos.
- `clientes` — información de clientes.
- `categorias` — categorías de servicios.
- `reportes` — reportes de servicios técnicos (identificados por UUID).
- `reporte_evidencias` — evidencias (imágenes, videos, documentos).
- `claves` — credenciales de empresas (`empresa`; `tipo` = `correo` con `usuario`/`password`, o `pc_anydesk` con `pc`, `pc_password`, `anydesk`, `anydesk_password`).
- `claves_auditoria` — quién consultó o editó credenciales, con IP y user-agent.
- `ticket_gastos` — costos que el técnico asignó a un ticket (`concepto`, `detalle`, `monto`). Interna: el cliente no la ve.
- `tickets` — solicitudes entrantes. Campos clave: `canal` (`whatsapp` | `correo` | `manual`), `contacto_origen`, `mensaje_externo_id` (**UNIQUE**), `estado` (`pendiente` | `asignado` | `en_servicio` | `atendido` | `cancelado`), `fecha_inicio_servicio` (sella `en_servicio`), `tecnico_uuid` (**FK** a `tecnicos.uuid`), `cliente_uuid` (**sin FK**, lo vincula el admin a mano) y `vinculado_por` / `vinculado_at`.
- `whatsapp_conversaciones` — conversación pendiente del canal WhatsApp (`numero` PK, `mensaje_origen` UNIQUE, `intentos`). Se borra al crear el ticket.
- `whatsapp_mensajes` — idempotencia del webhook (`mensaje_origen` PK, `numero`, `created_at`). Se purga a los `WHATSAPP_MENSAJES_DIAS`.

Estructura completa en `database/schema.sql` (incluye un usuario admin **solo para desarrollo** `pruebas@nicksystem.com` con contraseña `pruebas123` y 13 categorías por defecto).

### Cambios de esquema

`database/schema.sql` es la **única fuente** y usa `CREATE TABLE IF NOT EXISTS`, así que no altera bases que ya existen. Para cambiar el esquema hay dos casos:

**Base nueva** — correr `schema.sql` y ya:

```bash
mysql -u root -p nicksystemlocal < database/schema.sql
```

**Base existente** — escribir el `ALTER` a mano. **No hay archivo de migración**:
el proyecto asume que los cambios de esquema se aplican una vez, por alguien que
sabe qué está haciendo, y que a partir de ahí `schema.sql` ya describe el estado
correcto.

```bash
mysql -u root -p nicksystemlocal -e "ALTER TABLE tickets ..."
```

Al aplicarlos, conviene comprobar que no quedaron filas a medias:

```sql
SELECT COUNT(*) FROM tickets
 WHERE estado NOT IN ('pendiente','asignado','en_servicio','atendido','cancelado')
    OR estado IS NULL;                    -- tiene que dar 0

SELECT COUNT(*) FROM tickets WHERE codigo IS NULL OR codigo = '';   -- 0
```

El segundo importa porque `tickets.codigo` es `UNIQUE`: un ticket sin código no se
encuentra en el portal público ni por UUID.

`database/NickSystemLocal.sql` es un **volcado de la base local con datos**, no el esquema. No se aplica; sirve de respaldo.

Administrador con contraseña propia:

```bash
ADMIN_EMAIL=tu-correo@dominio.com ADMIN_PASSWORD='clave-larga' node scripts/crear-admin.js
```

`scripts/hash.js "tu-contraseña"` genera un hash bcrypt suelto.

---

## Despliegue en Render

1. Conectar el repositorio GitHub.
2. Render detecta `render.yaml` automáticamente (rama `main`, health check `/health`).
3. Si la base de producción ya está al día con `schema.sql`, seguir al paso 4. Si le falta algo, aplicar el `ALTER` a mano (ver [Cambios de esquema](#cambios-de-esquema)).
4. Configurar manualmente (`sync: false`): `DATABASE_URL`, `RESEND_API_KEY`, `FRONTEND_URL`, `ALLOWED_ORIGINS`, `RESEND_WEBHOOK_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`. `TRUST_PROXY` ya viene en `render.yaml`.
5. Deploy automático en cada push a `main`.
6. Post-deploy: crear el admin con contraseña propia antes de exponer el sistema.

El `Dockerfile` usa multi-stage build con `node:20-alpine`, instala dependencias vía corepack/pnpm y ejecuta como usuario no-root.

> **`pnpm-lock.yaml` está versionado.** Si no lo estuviera, `COPY package.json pnpm-lock.yaml ./` y `pnpm install --frozen-lockfile` fallarían en el build. No volver a añadirlo al `.gitignore`.
>
> Hay un `.dockerignore`: sin él, `COPY . .` metería el `node_modules` del host (sobrescribiendo el install `--prod`) y el `.env` con los secretos dentro de la imagen. El build además falla a propósito si detecta cualquiera de los dos.

