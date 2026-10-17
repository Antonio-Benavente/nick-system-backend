# Nick System Backend — Instrucciones para Agentes

API REST Express 4 + MySQL (mysql2) en ESM (`"type": "module"`). Tiene su propio `.git`. Deploy en Render (`render.yaml` + `Dockerfile`).

## Comandos

**Usar siempre pnpm, nunca npm.** El `package-lock.json` está obsoleto; el `pnpm-lock.yaml` es la fuente autoritativa. El README dice `npm install` — ignorar eso.

```bash
pnpm install
pnpm dev                # nodemon src/server.js (puerto 4000)
pnpm start              # producción
node --check <file.js>  # verificar sintaxis sin ejecutar
```

- No existe tooling de lint ni tests.
- El servidor arranca con nodemon: los cambios en `src/` se recargan solos.

## Arquitectura

- Capas: `routes → validators → controllers → services`. **Los controllers son la fuente de verdad de los shapes de request/response.**
- La capa services es mínima (`admin.service.js`, `email.service.js`, `whatsapp.service.js`, `svix.service.js`, `resendInbound.service.js`, `ticketIngesta.service.js`, `paginacion.service.js`, `auditoria.service.js`, `transaccion.service.js`): la mayoría de los controllers consultan el pool directamente (`import pool from '../config/db.js'`).
- La API está documentada en `README.md` (fuente actualizada de endpoints y shapes). Para detalles exactos, leer los routes/controllers.
- Rutas montadas **sin prefijo** `/api`: `/auth`, `/admin`, `/tecnicos`, `/clientes`, `/categorias`, `/evidencias`, `/notificaciones`, `/publico`, `/webhooks`, `/health`.
- `/webhooks` se monta **fuera** del router de la API, sin auth. `app.js` captura el cuerpo crudo con `express.json({ verify })` porque la verificación de firmas (Svix y Meta) necesita los bytes originales. **No quitar ese `verify`.**
- Roles: `admin`, `tecnico`, `cliente`. Dos estilos de protección:
  - Router completo: `router.use(authMiddleware, roleMiddleware('admin'))` — usado en admin, cliente y tecnicos. El argumento es el **rol**, no `rol`.
  - Por ruta individual — usado en categorias, notificaciones y las escrituras de evidencias.

## Manejo de errores (obligatorio)

Express 4 **no captura rechazos de promesas**: si un `await` de un handler async falla fuera de un `try/catch`, la petición queda colgada hasta el timeout, sin respuesta. Por eso:

- **Todo handler de ruta va envuelto en `asyncHandler`** (`src/middlewares/async.middleware.js`): `router.get('/x', asyncHandler(handler))`. No añadir handlers async sin él.
- **Todo controlador que abre transacción usa `conTransaccion(fn)`** (`src/services/transaccion.service.js`), que hace `getConnection()` + `begin/commit/rollback` + `release` y **nunca** deja la llamada al pool fuera de un try. No volver al patrón `const connection = await pool.getConnection()` antes del `try`.
- Los controladores **no** llevan `try/catch` propio: se lanza y lo resuelve `errorHandler`. Para cortocircuitar con un status concreto usar `abortar(404, 'mensaje')` o `abortar(400, 'mensaje', { message, field })` de `error.middleware.js`.
- Validadores (`validators.js`) lanzan `ValidationError` → 400 con `field`. Errores de MySQL se mapean solos (`ER_DUP_ENTRY` → 409, etc.).
- **En producción el `message` de un error 5xx nunca sale al cliente**: solo un mensaje genérico. El detalle real va al log. `detail`/`stack` solo en desarrollo.

## Sesiones revocables

- `users.sesion_version` + claim `sv` en el JWT. `authMiddleware` compara ambos en cada request y además consulta el `estado` de `tecnicos`/`clientes`.
- Se incrementa (`sesion_version + 1`) en: `POST /auth/logout`, `PATCH /auth/password`, cambio de contraseña de un cliente/técnico, inactivación de cliente/técnico y `scripts/crear-admin.js`.
- `req.user` viene de la BD, no del token: `{ id, uuid, name, email, role }`.

## Paginación

- `leerPaginacion(query)` de `paginacion.service.js`: **opt-in**. Sin `?pagina`/`?por_pagina` devuelve todo (tope 5000) para no romper al frontend; con ellos devuelve `LIMIT/OFFSET` y añade `X-Total-Count`, `X-Page-Size`, `X-Page-Offset`.
- `cabeceraPaginacion(res, ...)` solo cuando `paginacion.activa`.

