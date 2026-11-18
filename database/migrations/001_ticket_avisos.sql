-- Base de datos existentes: crear la tabla de avisos a técnicos.
-- En instalaciones nuevas esta tabla ya viene en database/schema.sql.
CREATE TABLE IF NOT EXISTS ticket_avisos (
  id INT AUTO_INCREMENT,
  ticket_uuid CHAR(36) NOT NULL,
  tecnico_uuid CHAR(36) NOT NULL,
  mensaje VARCHAR(200) DEFAULT NULL,
  estado ENUM('pendiente', 'aceptada', 'cerrada') NOT NULL DEFAULT 'pendiente',
  avisado_por VARCHAR(150) DEFAULT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  respondida_at DATETIME DEFAULT NULL,

  PRIMARY KEY (id),
  UNIQUE KEY uq_ticket_avisos_ticket_tecnico (ticket_uuid, tecnico_uuid),
  KEY idx_ticket_avisos_tecnico_estado (tecnico_uuid, estado),
  KEY idx_ticket_avisos_ticket (ticket_uuid),
  CONSTRAINT ticket_avisos_ibfk_1 FOREIGN KEY (ticket_uuid) REFERENCES tickets (uuid) ON DELETE CASCADE,
  CONSTRAINT ticket_avisos_ibfk_2 FOREIGN KEY (tecnico_uuid) REFERENCES tecnicos (uuid) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
