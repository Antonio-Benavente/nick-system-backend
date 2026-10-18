import pool from '../config/db.js';
import {
  validateConformidad,
  validarRangoFechas,
  validarEnumFiltro,
  REPORTE_CONFORMIDAD
} from '../validators/validators.js';
import { abortar } from '../middlewares/error.middleware.js';
import { attachEvidencias, getEvidenciasPorReporte } from '../services/evidencias.service.js';
import { leerPaginacion, cabeceraPaginacion, contar } from '../services/paginacion.service.js';

export const getMisReportes = async (req, res) => {
  const { incluir_eliminados } = req.query;
  const paginacion = leerPaginacion(req.query);
  const rango = validarRangoFechas(req.query);

  const cliente = req.user.cliente;

  if (!cliente) {
    throw abortar(404, 'Cliente no encontrado');
  }

  const condiciones = ['r.cliente_id = ?'];
  const params = [cliente.id];

  if (incluir_eliminados !== 'true') {
    condiciones.push("r.estado = 'activo'");
  }

  const conformidad = validarEnumFiltro(
    req.query.cliente_conforme,
    REPORTE_CONFORMIDAD,
    'cliente_conforme'
  );
  if (conformidad) {
    condiciones.push('r.cliente_conforme = ?');
    params.push(conformidad);
  }

  if (rango.fecha_desde) {
    condiciones.push('r.fecha >= ?');
    params.push(rango.fecha_desde);
  }

  if (rango.fecha_hasta) {
    condiciones.push('r.fecha <= ?');
    params.push(rango.fecha_hasta);
  }

  const donde = `WHERE ${condiciones.join(' AND ')}`;

  if (paginacion.activa) {
    const total = await contar(
      pool,
      `SELECT COUNT(*) AS total FROM reportes r ${donde}`,
      params
    );
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  const [reportes] = await pool.query(`
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
      t.uuid AS tecnico_uuid,
      t.nombre AS tecnico_nombre,
      t.email AS tecnico_email,
      t.especialidad AS tecnico_especialidad
    FROM reportes r
    INNER JOIN tecnicos t ON t.id = r.tecnico_id
    ${donde}
    ORDER BY r.fecha DESC, r.created_at DESC
    LIMIT ? OFFSET ?
  `, [...params, paginacion.limite, paginacion.offset]);

  res.json(await attachEvidencias(reportes));
};

export const getReporteByUuid = async (req, res) => {
  const cliente = req.user.cliente;

  if (!cliente) {
    throw abortar(404, 'Cliente no encontrado');
  }

  const [rows] = await pool.query(`
    SELECT
      r.*,
      t.uuid AS tecnico_uuid,
      t.nombre AS tecnico_nombre,
      t.email AS tecnico_email,
      t.especialidad AS tecnico_especialidad
    FROM reportes r
    INNER JOIN tecnicos t ON t.id = r.tecnico_id
    WHERE r.uuid = ? AND r.cliente_id = ?
  `, [req.params.uuid, cliente.id]);

  if (rows.length === 0) {
    throw abortar(404, 'Reporte no encontrado');
  }

  const reporte = rows[0];

  reporte.evidencias = await getEvidenciasPorReporte(reporte.id);

  res.json(reporte);
};

export const updateConformidad = async (req, res) => {
  validateConformidad(req.body);

  const { cliente_conforme, aprobado_por } = req.body;

  const cliente = req.user.cliente;

  if (!cliente) {
    throw abortar(404, 'Cliente no encontrado');
  }

  const [reporte] = await pool.query(
    "SELECT id, cliente_id FROM reportes WHERE uuid = ? AND estado = 'activo'",
    [req.params.uuid]
  );

  if (reporte.length === 0) {
    throw abortar(404, 'Reporte no encontrado o eliminado', {
      message: 'Reporte no encontrado o eliminado',
      uuid_buscado: req.params.uuid
    });
  }

  if (reporte[0].cliente_id !== cliente.id) {
    throw abortar(403, 'No tienes permisos para modificar este reporte');
  }

  const [result] = await pool.query(
    `UPDATE reportes
     SET cliente_conforme = ?, aprobado_por = ?
     WHERE uuid = ? AND cliente_id = ?`,
    [cliente_conforme, aprobado_por || null, req.params.uuid, cliente.id]
  );

  if (result.affectedRows === 0) {
    throw abortar(404, 'Reporte no encontrado o eliminado');
  }

  res.json({
    message: 'Conformidad actualizada correctamente',
    estado: cliente_conforme,
    aprobado_por: aprobado_por || null
  });
};

export const getMiPerfil = async (req, res) => {
  const [rows] = await pool.query(`
    SELECT
      c.id,
      c.uuid,
      c.nombre,
      c.empresa,
      c.email,
      c.telefono,
      c.direccion,
      c.estado,
      c.fecha_registro,
      u.id AS user_id,
      u.email AS user_email,
      u.role
    FROM clientes c
    INNER JOIN users u ON u.id = c.user_id
    WHERE c.user_id = ?
  `, [req.user.id]);

  if (rows.length === 0) {
    throw abortar(404, 'Perfil de cliente no encontrado');
  }

  res.json(rows[0]);
};