## Base de datos

- `database/schema.sql` es la **única fuente del esquema** y usa `CREATE TABLE IF NOT EXISTS`: **no altera bases existentes**. No hay carpeta de migraciones a propósito (el esquema cambia pocas veces y suele coincidir con producción). Para una base nueva se corre `schema.sql`; para una existente se escribe el `ALTER` a mano. `database/NickSystemLocal.sql` es un volcado con datos, no el esquema: no se aplica.
- Dos reglas del esquema que ya rompieron cosas: el `UNIQUE KEY` de una columna ya crea índice (no repetirlo con un `KEY` normal), y InnoDB **exige** un índice por columna de foreign key — MySQL rechaza `DROP INDEX` sobre él con `ERROR 1553`. Por eso `idx_reportes_cliente`, `idx_reportes_tecnico` e `idx_tickets_tecnico` no sobran aunque los compuestos los cubran.
- `tickets.tecnico_uuid` tiene FK a `tecnicos(uuid)`. `tickets.cliente_uuid` **no** tiene FK a propósito: lo vincula el admin con `PATCH /admin/tickets/:uuid/vincular-cliente` (`{ cliente_uuid }` o `null` para desvincular).
- `claves` tiene `created_at`/`updated_at` (migración `002`) pero **la API no los devuelve**: los SELECT de `claves.controller.js` son explícitos y no incluyen esas columnas. No reIntroducirlas.

## Convenciones del Dominio

- Los reportes se identifican por **UUID**, no por id numérico.
- **La conformidad es del cliente, nunca del técnico.** `POST /tecnicos/reportes` ignora `cliente_conforme`/`aprobado_por` y guarda siempre `por_confirmar`; `PUT /tecnicos/reportes/:reporteUUID` los borra del body antes de validar. Solo `PATCH /clientes/reportes/:uuid/conformidad` las escribe. El admin tampoco las edita (`admin.controller.js` solo destructura categoria/descripcion/fecha/modalidad/estado).
- **Reapertura:** `POST /tecnicos/reportes/:reporteUUID/reenviar` es la única vía por la que el técnico toca esas columnas, y solo para **bajar** `no_conforme` → `por_confirmar` + limpiar `aprobado_por` + notificar. Nunca sube a `conforme`. Si el reporte ya está `por_confirmar` no modifica nada (`conformidad_reabierta: false`).
- **Las evidencias son del técnico.** `evidencias.routes.js` aplica `roleMiddleware('tecnico', 'admin')` en POST/PUT/DELETE/reordenar; `GET` queda abierto a cualquier autenticado para que el cliente vea las de su reporte.
- **Categorías**: el técnico puede escribir una nueva en el `datalist`. `obtenerOCrearCategoria` (`categorias.service.js`) reutiliza la existente o la crea dentro de la transacción del reporte. Nunca devolver 400 por categoría desconocida; el admin las gestiona en `PATCH/POST/PUT/DELETE /categorias`.
- Los **tickets** también tienen UUID, pero exponen un **código derivado** (no es columna): `TK-<inicial empresa><inicial cliente><LPAD(id,4,'0')>`. Ej.: `TK-AJ0001`. Se computa en SQL en `COLUMNAS_TICKET`, en el return de `crearTicket` y en `seguimientoPublico` — **si se cambia el formato, actualizar los 3 lugares**. `ticketsController.js` mantiene una constante con la expresión SQL; reutilizarla en vez de duplicar el `CONCAT`.
- Tickets entrantes: WhatsApp (`/webhooks/whatsapp`) y correo (`/webhooks/resend/email`) → `ticketIngesta.service.js`. Deduplicación por `tickets.mensaje_externo_id` (UNIQUE) = `wamid.*` o `email_id` de Resend.
- El canal **WhatsApp es una conversación de 2 mensajes**: el primero devuelve `MENSAJE_BIENVIDA_WHATSAPP` y NO crea ticket; el segundo crea el ticket. El estado pendiente vive en la tabla `whatsapp_conversaciones` (`numero` PK, `mensaje_origen` UNIQUE) y se borra al crear el ticket. Ventana: `WHATSAPP_CONVERSACION_MINUTOS` (default 30). Servicio: `whatsappConversacion.service.js`.
- El parseo del mensaje de WhatsApp acepta 3 formatos (etiquetas `Empresa:/Nombre:/Asunto:`, separado por comas, o 3 líneas). Sin coincidencias usa `TICKET_EMPRESA_WHATSAPP`, el nombre del perfil y la primera línea como asunto.
- En correo, `empresa` sale del dominio del remitente salvo proveedores gratuitos (Gmail/Hotmail/etc.), donde usa `TICKET_EMPRESA_CORREO` (por defecto `G`).
- **Notificación interna**: `emailService.enviarNotificacionTicketInterna` manda empresa/nombre/contacto/asunto/descripción a `TICKET_NOTIFICACION_EMAIL` (lista separada por comas). Vacía = `omitido: true` sin enviar nada. **Nunca debe lanzar**: si falla, el ticket ya está creado y solo se loguea; si propagara el error, el webhook devolvería 500 y Resend reintentaría la entrega. Hoy solo la dispara `ingestarCorreo`; WhatsApp reutiliza el mismo método.
- El acuse de WhatsApp es texto libre: **solo entrega dentro de la ventana de 24 h**. El acuse de correo es HTML vía Resend.
- Soft delete: filas con `estado = 'activo'/'inactivo'`; los listados las excluyen salvo query param `incluir_eliminados`/`incluir_inactivos=true`; restauración vía PATCH `/restaurar`.
- Esquema de la tabla `claves`: `id` PK, `empresa VARCHAR(150)`, `tipo` (`correo` | `pc_anydesk`); para correo usa `usuario`/`password`, para PC+AnyDesk usa `pc`, `pc_password`, `anydesk`, `anydesk_password` (una sola fila `pc_anydesk` por empresa); límites validados por `CLAVE_LIMITS` en `validators.js`.
- Emails transaccionales vía Resend (`email.service.js`).
- **Sin comentarios de código.** Todo el código fue deliberadamente despojado de comentarios — no volver a agregarlos.

