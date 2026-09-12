# Nick System - Backend API

Sistema de gestión de servicios técnicos con reportes, evidencias y notificaciones por email.

API REST construida con Express 4 + MySQL (mysql2) en ESM. Desplegada en Render.

---

## Inicio Rápido

### Instalación

> **Usar siempre pnpm** (el `pnpm-lock.yaml` es la fuente autoritativa; el `package-lock.json` está obsoleto).

```bash
# Instalar dependencias
pnpm install

# Configurar variables de entorno
# Crear .env en la raíz con las variables indicadas abajo

# Iniciar servidor
pnpm dev      # Desarrollo (nodemon, puerto 4000)
pnpm start    # Producción
```

### Variables de Entorno

```env
PORT=4000
NODE_ENV=development
DATABASE_URL=mysql://usuario:password@host:3307/database
JWT_SECRET=tu_clave_secreta
JWT_EXPIRES_IN=1d
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=Nick System <onboarding@resend.dev>
FRONTEND_URL=http://localhost:5173
ALLOWED_ORIGINS=http://localhost:5173
```

> El servidor **no arranca** si falta `DATABASE_URL` o `JWT_SECRET`. Con `NODE_ENV=development` el CORS es permisivo.

---

## Organización del Proyecto

```
nick-system-backend/
├── src/
│   ├── config/
│   │   └── db.js                           # Pool de conexiones MySQL (mysql2)
│   │
│   ├── routes/                             # Definición de rutas + middlewares de acceso
│   │   ├── auth.routes.js                  #   /auth (público)
│   │   ├── admin.routes.js                 #   /admin (rol admin)
│   │   ├── tecnicos.routes.js              #   /tecnicos (rol tecnico)
│   │   ├── cliente.routes.js               #   /clientes (rol cliente)
│   │   ├── categorias.routes.js            #   /categorias (mixto)
│   │   ├── evidencias.routes.js            #   /evidencias (solo auth)
│   │   └── notificaciones.routes.js        #   /notificaciones (mixto)
│   │
│   ├── validators/
│   │   └── validators.js                   # Validación de entrada (lanza ValidationError → 400)
│   │
│   ├── controllers/                        # Fuente de verdad de request/response
│   │   ├── auth.controller.js              # Login
│   │   ├── admin.controller.js             # Dashboard y reportes (admin)
│   │   ├── claves.controller.js            # CRUD claves (admin)
│   │   ├── tecnicos.controller.js          # CRUD técnicos (admin)
│   │   ├── tecnico.controller.js           # Portal técnico
│   │   ├── cliente.controller.js           # Portal cliente
│   │   ├── clientes.controller.js          # CRUD clientes (admin)
│   │   ├── categorias.controller.js        # CRUD categorías
│   │   ├── evidencias.controller.js        # Gestión evidencias
│   │   └── notificaciones.controller.js    # Envío emails
│   │
│   ├── services/                           # Lógica extraída
│   │   ├── admin.service.js                # Consultas complejas admin
│   │   ├── email.service.js                # Envío vía Resend
│   │   ├── entidades.service.js            # Helpers para obtener técnico/cliente por user_id
│   │   └── evidencias.service.js           # Adjuntar evidencias a reportes
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.js              # Verifica JWT y carga req.user
│   │   ├── role.middleware.js              # roleMiddleware('rol', ...) verifica req.user.role
│   │   └── error.middleware.js             # errorHandler central
│   │
│   ├── app.js                              # Express, CORS, montaje de rutas
│   └── server.js                           # Punto de entrada (escucha en PORT)
│
├── database/
│   └── schema.sql                          # Estructura MySQL + datos iniciales
├── Dockerfile                              # Imagen para deploy (multi-stage, node:20-alpine)
├── render.yaml                             # Config del servicio en Render
└── package.json
```

### Flujo de una petición

```
routes → validators → controllers → services → MySQL (pool)
```

