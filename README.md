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
TICKET_EMPRESA_CORREO=G
TICKET_EMPRESA_WHATSAPP=WhatsApp
TICKET_NOTIFICACION_EMAIL=
```

| Variable | Notas |
|---|---|
| `PORT` | Puerto del servidor (default 4000) |
| `NODE_ENV` | `development` hace el CORS permisivo y activa logs |
| `DATABASE_URL` | URI de pool mysql2 (**obligatoria**) |
| `JWT_SECRET` | Clave para firmar tokens (**obligatoria**) |
| `JWT_EXPIRES_IN` | Expiración del token (`1d`, etc.) |
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
| `TICKET_EMPRESA_CORREO` | `empresa_solicitante` por defecto cuando el correo viene de un proveedor gratuito (Gmail, Hotmail, etc.). Solo importa su inicial para el código |
| `TICKET_EMPRESA_WHATSAPP` | `empresa_solicitante` por defecto cuando el mensaje de WhatsApp no incluye empresa |
| `TICKET_NOTIFICACION_EMAIL` | Destinatarios del correo interno con el detalle de cada ticket entrante (separados por comas). **Vacía = no se envía nada** |

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
│   ├── ticketService.js                # crearTicket, COLUMNAS_TICKET, SQL_CODIGO_TICKET
│   ├── ticketIngesta.service.js        # Parseo y alta de tickets entrantes
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

### Rate limiting

- Global (router `/`): 1000 requests / 15 min, excluye `/health`.
- `POST /auth/login`: 15 requests / 15 min (solo cuenta los fallidos).
- `PATCH /auth/password`: 10 requests / 15 min.
- `POST /notificaciones/reporte/:uuid/enviar`: 20 requests / 15 min.
- `GET /publico/tickets/:uuid`: 60 requests / 15 min (limitador propio).

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

Filtros de `GET /admin/tickets`: `estado`, `tecnico_uuid`, `cliente_uuid`, `sin_cliente=true`, `empresa`, `fecha_desde`, `fecha_hasta`.

### Tickets (técnico)

| Método | Ruta | Acceso | Descripción |
|---|---|---|---|
| GET | `/tecnicos/mis-tickets` | Tecnico | Tickets asignados |
| PATCH | `/tecnicos/tickets/:uuid/iniciar` | Tecnico | Poner en proceso |
| PATCH | `/tecnicos/tickets/:uuid/atender` | Tecnico | Marcar atendido (`{ nota }`) |

### Paginación

Todos los listados aceptan `?pagina=N&por_pagina=M` (máx. 500). Cuando se usan, la respuesta trae `X-Total-Count`, `X-Page-Size` y `X-Page-Offset`. **Sin esos params el comportamiento es el de siempre**: se devuelve el listado completo (tope de seguridad 5000), así que el frontend existente no se rompe.

Se puede filtrar por texto con `?buscar=` en `/admin/clientes`, `/admin/tecnicos` y `/admin/claves`.

### Auditoría de credenciales

Cada lectura o escritura de `/admin/claves` deja una fila en `claves_auditoria` (`user_id`, `user_email`, `accion`, `ip`, `user_agent`, `created_at`). No bloquea la respuesta: si el insert falla solo se avisa por consola.

La tabla `claves` tiene `created_at` / `updated_at` (ver migración `002`) para saber cuándo se creó o rotó una credencial, pero **la API no los devuelve**: `/admin/claves` expone solo `id, empresa, tipo, nombre, usuario, password, pc, pc_password, anydesk, anydesk_password, estado`.

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

Acepta **UUID** o **código de ticket** (`TK-AA0001`); se normaliza a mayúsculas.

### Health Check

```http
GET /health
```

Comprueba también MySQL: responde **200** si la base responde y **503** con `"status": "degradado"` si no. Eso hace que Render reinicie el servicio cuando se cae la base.

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
TK-<inicial empresa><inicial cliente><4 dígitos>
```

El código **no es una columna**: se deriva en SQL con la constante `SQL_CODIGO_TICKET` (en `ticketService.js`):

```sql
CONCAT('TK-', UPPER(LEFT(empresa_solicitante, 1)), UPPER(LEFT(nombre_solicitante, 1)), LPAD(id, 4, '0'))
```

Los 4 dígitos son el `id` del ticket (secuencia global) con zero-padding.

| Empresa | Cliente | id | Código |
|---|---|---|---|
| Acme | Juan Perez | 1 | `TK-AJ0001` |
| G | Antonio Benavente | 3 | `TK-GA0003` |