## Scripts de prueba (tickets entrantes)

Sin túnel ni webhook; llaman a los servicios directamente.

```bash
node scripts/probar-whatsapp.js [numero] [nombre] [datos]
node scripts/probar-correo.js "<from>" "<asunto>" "<cuerpo>" [destino]
```

Utilidades: `scripts/crear-admin.js`, `scripts/hash.js`. **No recrear los scripts de prueba que se borraron**: hay uno solo por canal.

## Entorno

- `.env`: `PORT`, `NODE_ENV`, `TRUST_PROXY` (nº de proxies delante de la API; sin él el rate limit por IP se vuelve inútil), `DATABASE_URL` (URI de pool mysql2 — **el servidor termina si falta**), `JWT_SECRET` (**el servidor termina al arrancar si falta**), `JWT_EXPIRES_IN` (con default `1d` en el código), `RESEND_API_KEY`, `EMAIL_FROM`, `FRONTEND_URL`, `ALLOWED_ORIGINS`. Referencia: `.env.example`.
- Webhooks/tickets entrantes: `RESEND_WEBHOOK_SECRET`, `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN`, `WHATSAPP_APP_SECRET`, `WHATSAPP_GRAPH_VERSION` (v25.0), `WHATSAPP_CONVERSACION_MINUTOS` (30), `TICKET_EMPRESA_CORREO` (por defecto `G`), `TICKET_EMPRESA_WHATSAPP` (por defecto `WhatsApp`), `TICKET_NOTIFICACION_EMAIL` (destinatarios, separados por comas; **vacía = notificación interna desactivada**).
- En **desarrollo** los secretos de webhook pueden ir vacíos (se omite la verificación con `console.warn`). En **producción** son obligatorios: si faltan, el endpoint devuelve **503**.
- CORS es permisivo cuando `NODE_ENV=development`; en producción usa orígenes hardcodeados + los de `ALLOWED_ORIGINS` (separados por comas). Un origen no permitido se rechaza **sin cabecera CORS** (`callback(null, false)`), no con un 500.
- Logging: **una línea por acción** con `bitacora(canal, mensaje)` de `bitacora.service.js`, que emite `console.log(`[${canal}] ${mensaje}`)`. Canales: `whatsapp` (una línea por mensaje) y `resend` (tres: `Mensaje de <correo> → ticket ... creado`, `Aviso interno del ticket ... → enviado a ...` y `Respuesta a <correo> → le envié el acuse con el código ...`). Ej: `|| 17/10/2026 - 02:08:32  [whatsapp] Mensaje de 519****1064 → creé el ticket TK-PA0001 y le devolví el código`. **Nada más se loguea en el camino feliz**: ni la petición entrante, ni los estados de entrega, ni los envíos salientes.
- **Toda la consola usa hora de America/Lima y antepone `||`.** `src/config/logs.js` parchea `console.log/info/warn/error/debug` para anteponer `|| ${horaLima()}` (`DD/MM/AAAA - HH:MM:SS`, `Intl` con `hourCycle: 'h23'`) y **debe ser el primer import de `server.js` y de `app.js`**; si no, los banners de `db.js` (que loguean al importarse) salen sin hora. Los originales quedan en `registros` por si hay que imprimir sin prefijo. Los scripts de prueba no lo importan y por eso su salida queda limpia.
- Los **errores y rechazos** van por `console.error` / `console.warn` (firma inválida, secreto ausente, error de Resend/Meta, acuse fallido). Son la única traza además de la línea por mensaje.
- **Todo fallo silencioso debe quedar registrado.** Puntos cubiertos hoy: `errorHandler` (incluye `METHOD ruta` en 5xx y en el error de "respuesta ya enviada"), `limiteExcedido()` (429, en los 4 limiters), rechazos de token y de sesión/cuenta inactiva en `authMiddleware`, rollback fallido en `conTransaccion`, `pool.on('error')` de MySQL, health check sin base de datos, `RESEND_API_KEY` ausente en `verificarConfiguracion`, notificación 502 tragada en `tecnico.controller.js` y envíos rechazados por Meta en `whatsapp.service.js`. Si añades un `catch` que se traga un error, loguéalo en el mismo sitio.
- **PII nunca en claro en los logs**: emails y teléfonos pasan por `enmascararEmail()` (`j***@acme.com`) y `enmascararTelefono()` (`519****1064`). No loguear emails ni teléfonos completos, ni cuerpos de mensajes. Excepción: la IP en los avisos de rate limit, que sí hace falta para detectar abuso.
- Seguridad: `helmet` global; `compression` global; rate limiting (`express-rate-limit`) en `POST /auth/login`, `PATCH /auth/password` y `POST /notificaciones/reporte/:uuid/enviar`; graceful shutdown en SIGTERM/SIGINT (idempotente) con `unhandledRejection`/`uncaughtException`; limpieza de `whatsapp_conversaciones` vencidas cada 15 min (`server.js`).
- `GET /health` consulta MySQL: 200 si responde, 503 si no (para que Render reinicie el servicio).
- MySQL local: usuario `root`, sin contraseña, Windows, puerto **3307** (XAMPP/MariaDB). Referencia de esquema: `database/schema.sql`.
- Producción: `render.yaml` define las variables del servicio en Render (rama `main`, health check `/health`). Dockerfile usa node:20-alpine y corepack/pnpm; `package.json` declara `engines.node >= 20`.
- **`pnpm-lock.yaml` está versionado a propósito** (el build usa `--frozen-lockfile` y `COPY pnpm-lock.yaml`). No volver a ignorarlo. Existe `.dockerignore`: sin él el `.env` con secretos y el `node_modules` del host entran en la imagen.

## Webhooks y DNS (contexto importante)

- Endpoints: `POST /webhooks/resend/email`, `GET|POST /webhooks/whatsapp`. **Sin prefijo `/api`.**
- Meta y Resend necesitan URL HTTPS pública: en producción la de Render; en pruebas un túnel **solo hacia el backend** (`cloudflared tunnel --url http://localhost:4000`). El frontend en pruebas sigue en `localhost:5173`.
- Resend **no acepta dominios públicos gratuitos** (`.onrender.com`) como dominio de email. Solo la *URL del webhook* puede estar en Render.
- Envío: Resend usa CNAME (`send` → `send.forge.rmta.net`, `rsend` → `rsend.forge.rmta.net`). Un CNAME no puede convivir con MX/TXT en el mismo nombre: hay que borrar los registros viejos de `send` (MX `feedback-smtp...amazonses.com` y TXT `v=spf1 include:amazonses.com`) antes.
- Recepción: requiere MX. Si la raíz del dominio ya recibe correo, Receiving debe ir en un **subdominio** (p. ej. `inbound.nicksystem.com`); habilitarlo en la raíz rompe el correo existente.
- Borrar y re-registrar un dominio en Resend genera **DKIM nuevo**: actualizar el TXT `resend._domainkey`.