Los controllers consultan el pool directamente en la mayoría de los casos; la capa `services` solo existe para `admin`, emails, evidencias y helpers de entidades. Para conocer el shape exacto de un endpoint, leer su controller.

---

## Autenticación

Todas las rutas (excepto `/auth/login` y `/health`) requieren JWT:

```
Authorization: Bearer <token>
```

El payload del token contiene `{ id, uuid, role }`.

**Roles disponibles:**
- `admin` - Acceso total al sistema
- `tecnico` - Crear/editar sus reportes, ver clientes
- `cliente` - Ver sus propios reportes, aprobar/rechazar

---

## Rate Limiting

- **Global**: 1000 requests por ventana de 15 minutos (excluye `/health`)
- **Login** (`POST /auth/login`): 15 requests por ventana de 15 minutos
- **Email** (`POST /notificaciones/reporte/:uuid/enviar`): 20 requests por ventana de 15 minutos

---

## Seguridad

- **Helmet** global: headers de seguridad HTTP
- **CORS**: permisivo en desarrollo; en producción solo permite `nicksystem.com`, `www.nicksystem.com`, `localhost:5173` y los orígenes de `ALLOWED_ORIGINS`
- **Graceful shutdown**: SIGTERM/SIGINT cierran server + pool
- **Password hashing**: bcrypt con 10 rounds

---

## API Endpoints

### Base URL

Las rutas se montan **sin prefijo** `/api`:

```
http://localhost:4000          (desarrollo)
https://nick-system-backend.onrender.com   (producción)
```

---

### Autenticación

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/auth/login` | Público | Login, devuelve `{ token, user }` |

```json
{
  "email": "pruebas@nicksystem.com",
  "password": "••••••••"
}
```

---

### Admin (todo requiere rol `admin`)

#### Dashboard y métricas

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/dashboard` | Totales: reportes, empleados/clientes activos, conformidad |
| GET | `/admin/reportes/mes-actual` | Reportes del mes en curso |
| GET | `/admin/reportes/por-categoria` | Conteo agrupado por categoría |

#### Reportes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/reportes` | Listado con filtros (ver query params abajo) |
| GET | `/admin/reportes/:uuid` | Detalle por UUID (incluye evidencias) |
| PUT | `/admin/reportes/:uuid` | Editar (campos opcionales, al menos uno) |

Query params de `GET /admin/reportes`: `incluir_eliminados`, `tecnico_uuid`, `tecnico_nombre`, `cliente_uuid`, `cliente_nombre`, `categoria`, `modalidad`, `cliente_conforme`, `fecha_desde`, `fecha_hasta`.

Campos de `PUT /admin/reportes/:uuid`: `categoria`, `descripcion`, `fecha` (YYYY-MM-DD), `modalidad` (`presencial` | `remoto`), `estado` (`activo` | `inactivo` | `eliminado`).

#### Claves (credenciales de empresas)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/claves` | Listar todas (`?incluir_inactivos=true` para ver inactivas) |
| POST | `/admin/claves` | Crear credencial (empresa única; dos variantes de payload, ver abajo) |
| PUT | `/admin/claves/:id` | Actualizar parcial (por id numérico) |
| DELETE | `/admin/claves/:id` | Inactivar (soft delete) |
| PATCH | `/admin/claves/:id/restaurar` | Restaurar |

Las claves son de dos tipos, definidos por `tipo`:

- **`correo`**: `empresa` (≤150), `usuario` (≤100, email válido), `password` (≤30). Pueden existir varios correos por empresa.
- **`pc_anydesk`**: `empresa` (≤150), `pc` (≤100), `pc_password` (≤30), `anydesk` (≤100), `anydesk_password` (≤30). **Solo una por empresa** (duplicado → 409).

```json
{ "empresa": "Acme", "tipo": "correo", "usuario": "soporte@acme.com", "password": "secreto" }
```

```json
{ "empresa": "Acme", "tipo": "pc_anydesk", "pc": "PC-ACME-01", "pc_password": "1234", "anydesk": "123456789", "anydesk_password": "abcd" }
```

