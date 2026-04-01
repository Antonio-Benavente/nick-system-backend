# Nick System - Backend API

Sistema de gestión de servicios técnicos con reportes, evidencias y notificaciones por email.

---

## 🚀 Inicio Rápido

### Instalación

```bash
# Clonar repositorio
git clone https://github.com/tu-usuario/nick-system-backend.git
cd nick-system-backend

# Instalar dependencias
npm install

# Configurar variables de entorno
cp .env.example .env
# Editar .env con tus credenciales

# Iniciar servidor
npm run dev      # Desarrollo
npm start        # Producción
```

### Variables de Entorno

```env
PORT=4000
NODE_ENV=production
DATABASE_URL=mysql://usuario:password@host:3306/database
JWT_SECRET=tu_clave_secreta
JWT_EXPIRES_IN=1d
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=Nick System <onboarding@resend.dev>
FRONTEND_URL=https://tudominio.com
ALLOWED_ORIGINS=https://tudominio.com,http://localhost:5173
```

---

## 📁 Estructura del Proyecto

```
nick-system-backend/
├── src/
│   ├── config/
│   │   └── db.js                    # Conexión MySQL
│   │
│   ├── controllers/
│   │   ├── auth.controller.js       # Login
│   │   ├── admin.controller.js      # Dashboard, gestión
│   │   ├── tecnicos.controller.js   # Reportes técnicos
│   │   ├── cliente.controller.js    # Vista cliente
│   │   ├── clientes.controller.js   # CRUD clientes
│   │   ├── categorias.controller.js # CRUD categorías
│   │   ├── evidencias.controller.js # Gestión evidencias
│   │   └── notificaciones.controller.js # Envío emails
│   │
│   ├── routes/
│   │   ├── auth.routes.js
│   │   ├── admin.routes.js
│   │   ├── tecnicos.routes.js
│   │   ├── cliente.routes.js
│   │   ├── categorias.routes.js
│   │   ├── evidencias.routes.js
│   │   └── notificaciones.routes.js
│   │
│   ├── services/
│   │   ├── admin.service.js         # Lógica de negocio admin
│   │   └── email.service.js         # Resend emails
│   │
│   ├── middlewares/
│   │   ├── auth.middleware.js       # Verificar JWT
│   │   ├── role.middleware.js       # Verificar roles
│   │   └── error.middleware.js      # Manejo de errores
│   │
│   ├── validators/
│   │   └── validators.js            # Validación de datos
│   │
│   ├── app.js                       # Configuración Express
│   └── server.js                    # Punto de entrada
│
├── database/
│   └── schema.sql                   # Estructura MySQL
│
├── .env                             # Plantilla variables
├── .gitignore
├── package.json
├── render.yaml                      # Config Render
└── README.md
```

---

## 🔐 Autenticación

Todas las rutas (excepto `/auth/login` y `/api/health`) requieren autenticación JWT.

**Header requerido:**
```
Authorization: Bearer <token>
```

**Roles disponibles:**
- `admin` - Acceso total
- `tecnico` - Crear reportes, ver clientes
- `cliente` - Ver sus reportes, aprobar/rechazar

---

## 📡 API Endpoints

### Base URL
```
https://tu-dominio.onrender.com/api
```

---

### 🔑 Autenticación

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "admin@nicksystem.com",
  "password": "admin123"
}

Response:
{
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "user": {
    "uuid": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Administrador",
    "role": "admin"
  }
}
```

---

### 👔 Admin

#### Dashboard
```http
GET /admin/dashboard
Authorization: Bearer <token>

Response:
{
  "total_reportes": 45,
  "empleados_activos": 5,
  "clientes_activos": 20,
  "reportes_conformes": 35,
  "reportes_no_conformes": 3,
  "reportes_por_confirmar": 7
}
```

#### Listar Reportes
```http
GET /admin/reportes?categoria=Instalación&fecha_desde=2024-01-01
Authorization: Bearer <token>

Query Params (opcionales):
- incluir_eliminados
- tecnico_uuid
- cliente_uuid
- categoria
- modalidad
- cliente_conforme
- fecha_desde
- fecha_hasta
```

#### Editar Reporte
```http
PUT /admin/reportes/:uuid
Authorization: Bearer <token>
Content-Type: application/json

