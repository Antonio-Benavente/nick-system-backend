-- NICK SYSTEM - SCHEMA MYSQL
-- Versión 3.1 | MySQL 8.0+ / MariaDB 10.6+
-- Solo para instalaciones NUEVAS (para una base existente hay que escribir el ALTER a mano).
--
-- Al editar:
--  1) No repetir con un KEY normal una columna que ya tiene UNIQUE KEY.
--  2) No eliminar idx_reportes_cliente, idx_reportes_tecnico ni idx_tickets_tecnico:
--     InnoDB los exige por las foreign keys (ERROR 1553 al hacer DROP INDEX).

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'tecnico', 'cliente') NOT NULL,
  empresa VARCHAR(100) DEFAULT NULL,
  sesion_version INT NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uuid (uuid),
  UNIQUE KEY email (email),
  KEY idx_users_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tecnicos (
  id INT AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  user_id INT DEFAULT NULL,
  nombre VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  telefono VARCHAR(50) DEFAULT NULL,
  especialidad VARCHAR(100) DEFAULT NULL,
  estado ENUM('activo', 'inactivo') DEFAULT 'activo',
  fecha_ingreso DATE DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uuid (uuid),
  UNIQUE KEY user_id (user_id),
  KEY idx_tecnicos_estado (estado),
  KEY idx_tecnicos_email (email),
  CONSTRAINT tecnicos_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  user_id INT DEFAULT NULL,
  nombre VARCHAR(100) NOT NULL,
  empresa VARCHAR(100) NOT NULL,
  email VARCHAR(100) DEFAULT NULL,
  telefono VARCHAR(50) DEFAULT NULL,
  direccion VARCHAR(150) DEFAULT NULL,
  estado ENUM('activo', 'inactivo') DEFAULT 'activo',
  fecha_registro DATE DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uuid (uuid),
  UNIQUE KEY user_id (user_id),
  KEY idx_clientes_estado (estado),
  KEY idx_clientes_email (email),
  KEY idx_clientes_empresa (empresa),
  CONSTRAINT clientes_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categorias (
  id INT AUTO_INCREMENT,
  nombre VARCHAR(100) NOT NULL,
  estado ENUM('activo', 'eliminado') DEFAULT 'activo',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY nombre (nombre),
  KEY idx_categorias_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reportes (
  id INT AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  cliente_id INT NOT NULL,
  tecnico_id INT NOT NULL,
  categoria VARCHAR(100) NOT NULL,
  descripcion TEXT DEFAULT NULL,
  fecha DATE NOT NULL,
  modalidad ENUM('presencial', 'remoto') NOT NULL,
  cliente_conforme ENUM('conforme', 'no_conforme', 'por_confirmar') DEFAULT 'por_confirmar',
  aprobado_por VARCHAR(100) DEFAULT NULL,
  estado ENUM('activo', 'eliminado') DEFAULT 'activo',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uuid (uuid),
  KEY idx_reportes_tecnico_estado_fecha (tecnico_id, estado, fecha),
  KEY idx_reportes_cliente_estado_fecha (cliente_id, estado, fecha),
  KEY idx_reportes_cliente (cliente_id),
  KEY idx_reportes_tecnico (tecnico_id),
  KEY idx_reportes_fecha (fecha),
  KEY idx_reportes_estado (estado),
  KEY idx_reportes_categoria (categoria),
  KEY idx_reportes_modalidad (modalidad),
  KEY idx_reportes_conformidad (cliente_conforme),
  CONSTRAINT reportes_ibfk_1 FOREIGN KEY (cliente_id) REFERENCES clientes (id),
  CONSTRAINT reportes_ibfk_2 FOREIGN KEY (tecnico_id) REFERENCES tecnicos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS reporte_evidencias (
  id INT AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  reporte_id INT NOT NULL,
  url VARCHAR(500) NOT NULL,
  tipo ENUM('imagen', 'video', 'documento') DEFAULT 'imagen',
  descripcion VARCHAR(255) DEFAULT NULL,
  orden INT DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uuid (uuid),
  KEY idx_evidencias_reporte (reporte_id),
  KEY idx_evidencias_tipo (tipo),
  CONSTRAINT reporte_evidencias_ibfk_1 FOREIGN KEY (reporte_id) REFERENCES reportes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  codigo VARCHAR(20) DEFAULT NULL,
  empresa_solicitante VARCHAR(150) NOT NULL,
  nombre_solicitante VARCHAR(100) NOT NULL,
  asunto VARCHAR(150) NOT NULL,
  descripcion TEXT NOT NULL,
  estado ENUM('pendiente', 'asignado', 'en_servicio', 'atendido', 'cancelado') NOT NULL DEFAULT 'pendiente',
  cliente_conforme ENUM('conforme', 'no_conforme', 'por_confirmar') NOT NULL DEFAULT 'por_confirmar',
  aprobado_por VARCHAR(100) DEFAULT NULL,
  fecha_conformidad DATETIME DEFAULT NULL,
  motivo_no_conforme VARCHAR(500) DEFAULT NULL,
  tecnico_uuid CHAR(36) DEFAULT NULL,
  cliente_uuid CHAR(36) DEFAULT NULL,
  vinculado_por CHAR(36) DEFAULT NULL,
  vinculado_at DATETIME DEFAULT NULL,
  canal ENUM('manual', 'web', 'correo', 'whatsapp') NOT NULL DEFAULT 'manual',
  contacto_origen VARCHAR(150) DEFAULT NULL,
  mensaje_externo_id VARCHAR(255) DEFAULT NULL,
  nota_cierre TEXT DEFAULT NULL,
  fecha_asignacion DATETIME DEFAULT NULL,
  fecha_inicio_servicio DATETIME DEFAULT NULL,
  fecha_cierre DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uuid (uuid),
  UNIQUE KEY codigo (codigo),
  UNIQUE KEY mensaje_externo_id (mensaje_externo_id),
  KEY idx_tickets_tecnico_estado (tecnico_uuid, estado),
  KEY idx_tickets_estado_created (estado, created_at),
  KEY idx_tickets_tecnico (tecnico_uuid),
  KEY idx_tickets_cliente (cliente_uuid),
  KEY idx_tickets_conformidad (cliente_conforme),
  CONSTRAINT tickets_ibfk_1 FOREIGN KEY (tecnico_uuid) REFERENCES tecnicos (uuid) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Costos internos (en soles): los escribe el técnico asignado, los lee el admin; el cliente no los ve.
CREATE TABLE IF NOT EXISTS ticket_gastos (
  id INT AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  ticket_id INT NOT NULL,
  concepto VARCHAR(150) NOT NULL,
  detalle VARCHAR(255) DEFAULT NULL,
  monto DECIMAL(10,2) NOT NULL DEFAULT 0.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uuid (uuid),
  KEY idx_gastos_ticket (ticket_id),
  CONSTRAINT ticket_gastos_ibfk_1 FOREIGN KEY (ticket_id) REFERENCES tickets (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Credenciales de empresas. La API devuelve updated_at pero no created_at.
CREATE TABLE IF NOT EXISTS claves (
  id INT AUTO_INCREMENT,
  empresa VARCHAR(150) NOT NULL,
  tipo ENUM('correo', 'pc_anydesk') NOT NULL,
  nombre VARCHAR(100) DEFAULT NULL,
  usuario VARCHAR(100) DEFAULT NULL,
  password VARCHAR(30) DEFAULT NULL,
  pc VARCHAR(100) DEFAULT NULL,
  pc_password VARCHAR(30) DEFAULT NULL,
  anydesk VARCHAR(100) DEFAULT NULL,
  anydesk_password VARCHAR(30) DEFAULT NULL,
  estado ENUM('activo', 'inactivo') DEFAULT 'activo',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uk_claves_empresa_tipo_usuario (empresa, tipo, usuario),
  KEY idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS claves_auditoria (
  id INT AUTO_INCREMENT,
  user_id INT NOT NULL,
  user_email VARCHAR(100) NOT NULL,
  accion VARCHAR(50) NOT NULL,
  ip VARCHAR(45) DEFAULT NULL,
  user_agent VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  KEY idx_claves_auditoria_created (created_at),
  KEY idx_claves_auditoria_user (user_id),
  CONSTRAINT claves_auditoria_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS whatsapp_conversaciones (
  numero VARCHAR(200) NOT NULL,
  mensaje_origen VARCHAR(255) NOT NULL,
  intentos INT NOT NULL DEFAULT 0,
  -- Campos ya aportados por el cliente. Se usa sobre todo con remitentes que
  -- escribirton ANTES de compartir su número (BSUID): los datos quedan guardados
  -- y, al llegar el número, el ticket se crea sin pedir nada otra vez.
  datos TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (numero),
  UNIQUE KEY uq_whatsapp_conversacion_mensaje (mensaje_origen),
  KEY idx_whatsapp_conversacion_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- Idempotencia del webhook: cada wamid se inserta una sola vez, justo antes de
-- responderle al cliente. Si Meta reintenta, la segunda pasada no vuelve a escribir.
CREATE TABLE IF NOT EXISTS whatsapp_mensajes (
  mensaje_origen VARCHAR(255) NOT NULL,
  numero VARCHAR(200) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,

  PRIMARY KEY (mensaje_origen),
  KEY idx_whatsapp_mensajes_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO categorias (nombre, estado) VALUES
  ('Servicio técnico correctivo de cómputo', 'activo'),
  ('Servicio técnico correctivo eléctrico', 'activo'),
  ('Servicio de mantenimiento de cómputo', 'activo'),
  ('Servicio de mantenimiento de cámaras', 'activo'),
  ('Servicio de backups', 'activo'),
  ('Servicio de reparación de impresoras', 'activo'),
  ('Servicio de cableado ethernet', 'activo'),
  ('Servicio de cableado eléctrico', 'activo'),
  ('Servicio de instalación y configuración de cámaras CCTV', 'activo'),
  ('Servicio de mantenimiento de cámaras CCTV', 'activo'),
  ('Servicio de instalación de software', 'activo'),
  ('Servicio correctivo de software', 'activo'),
  ('Servicio de mantenimiento lógico y físico de servidores', 'activo')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

-- Seed de desarrollo: NO usar en producción sin cambiar la contraseña.
-- En producción: ADMIN_EMAIL=correo@dominio.com ADMIN_PASSWORD='clave-larga' node scripts/crear-admin.js
INSERT INTO users (uuid, name, email, password, role, empresa)
VALUES (
  'uuid',
  'Administrador General',
  'correo@dominio.com',
  'clave-larga',
  'admin',
  'Empresa'
)
ON DUPLICATE KEY UPDATE email = VALUES(email);