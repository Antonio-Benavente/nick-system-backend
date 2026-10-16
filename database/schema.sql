-- ============================================
-- NICK SYSTEM - SCHEMA MYSQL
-- ============================================
-- Versión: 3.1 — verificado contra database/NickSystemLocal.sql
-- SGBD: MySQL 8.0+ / MariaDB 10.6+
--
-- Este archivo es el estado de una instalación NUEVA.
-- Para una base que YA existe no sirve (todo es CREATE TABLE IF NOT
-- EXISTS): hay que escribir el ALTER a mano.
--
-- Dos reglas que rompian cosas y conviene respetar al editar:
--  1) El UNIQUE KEY de una columna ya crea un índice. No repetirlo con
--     un KEY normal sobre la misma columna (idx_users_uuid, idx_users_email,
--     idx_tecnicos_uuid, idx_clientes_uuid, idx_reportes_uuid,
--     idx_evidencias_uuid, idx_claves_empresa).
--  2) MySQL REQUIERE un índice sobre cada columna de una foreign key y
--     rechaza DROP INDEX sobre él (ERROR 1553). Por eso siguen
--     idx_reportes_cliente, idx_reportes_tecnico e idx_tickets_tecnico
--     aunque los índices compuestos los cubran como prefijo.
-- ============================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ============================================
-- TABLA: users
-- ============================================
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

-- ============================================
-- TABLA: tecnicos
-- ============================================
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

-- ============================================
-- TABLA: clientes
-- ============================================
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

-- ============================================
-- TABLA: categorias
-- ============================================
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

-- ============================================
-- TABLA: reportes
-- Los compuestos sirven a las listas del técnico y del cliente
-- (filtran por id + estado y ordenan por fecha).
-- idx_reportes_cliente / idx_reportes_tecnico no sobran: los exige
-- InnoDB por las foreign keys.
-- ============================================
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

-- ============================================
-- TABLA: reporte_evidencias
-- ============================================
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

-- ============================================
-- TABLA: tickets
-- ============================================
CREATE TABLE IF NOT EXISTS tickets (
  id INT AUTO_INCREMENT,
  uuid CHAR(36) NOT NULL,
  empresa_solicitante VARCHAR(150) NOT NULL,
  nombre_solicitante VARCHAR(100) NOT NULL,
  asunto VARCHAR(150) NOT NULL,
  descripcion TEXT NOT NULL,
  estado ENUM('pendiente', 'asignado', 'en_proceso', 'atendido', 'cancelado') NOT NULL DEFAULT 'pendiente',
  tecnico_uuid CHAR(36) DEFAULT NULL,
  cliente_uuid CHAR(36) DEFAULT NULL,
  vinculado_por CHAR(36) DEFAULT NULL,
  vinculado_at DATETIME DEFAULT NULL,
  canal ENUM('manual', 'web', 'correo', 'whatsapp') NOT NULL DEFAULT 'manual',
  contacto_origen VARCHAR(150) DEFAULT NULL,
  mensaje_externo_id VARCHAR(255) DEFAULT NULL,
  nota_cierre TEXT DEFAULT NULL,
  fecha_asignacion DATETIME DEFAULT NULL,
  fecha_cierre DATETIME DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uuid (uuid),
  UNIQUE KEY mensaje_externo_id (mensaje_externo_id),
  KEY idx_tickets_tecnico_estado (tecnico_uuid, estado),
  KEY idx_tickets_estado_created (estado, created_at),
  KEY idx_tickets_tecnico (tecnico_uuid),
  KEY idx_tickets_cliente (cliente_uuid),
  CONSTRAINT tickets_ibfk_1 FOREIGN KEY (tecnico_uuid) REFERENCES tecnicos (uuid) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: claves (credenciales de empresas)
-- created_at/updated_at existen para saber cuándo se rotó una credencial,
-- pero la API NO las devuelve (los SELECT de claves.controller.js son
-- explícitos y las omiten).
-- ============================================
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

-- ============================================
-- TABLA: claves_auditoria
-- ============================================
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

-- ============================================
-- TABLA: whatsapp_conversaciones
-- ============================================
CREATE TABLE IF NOT EXISTS whatsapp_conversaciones (
  numero VARCHAR(20) NOT NULL,
  mensaje_origen VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (numero),
  UNIQUE KEY uq_whatsapp_conversacion_mensaje (mensaje_origen),
  KEY idx_whatsapp_conversacion_created (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DATOS INICIALES
-- ============================================

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
-- Para producción, crear el admin con:
--   ADMIN_EMAIL=tu-correo@dominio.com ADMIN_PASSWORD='clave-larga' node scripts/crear-admin.js
INSERT INTO users (uuid, name, email, password, role, empresa)
VALUES (
  '1749f82d-0aba-11f1-b5c5-0cc47a08e0d8',
  'Administrador General',
  'pruebas@nicksystem.com',
  '$2a$10$SQ382ScImEnz2yL4zzZkv.NmveD76AEMu975vZwIhvdlCGwLiZ.b.',
  'admin',
  'NickSystem'
)
ON DUPLICATE KEY UPDATE email = VALUES(email);
