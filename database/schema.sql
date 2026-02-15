-- ============================================
-- NICK SYSTEM - SCHEMA MYSQL
-- ============================================
-- Versión: 2.0
-- SGBD: MySQL 8.0+
-- ============================================

-- Configuración de caracteres
SET NAMES utf8mb4;
SET CHARACTER SET utf8mb4;

-- ============================================
-- TABLA: users
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role ENUM('admin', 'tecnico', 'cliente') NOT NULL,
  empresa VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_email (email),
  INDEX idx_uuid (uuid),
  INDEX idx_role (role)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: tecnicos
-- ============================================
CREATE TABLE IF NOT EXISTS tecnicos (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  user_id INT DEFAULT NULL,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  telefono VARCHAR(20) DEFAULT NULL,
  especialidad VARCHAR(255) DEFAULT NULL,
  estado ENUM('activo', 'inactivo') DEFAULT 'activo',
  fecha_ingreso DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_uuid (uuid),
  INDEX idx_email (email),
  INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: clientes
-- ============================================
CREATE TABLE IF NOT EXISTS clientes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  user_id INT DEFAULT NULL,
  nombre VARCHAR(255) NOT NULL,
  empresa VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  telefono VARCHAR(20) DEFAULT NULL,
  direccion TEXT DEFAULT NULL,
  estado ENUM('activo', 'inactivo') DEFAULT 'activo',
  fecha_registro DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_uuid (uuid),
  INDEX idx_email (email),
  INDEX idx_empresa (empresa),
  INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: categorias
-- ============================================
CREATE TABLE IF NOT EXISTS categorias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL UNIQUE,
  estado ENUM('activo', 'eliminado') DEFAULT 'activo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  INDEX idx_nombre (nombre),
  INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: reportes
-- ============================================
CREATE TABLE IF NOT EXISTS reportes (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  cliente_id INT NOT NULL,
  tecnico_id INT NOT NULL,
  categoria VARCHAR(255) NOT NULL,
  descripcion TEXT DEFAULT NULL,
  fecha DATE NOT NULL,
  modalidad ENUM('presencial', 'remoto') NOT NULL,
  cliente_conforme ENUM('conforme', 'no_conforme', 'por_confirmar') DEFAULT 'por_confirmar',
  aprobado_por VARCHAR(255) DEFAULT NULL,
  estado ENUM('activo', 'inactivo', 'eliminado') DEFAULT 'activo',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (cliente_id) REFERENCES clientes(id) ON DELETE CASCADE,
  FOREIGN KEY (tecnico_id) REFERENCES tecnicos(id) ON DELETE CASCADE,
  INDEX idx_uuid (uuid),
  INDEX idx_cliente_id (cliente_id),
  INDEX idx_tecnico_id (tecnico_id),
  INDEX idx_fecha (fecha),
  INDEX idx_categoria (categoria),
  INDEX idx_modalidad (modalidad),
  INDEX idx_cliente_conforme (cliente_conforme),
  INDEX idx_estado (estado)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- TABLA: reporte_evidencias
-- ============================================
CREATE TABLE IF NOT EXISTS reporte_evidencias (
  id INT AUTO_INCREMENT PRIMARY KEY,
  uuid VARCHAR(36) NOT NULL UNIQUE,
  reporte_id INT NOT NULL,
  url TEXT NOT NULL,
  tipo ENUM('imagen', 'video', 'documento') DEFAULT 'imagen',
  descripcion TEXT DEFAULT NULL,
  orden INT DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  
  FOREIGN KEY (reporte_id) REFERENCES reportes(id) ON DELETE CASCADE,
  INDEX idx_uuid (uuid),
  INDEX idx_reporte_id (reporte_id),
  INDEX idx_tipo (tipo),
  INDEX idx_orden (orden)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ============================================
-- DATOS INICIALES
-- ============================================

-- Categorías por defecto
INSERT INTO categorias (nombre, estado) VALUES
  ('Mantenimiento Preventivo', 'activo'),
  ('Mantenimiento Correctivo', 'activo'),
  ('Instalación', 'activo'),
  ('Reparación', 'activo'),
  ('Configuración', 'activo'),
  ('Soporte Técnico', 'activo')
ON DUPLICATE KEY UPDATE nombre = VALUES(nombre);

-- Usuario administrador (password: u1t2ikPDnw3u)

INSERT INTO users (uuid, name, email, password, role, empresa)
VALUES (
  UUID(),
  'Administrador General',
  'pruebas@nicksystem.com',
  '$2a$10$QXLIvfcP.Opz2cvP6mTNB.QMpYk6V./qYnyJHMaTgGqcq5xCWXa/y',
  'admin',
  'Nick System'
);
ON DUPLICATE KEY UPDATE email = VALUES(email);

-- ============================================
-- VERIFICACIÓN
-- ============================================
SELECT 'Base de datos MySQL creada correctamente ✓' AS mensaje,
       COUNT(*) AS total_tablas
FROM information_schema.tables
WHERE table_schema = DATABASE();