#### Técnicos

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/tecnicos` | Listar (`?incluir_inactivos=true` para ver todos) |
| GET | `/admin/tecnicos/:uuid` | Detalle |
| POST | `/admin/tecnicos` | Crear (`nombre`, `email`, `password`, `telefono`, `especialidad`) |
| PUT | `/admin/tecnicos/:uuid` | Actualizar |
| DELETE | `/admin/tecnicos/:uuid` | Eliminar (soft delete) |
| PATCH | `/admin/tecnicos/:uuid/restaurar` | Restaurar |

#### Clientes

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/admin/clientes` | Listar (`?incluir_inactivos=true` para ver todos) |
| GET | `/admin/clientes/:uuid` | Detalle |
| POST | `/admin/clientes` | Crear (`nombre`, `empresa`, `email`, `password`, `telefono`, `direccion`) |
| PUT | `/admin/clientes/:uuid` | Actualizar |
| DELETE | `/admin/clientes/:uuid` | Eliminar (soft delete) |
| PATCH | `/admin/clientes/:uuid/restaurar` | Restaurar |

---

### Técnicos (todo requiere rol `tecnico`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/tecnicos/mi-perfil` | Perfil del técnico autenticado |
| GET | `/tecnicos/mis-reportes` | Sus reportes (`?incluir_eliminados=true` para ver eliminados) |
| POST | `/tecnicos/reportes` | Crear reporte (con evidencias opcionales) |
| PUT | `/tecnicos/reportes/:reporteUUID` | Editar su reporte (incluye evidencias) |
| GET | `/tecnicos/mis-estadisticas` | Métricas propias |
| GET | `/tecnicos/clientes` | Listar clientes (para asignar reporte) |

Ejemplo de creación de reporte:

```json
{
  "cliente_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "categoria": "Mantenimiento Preventivo",
  "descripcion": "Limpieza de equipos",
  "fecha": "2026-01-15",
  "modalidad": "presencial",
  "evidencias": [
    { "url": "https://res.cloudinary.com/...", "tipo": "imagen", "descripcion": "Antes" }
  ]
}
```

---

### Clientes (todo requiere rol `cliente`)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/clientes/mi-perfil` | Perfil del cliente autenticado |
| GET | `/clientes/mis-reportes` | Sus reportes (`?incluir_eliminados=true` para ver eliminados) |
| GET | `/clientes/reportes/:uuid` | Detalle de un reporte propio (incluye evidencias) |
| PATCH | `/clientes/reportes/:uuid/conformidad` | Aprobar/rechazar |

Conformidad — valores de `cliente_conforme`: `"conforme"`, `"no_conforme"`, `"por_confirmar"`:

```json
{
  "cliente_conforme": "conforme",
  "aprobado_por": "María López"
}
```

> `aprobado_por` es **requerido** cuando el valor es `conforme` o `no_conforme`.

---

### Categorías

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| GET | `/categorias` | Cualquier rol | Listar activas (`?incluir_eliminadas=true` para ver todas) |
| POST | `/categorias` | Admin | Crear (`nombre`) |
| PUT | `/categorias/:id` | Admin | Actualizar |
| DELETE | `/categorias/:id` | Admin | Eliminar (soft delete) |
| PATCH | `/categorias/:id/restaurar` | Admin | Restaurar |

---

### Evidencias (requieren auth, sin restricción de rol)

| Método | Ruta | Descripción |
|--------|------|-------------|
| GET | `/evidencias/reporte/:reporte_uuid` | Listar evidencias del reporte |
| POST | `/evidencias/reporte/:reporte_uuid` | Agregar una (`url`, `tipo`, `descripcion`, `orden`) |
| POST | `/evidencias/reporte/:reporte_uuid/batch` | Agregar varias (`{ evidencias: [...] }`) |
| PUT | `/evidencias/:uuid` | Actualizar (`url`, `tipo`, `descripcion`, `orden`) |
| DELETE | `/evidencias/:uuid` | Eliminar (hard delete) |
| PATCH | `/evidencias/reporte/:reporte_uuid/reordenar` | Reordenar |