{
  "categoria": "Mantenimiento Correctivo",
  "descripcion": "Descripción actualizada del reporte",
  "fecha": "2024-03-31",
  "modalidad": "remoto",
  "estado": "activo"
}

Campos opcionales (al menos uno requerido):
- categoria: string (debe existir y estar activa)
- descripcion: string
- fecha: string (formato YYYY-MM-DD)
- modalidad: "presencial" | "remoto"
- estado: "activo" | "inactivo" | "eliminado"

Response:
{
  "message": "Reporte actualizado correctamente"
}
```

#### Listar Técnicos
```http
GET /admin/tecnicos
Authorization: Bearer <token>
```

#### Crear Técnico
```http
POST /admin/tecnicos
Authorization: Bearer <token>
Content-Type: application/json

{
  "nombre": "Juan Pérez",
  "email": "juan@nicksystem.com",
  "password": "password123",
  "telefono": "+51 999 888 777",
  "especialidad": "Redes"
}
```

#### Listar Clientes
```http
GET /admin/clientes
Authorization: Bearer <token>
```

#### Crear Cliente
```http
POST /admin/clientes
Authorization: Bearer <token>
Content-Type: application/json

{
  "nombre": "María López",
  "empresa": "Empresa SAC",
  "email": "maria@empresa.com",
  "password": "password123",
  "telefono": "+51 999 777 666",
  "direccion": "Av. Principal 123"
}
```

---

### 🔧 Técnicos

#### Mi Perfil
```http
GET /tecnicos/mi-perfil
Authorization: Bearer <token>
```

#### Mis Reportes
```http
GET /tecnicos/mis-reportes
Authorization: Bearer <token>
```

#### Crear Reporte
```http
POST /tecnicos/reportes
Authorization: Bearer <token>
Content-Type: application/json

{
  "cliente_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "categoria": "Mantenimiento Preventivo",
  "descripcion": "Limpieza de equipos",
  "fecha": "2024-01-15",
  "modalidad": "presencial",
  "evidencias": [
    {
      "url": "https://cloudinary.com/image1.jpg",
      "tipo": "imagen",
      "descripcion": "Antes del servicio"
    },
    {
      "url": "https://cloudinary.com/image2.jpg",
      "tipo": "imagen",
      "descripcion": "Después del servicio"
    }
  ]
}
```

#### Mis Estadísticas
```http
GET /tecnicos/mis-estadisticas
Authorization: Bearer <token>
```

#### Listar Clientes (Para Técnicos)
```http
GET /tecnicos/clientes
Authorization: Bearer <token>
```

---

### 👤 Clientes

#### Mi Perfil
```http
GET /clientes/mi-perfil
Authorization: Bearer <token>
```

#### Mis Reportes
```http
GET /clientes/mis-reportes
Authorization: Bearer <token>
```

#### Ver Reporte Específico
```http
GET /clientes/reportes/:uuid
Authorization: Bearer <token>
```

#### Aprobar/Rechazar Reporte
```http
PATCH /clientes/reportes/:uuid/conformidad
Authorization: Bearer <token>
Content-Type: application/json

{
  "cliente_conforme": "conforme",
  "aprobado_por": "María López"
}

Valores permitidos:
- "conforme"
- "no_conforme"
- "por_confirmar"
```

---

### 📂 Categorías

#### Listar Categorías
```http
GET /categorias
Authorization: Bearer <token>
```

#### Crear Categoría (Admin)
```http
POST /categorias
Authorization: Bearer <token>
Content-Type: application/json

{
  "nombre": "Soporte Remoto"
}
```

---

### 📸 Evidencias

#### Listar Evidencias de un Reporte
```http
GET /evidencias/reporte/:reporte_uuid
Authorization: Bearer <token>
```

#### Agregar Evidencia
```http
POST /evidencias/reporte/:reporte_uuid
Authorization: Bearer <token>
Content-Type: application/json

{
  "url": "https://cloudinary.com/image.jpg",
  "tipo": "imagen",
  "descripcion": "Equipo reparado",
  "orden": 1
}
```

#### Agregar Múltiples Evidencias
```http
POST /evidencias/reporte/:reporte_uuid/batch
Authorization: Bearer <token>
Content-Type: application/json

