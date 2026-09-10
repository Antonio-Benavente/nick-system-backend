-- ============================================
-- NICK SYSTEM - SCHEMA MYSQL
-- ============================================
-- Versión: 3.0 — sincronizado con BD producción
-- SGBD: MySQL 8.0+ / MariaDB 10.6+
-- Fuente: Nicksystem.sql (dump producción 2026-08-20)
-- ============================================

SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ============================================
-- TABLA: users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid CHAR(36) NOT NULL,
  name VARCHAR(100) NOT NULL,
  email VARCHAR(100) NOT NULL,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'tecnico', 'cliente') NOT NULL,
  empresa VARCHAR(100) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  PRIMARY KEY (id),
  UNIQUE KEY uuid (uuid),
  UNIQUE KEY email (email),
  KEY idx_users_email (email),
  KEY idx_users_role (role),
  KEY idx_users_uuid (uuid)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: tecnicos
-- ============================================
CREATE TABLE IF NOT EXISTS tecnicos (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  KEY idx_tecnicos_uuid (uuid),
  CONSTRAINT tecnicos_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: clientes
-- ============================================
CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  KEY idx_clientes_uuid (uuid),
  CONSTRAINT clientes_ibfk_1 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: categorias
-- ============================================
CREATE TABLE IF NOT EXISTS categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
-- ============================================
CREATE TABLE IF NOT EXISTS reportes (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  KEY idx_reportes_fecha (fecha),
  KEY idx_reportes_estado (estado),
  KEY idx_reportes_cliente (cliente_id),
  KEY idx_reportes_tecnico (tecnico_id),
  KEY idx_reportes_categoria (categoria),
  KEY idx_reportes_modalidad (modalidad),
  KEY idx_reportes_conformidad (cliente_conforme),
  KEY idx_reportes_uuid (uuid),
  CONSTRAINT reportes_ibfk_1 FOREIGN KEY (cliente_id) REFERENCES clientes (id),
  CONSTRAINT reportes_ibfk_2 FOREIGN KEY (tecnico_id) REFERENCES tecnicos (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: reporte_evidencias
-- ============================================
CREATE TABLE IF NOT EXISTS reporte_evidencias (
  id INT AUTO_INCREMENT PRIMARY KEY,
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
  KEY idx_evidencias_uuid (uuid),
  CONSTRAINT reporte_evidencias_ibfk_1 FOREIGN KEY (reporte_id) REFERENCES reportes (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: claves (credenciales de empresas)
-- ============================================
CREATE TABLE IF NOT EXISTS claves (
  id INT AUTO_INCREMENT PRIMARY KEY,
  empresa VARCHAR(150) NOT NULL,
  tipo ENUM('correo', 'pc', 'anydesk') NOT NULL,
  usuario VARCHAR(100) NOT NULL,
  password VARCHAR(30) NOT NULL,
  estado ENUM('activo', 'inactivo') DEFAULT 'activo',
  UNIQUE KEY uk_claves_empresa_tipo_usuario (empresa, tipo, usuario),
  KEY idx_estado (estado)
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

INSERT INTO users (uuid, name, email, password, role, empresa)
VALUES (
  '1749f82d-0aba-11f1-b5c5-0cc47a08e0d8',
  'Administrador General',
  'pruebas@nicksystem.com',
  '$2a$10$SQ382ScImEnz2yL4zzZkv.NmveD76AEMu975vZwIhvdlCGwLiZ.b.',
  'admin',
  'Nick System'
)
ON DUPLICATE KEY UPDATE email = VALUES(email);
