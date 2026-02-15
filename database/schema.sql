-- ============================================
-- NICK SYSTEM - SCHEMA DE BASE DE DATOS
-- ============================================
-- Versión: 2.0 PostgreSQL
-- Fecha: 2024-01
-- SGBD: PostgreSQL 14+
-- ============================================

-- Extensiones necesarias
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLA: users
-- Usuarios del sistema (autenticación)
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id SERIAL PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(20) NOT NULL CHECK (role IN ('admin', 'tecnico', 'cliente')),
  empresa VARCHAR(255) DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_uuid ON users(uuid);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- ============================================
-- TABLA: tecnicos
-- ============================================
CREATE TABLE IF NOT EXISTS tecnicos (
  id SERIAL PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  user_id INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
  nombre VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  telefono VARCHAR(20) DEFAULT NULL,
  especialidad VARCHAR(255) DEFAULT NULL,
  estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  fecha_ingreso DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_tecnicos_uuid ON tecnicos(uuid);
CREATE INDEX IF NOT EXISTS idx_tecnicos_email ON tecnicos(email);
CREATE INDEX IF NOT EXISTS idx_tecnicos_estado ON tecnicos(estado);

-- ============================================
-- TABLA: clientes
-- ============================================
CREATE TABLE IF NOT EXISTS clientes (
  id SERIAL PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  user_id INTEGER DEFAULT NULL REFERENCES users(id) ON DELETE SET NULL,
  nombre VARCHAR(255) NOT NULL,
  empresa VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL,
  telefono VARCHAR(20) DEFAULT NULL,
  direccion TEXT DEFAULT NULL,
  estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo')),
  fecha_registro DATE DEFAULT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_clientes_uuid ON clientes(uuid);
CREATE INDEX IF NOT EXISTS idx_clientes_email ON clientes(email);
CREATE INDEX IF NOT EXISTS idx_clientes_empresa ON clientes(empresa);
CREATE INDEX IF NOT EXISTS idx_clientes_estado ON clientes(estado);

-- ============================================
-- TABLA: categorias
-- ============================================
CREATE TABLE IF NOT EXISTS categorias (
  id SERIAL PRIMARY KEY,
  nombre VARCHAR(255) NOT NULL UNIQUE,
  estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'eliminado')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_categorias_nombre ON categorias(nombre);
CREATE INDEX IF NOT EXISTS idx_categorias_estado ON categorias(estado);

-- ============================================
-- TABLA: reportes
-- ============================================
CREATE TABLE IF NOT EXISTS reportes (
  id SERIAL PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  cliente_id INTEGER NOT NULL REFERENCES clientes(id) ON DELETE CASCADE,
  tecnico_id INTEGER NOT NULL REFERENCES tecnicos(id) ON DELETE CASCADE,
  categoria VARCHAR(255) NOT NULL,
  descripcion TEXT DEFAULT NULL,
  fecha DATE NOT NULL,
  modalidad VARCHAR(20) NOT NULL CHECK (modalidad IN ('presencial', 'remoto')),
  cliente_conforme VARCHAR(20) DEFAULT 'por_confirmar' CHECK (cliente_conforme IN ('conforme', 'no_conforme', 'por_confirmar')),
  aprobado_por VARCHAR(255) DEFAULT NULL,
  estado VARCHAR(20) DEFAULT 'activo' CHECK (estado IN ('activo', 'inactivo', 'eliminado')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_reportes_uuid ON reportes(uuid);
CREATE INDEX IF NOT EXISTS idx_reportes_cliente_id ON reportes(cliente_id);
CREATE INDEX IF NOT EXISTS idx_reportes_tecnico_id ON reportes(tecnico_id);
CREATE INDEX IF NOT EXISTS idx_reportes_fecha ON reportes(fecha);
CREATE INDEX IF NOT EXISTS idx_reportes_categoria ON reportes(categoria);
CREATE INDEX IF NOT EXISTS idx_reportes_modalidad ON reportes(modalidad);
CREATE INDEX IF NOT EXISTS idx_reportes_cliente_conforme ON reportes(cliente_conforme);
CREATE INDEX IF NOT EXISTS idx_reportes_estado ON reportes(estado);

-- ============================================
-- TABLA: reporte_evidencias
-- ============================================
CREATE TABLE IF NOT EXISTS reporte_evidencias (
  id SERIAL PRIMARY KEY,
  uuid UUID NOT NULL DEFAULT uuid_generate_v4() UNIQUE,
  reporte_id INTEGER NOT NULL REFERENCES reportes(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  tipo VARCHAR(20) DEFAULT 'imagen' CHECK (tipo IN ('imagen', 'video', 'documento')),
  descripcion TEXT DEFAULT NULL,
  orden INTEGER DEFAULT 1,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_evidencias_uuid ON reporte_evidencias(uuid);
CREATE INDEX IF NOT EXISTS idx_evidencias_reporte_id ON reporte_evidencias(reporte_id);
CREATE INDEX IF NOT EXISTS idx_evidencias_tipo ON reporte_evidencias(tipo);
CREATE INDEX IF NOT EXISTS idx_evidencias_orden ON reporte_evidencias(orden);

-- ============================================
-- TRIGGER PARA AUTO-UPDATE DE TIMESTAMPS
-- ============================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tecnicos_updated_at BEFORE UPDATE ON tecnicos
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_clientes_updated_at BEFORE UPDATE ON clientes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_categorias_updated_at BEFORE UPDATE ON categorias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_reportes_updated_at BEFORE UPDATE ON reportes
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_evidencias_updated_at BEFORE UPDATE ON reporte_evidencias
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

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
ON CONFLICT (nombre) DO NOTHING;

-- Usuario administrador (password: admin123)
INSERT INTO users (name, email, password, role) VALUES
  (
    'Administrador',
    'pruebas@nicksystem.com',
    '$2a$10$8K1p/a0dL3Fgz7ZqLKpuOeRVX6N.YhC1h7PqD4eU5qHqF5VJGvU1a',
    'admin'
  )
ON CONFLICT (email) DO NOTHING;

-- ============================================
-- VISTAS
-- ============================================

CREATE OR REPLACE VIEW vista_reportes_completos AS
SELECT 
  r.id,
  r.uuid,
  r.categoria,
  r.descripcion,
  r.fecha,
  r.modalidad,
  r.cliente_conforme,
  r.aprobado_por,
  r.estado,
  r.created_at,
  c.uuid AS cliente_uuid,
  c.nombre AS cliente_nombre,
  c.empresa AS cliente_empresa,
  c.email AS cliente_email,
  t.uuid AS tecnico_uuid,
  t.nombre AS tecnico_nombre,
  t.email AS tecnico_email,
  t.especialidad AS tecnico_especialidad,
  COUNT(DISTINCT e.id) AS total_evidencias
FROM reportes r
INNER JOIN clientes c ON c.id = r.cliente_id
INNER JOIN tecnicos t ON t.id = r.tecnico_id
LEFT JOIN reporte_evidencias e ON e.reporte_id = r.id
WHERE r.estado = 'activo'
GROUP BY r.id, c.uuid, c.nombre, c.empresa, c.email, t.uuid, t.nombre, t.email, t.especialidad;

-- ============================================
-- VERIFICACIÓN
-- ============================================

SELECT 
  'Base de datos PostgreSQL creada correctamente ✓' AS mensaje,
  COUNT(*) AS total_tablas
FROM information_schema.tables
WHERE table_schema = 'public' AND table_type = 'BASE TABLE';