{
  "evidencias": [
    {
      "url": "https://cloudinary.com/image1.jpg",
      "tipo": "imagen",
      "descripcion": "Antes"
    },
    {
      "url": "https://cloudinary.com/image2.jpg",
      "tipo": "imagen",
      "descripcion": "Después"
    }
  ]
}
```

#### Actualizar Evidencia
```http
PUT /evidencias/:uuid
Authorization: Bearer <token>
Content-Type: application/json

{
  "descripcion": "Nueva descripción",
  "orden": 2
}
```

#### Eliminar Evidencia
```http
DELETE /evidencias/:uuid
Authorization: Bearer <token>
```

#### Reordenar Evidencias
```http
PATCH /evidencias/reporte/:reporte_uuid/reordenar
Authorization: Bearer <token>
Content-Type: application/json

{
  "orden": [
    "uuid-evidencia-1",
    "uuid-evidencia-2",
    "uuid-evidencia-3"
  ]
}
```

---

### 📧 Notificaciones

#### Enviar Notificación de Reporte
```http
POST /notificaciones/reporte/:uuid/enviar
Authorization: Bearer <token>

Response:
{
  "success": true,
  "message": "Notificación enviada exitosamente",
  "email_enviado_a": "cliente@ejemplo.com",
  "reporte_uuid": "550e8400-e29b-41d4-a716-446655440000",
  "message_id": "8b4b2f74-eb3b-4a91-abb4-cbc805f4f2bc"
}
```

#### Verificar Configuración de Email (Admin)
```http
GET /notificaciones/verificar
Authorization: Bearer <token>
```

#### Enviar Email de Prueba (Admin)
```http
POST /notificaciones/prueba
Authorization: Bearer <token>
Content-Type: application/json

{
  "email": "prueba@ejemplo.com"
}
```

---

### ❤️ Health Check

```http
GET /api/health

Response:
{
  "status": "ok",
  "message": "Backend funcionando 🚀",
  "environment": "production",
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

---

## 🗄️ Base de Datos

### Tablas Principales

- **users** - Usuarios del sistema (admin, técnicos, clientes)
- **tecnicos** - Información de técnicos
- **clientes** - Información de clientes
- **categorias** - Categorías de servicios
- **reportes** - Reportes de servicios técnicos
- **reporte_evidencias** - Evidencias (fotos, videos, docs)

### Ejecutar Schema

```bash
# En MySQL/cPanel:
mysql -u usuario -p database < database/schema.sql

# O desde phpMyAdmin:
# Importar → Seleccionar schema.sql → Ejecutar
```

---

## 🔒 Seguridad

- ✅ Autenticación JWT
- ✅ Contraseñas hasheadas con bcrypt
- ✅ Validación de datos de entrada
- ✅ CORS configurado
- ✅ Roles y permisos
- ✅ Variables de entorno para secretos

---

## 🚀 Despliegue en Render

```bash
# 1. Conectar repositorio GitHub
# 2. Render detecta render.yaml automáticamente
# 3. Configurar variables de entorno manualmente:
#    - DATABASE_URL
#    - RESEND_API_KEY
#    - FRONTEND_URL
#    - ALLOWED_ORIGINS
# 4. Deploy automático
```

**URL:** `https://tu-app.onrender.com/api`

---

## 🛠️ Scripts Disponibles

```bash
npm run dev    # Desarrollo con nodemon (hot reload)
npm start      # Producción
```

---

## 📦 Dependencias Principales

- **express** - Framework web
- **mysql2** - Cliente MySQL
- **jsonwebtoken** - Autenticación JWT
- **bcryptjs** - Hash de contraseñas
- **resend** - Envío de emails
- **uuid** - Generación de IDs únicos
- **cors** - Control de CORS
- **dotenv** - Variables de entorno

---

## 📝 Credenciales por Defecto

```
Email: admin@nicksystem.com
Password: admin123
```

⚠️ **Cambiar después del primer login**

---

## 🐛 Troubleshooting

### Error: DATABASE_URL no definida
```bash
# Verificar .env
DATABASE_URL=mysql://usuario:password@host:3306/database
```

### Error: Token inválido
```bash
# Verificar JWT_SECRET en .env
JWT_SECRET=tu_clave_secreta_muy_larga
```

### Error: Email no se envía
```bash
# Verificar Resend API Key
RESEND_API_KEY=re_xxxxxxxxxxxxx
EMAIL_FROM=Nick System <onboarding@resend.dev>
```