Reordenar espera un array de UUIDs en el orden deseado:

```json
{
  "orden": ["uuid-evidencia-1", "uuid-evidencia-2", "uuid-evidencia-3"]
}
```

---

### Notificaciones

| Método | Ruta | Acceso | Descripción |
|--------|------|--------|-------------|
| POST | `/notificaciones/reporte/:uuid/enviar` | Tecnico, Admin | Email al cliente con el reporte |
| GET | `/notificaciones/verificar` | Admin | Verificar configuración de Resend |

Respuesta de envío:

```json
{
  "success": true,
  "message": "Notificación enviada exitosamente",
  "email_enviado_a": "cliente@ejemplo.com",
  "reporte_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "message_id": "8b4b2f74-eb3b-4a91-abb4-cbc805f4f2bc"
}
```

---

### Health Check

```http
GET /health
```

```json
{
  "status": "ok",
  "message": "Backend funcionando 🚀",
  "environment": "production",
  "timestamp": "2026-01-15T10:30:00.000Z"
}
```

---

## Base de Datos

### Tablas

- **users** - Usuarios del sistema (admin, técnicos, clientes)
- **tecnicos** - Información de técnicos
- **clientes** - Información de clientes
- **categorias** - Categorías de servicios
- **reportes** - Reportes de servicios técnicos (identificados por UUID)
- **reporte_evidencias** - Evidencias (imágenes, videos, documentos)
- **claves** - Credenciales de empresas (`empresa`; `tipo` = `correo` con `usuario`/`password`, o `pc_anydesk` con `pc`, `pc_password`, `anydesk`, `anydesk_password`)

### Ejecutar Schema

```bash
mysql -u usuario -p database < database/schema.sql
```

El schema incluye un usuario admin inicial (`pruebas@nicksystem.com`) y 13 categorías por defecto.

> `database/schema.sql` es la estructura de **BD nueva** (tablas con `CREATE TABLE IF NOT EXISTS`). Para replicar la BD actual de producción se puede restaurar directamente el dump `database/nicksyst_db`.

---

## Despliegue en Render

1. Conectar el repositorio GitHub
2. Render detecta `render.yaml` automáticamente (rama `main`, health check `/health`)
3. Configurar manualmente: `DATABASE_URL`, `RESEND_API_KEY`, `FRONTEND_URL`, `ALLOWED_ORIGINS`
4. Deploy automático en cada push a `main`

El Dockerfile usa multi-stage build con `node:20-alpine`, instala dependencias vía corepack/pnpm, y ejecuta como usuario no-root.

---

## Scripts Disponibles

```bash
pnpm dev                        # Desarrollo con nodemon (hot reload)
pnpm start                      # Producción
node --check src/<archivo>.js   # Verificar sintaxis sin ejecutar
```

No hay lint ni tests configurados.

---

## Dependencias Principales

- **express** - Framework web
- **mysql2** - Cliente MySQL (pool)
- **jsonwebtoken** - Autenticación JWT
- **bcryptjs** - Hash de contraseñas
- **helmet** - Headers de seguridad
- **express-rate-limit** - Rate limiting
- **resend** - Envío de emails
- **uuid** - Generación de UUIDs
- **cors** - Control de CORS
- **dotenv** - Variables de entorno

---

## Troubleshooting

### Error: DATABASE_URL no definida
El servidor termina al arrancar. Verificar `.env`:
```env
DATABASE_URL=mysql://usuario:password@host:3307/database
```

### Error: JWT_SECRET no definida
El servidor termina al arrancar. Verificar `.env`:
```env
JWT_SECRET=tu_clave_secreta
```

### Error: Token inválido
Verificar `JWT_SECRET` en `.env` y que el header `Authorization: Bearer <token>` esté presente.

### Error: Email no se envía
Verificar credenciales de Resend:
```env
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=Nick System <onboarding@resend.dev>
```
