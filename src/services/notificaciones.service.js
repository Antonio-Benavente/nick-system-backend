import pool from '../config/db.js';
import emailService from './email.service.js';
import { getEvidenciasPorReporte } from './evidencias.service.js';
import { abortar } from '../middlewares/error.middleware.js';

const SELECT_REPORTE = `
  SELECT
    r.*,
    c.uuid AS cliente_uuid,
    c.nombre AS cliente_nombre,
    c.empresa AS cliente_empresa,
    c.email AS cliente_email,
    t.uuid AS tecnico_uuid,
    t.nombre AS tecnico_nombre,
    t.email AS tecnico_email
  FROM reportes r
  INNER JOIN clientes c ON c.id = r.cliente_id
  INNER JOIN tecnicos t ON t.id = r.tecnico_id
  WHERE r.uuid = ? AND r.estado = 'activo'
`;

export const obtenerReporteNotificable = async (reporteUuid) => {
  const [rows] = await pool.query(SELECT_REPORTE, [reporteUuid]);

  if (rows.length === 0) {
    throw abortar(404, 'Reporte no encontrado o inactivo');
  }

  return rows[0];
};

export const verificarPermisoNotificar = async (reporte, user) => {
  if (user.role !== 'tecnico') return;

  const tecnico = user.tecnico;

  if (!tecnico || tecnico.uuid !== reporte.tecnico_uuid) {
    throw abortar(403, 'No tienes permisos para notificar este reporte');
  }
};

export const enviarNotificacionAlCliente = async (reporte) => {
  if (!reporte.cliente_email) {
    throw abortar(400, 'El cliente no tiene un email registrado');
  }

  reporte.evidencias = await getEvidenciasPorReporte(reporte.id, { includeCreatedAt: false });

  const resultado = await emailService.enviarNotificacionReporte(
    reporte,
    reporte.cliente_email,
    reporte.cliente_nombre,
    reporte.cliente_empresa
  );

  if (!resultado.success) {
    throw abortar(502, 'No se pudo enviar el email al cliente');
  }

  return resultado;
};