`SQL_CODIGO_TICKET` se usa en `COLUMNAS_TICKET`, en `seguimientoPublico` y en los scripts de prueba. El return de `crearTicket` replica la fórmula en JS. **Si cambia el formato, actualizar esos puntos.**

### Interacción de WhatsApp en 2 mensajes

El canal de WhatsApp usa una conversación de **2 pasos**:

| Paso | Qué hace el cliente | Qué hace el sistema |
|---|---|---|
| 1 | Escribe cualquier mensaje (ej. "hola") | Responde con `mensajeBienvenida()` pidiendo Empresa, Nombre y Asunto. **No crea ticket** |
| 2 | Envía los datos | Crea el ticket con los datos parseados y responde con `mensajeTicketCreado()` (código + enlace) |

El estado pendiente se guarda en la tabla `whatsapp_conversaciones` (clave primaria = número). Al crear el ticket la fila se elimina.

- **Ventana**: `WHATSAPP_CONVERSACION_MINUTOS` (default **30**). Si el cliente no responde dentro de ese plazo, el siguiente mensaje vuelve a pedir los datos desde cero.
- **Dedupe**: `mensaje_origen` es UNIQUE, así que un reenvío del mismo `wamid` no repite el mensaje de bienvenida.
- La tabla se puede depurar con `limpiarConversacionesVencidas()` (exportado en `whatsappConversacion.service.js`).

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
| `respondí pidiendo los datos` | Mensaje 1 de la conversación |
| `creé el ticket TK-XX0000 y le devolví el código` | Mensaje 2, ticket creado y acuse enviado |
| `creé el ticket TK-XX0000 pero el acuse falló: <motivo>` | El ticket se creó, el acuse no salió |
| `ese mensaje ya tenía un ticket` | Reenvío del mismo `wamid` |
| `ya estaba procesado, no hice nada` | Reenvío que habría repetido la bienvenida |
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
Buenas tardes, soy soporte de Nick System.

Para registrar tu solicitud necesito que me envíes estos datos:

Empresa: (nombre de tu empresa)
Nombre: (tu nombre completo)
Asunto: (describe el problema)

Ejemplo:
Empresa: Acme
Nombre: Juan Perez
Asunto: Mi PC no enciende
```

```
Ticket creado.

Tu código es TK-AJ0001.
Puedes seguir su estado aquí: http://localhost:5173/ticket/<uuid>
```

> El saludo se adapta a la hora de **America/Lima**: `Buenos días` (5–11), `Buenas tardes` (12–18), `Buenas noches` (19–4).

### Parseo del mensaje de WhatsApp

`interpretarMensaje` acepta tres formatos, en este orden:

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

```bash
node scripts/probar-whatsapp.js [numero] [nombre] [datos]
node scripts/probar-correo.js "<from>" "<asunto>" "<cuerpo>" [destino]
```

Utilidades: `scripts/crear-admin.js`, `scripts/hash.js`. Hay **un solo script de prueba por canal**; no recrear los eliminados.

> `probar-whatsapp.js` recibe el número, el nombre del contacto y, opcionalmente, el mensaje con los datos. Sin argumentos simula el flujo completo: mensaje 1 → bienvenida, mensaje 2 → ticket.

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
- `tickets` — solicitudes entrantes. Campos clave: `canal` (`whatsapp` | `correo` | `manual`), `contacto_origen`, `mensaje_externo_id` (**UNIQUE**), `estado` (`pendiente` | `asignado` | `en_proceso` | `atendido` | `cancelado`), `tecnico_uuid` (**FK** a `tecnicos.uuid`), `cliente_uuid` (**sin FK**, lo vincula el admin a mano) y `vinculado_por` / `vinculado_at`.
- `whatsapp_conversaciones` — conversación pendiente del canal WhatsApp (`numero` PK, `mensaje_origen` UNIQUE). Se borra al crear el ticket.

Estructura completa en `database/schema.sql` (incluye un usuario admin **solo para desarrollo** `pruebas@nicksystem.com` con contraseña `pruebas123` y 13 categorías por defecto).

### Cambios de esquema

`database/schema.sql` es la **única fuente** y usa `CREATE TABLE IF NOT EXISTS`, así que no altera bases que ya existen. Para cambiar el esquema hay dos casos:

**Base nueva** — correr `schema.sql` y ya:

```bash
mysql -u root -p nicksystemlocal < database/schema.sql
```

**Base existente** — escribir el `ALTER` a mano en la consola o en un archivo suelto:

```bash
mysql -u root -p nicksystemlocal -e "ALTER TABLE ..."
```

No hay carpeta de migraciones a propósito: el esquema cambia pocas veces y casi siempre coincide con producción. Si algún día hicieran falta muchas, se agrega.

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

