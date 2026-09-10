import pool from '../config/db.js';
import { validateConformidad, ValidationError } from '../validators/validators.js';
import { attachEvidencias, getEvidenciasPorReporte } from '../services/evidencias.service.js';
import { getClienteByUserId } from '../services/entidades.service.js';

export const getMisReportes = async (req, res) => {
  try {
    const userId = req.user.id;
    const { incluir_eliminados } = req.query;

    const cliente = await getClienteByUserId(userId);

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    let query = `
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
      WHERE r.cliente_id = ?
    `;

    const params = [cliente.id];

    if (incluir_eliminados !== 'true') {
      query += ` AND r.estado = 'activo'`;
    }

    query += ' ORDER BY r.fecha DESC, r.created_at DESC';

    const [reportes] = await pool.query(query, params);

    res.json(await attachEvidencias(reportes));
  } catch (error) {
    console.error('Error en getMisReportes (cliente):', error);
    res.status(500).json({ message: 'Error al obtener reportes' });
  }
};

export const getReporteByUuid = async (req, res) => {
  try {
    const userId = req.user.id;
    const { uuid } = req.params;

    const cliente = await getClienteByUserId(userId);

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
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
    `, [uuid, cliente.id]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    const reporte = rows[0];

    reporte.evidencias = await getEvidenciasPorReporte(reporte.id);

    res.json(reporte);
  } catch (error) {
    console.error('Error en getReporteByUuid (cliente):', error);
    res.status(500).json({ message: 'Error al obtener reporte' });
  }
};

export const updateConformidad = async (req, res) => {
  try {
    const userId = req.user.id;
    const { uuid } = req.params;

    validateConformidad(req.body);

    const { cliente_conforme, aprobado_por } = req.body;

    const cliente = await getClienteByUserId(userId);

    if (!cliente) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    const [reporte] = await pool.query(
      'SELECT id, cliente_id, cliente_conforme, estado FROM reportes WHERE uuid = ?',
      [uuid]
    );

    if (reporte.length === 0) {
      return res.status(404).json({
        message: 'Reporte no encontrado',
        uuid_buscado: uuid
      });
    }

    if (reporte[0].cliente_id !== cliente.id) {
      return res.status(403).json({ message: 'No tienes permisos para modificar este reporte' });
    }

    const [result] = await pool.query(
      `UPDATE reportes
       SET cliente_conforme = ?, aprobado_por = ?
       WHERE uuid = ?`,
      [cliente_conforme, aprobado_por || null, uuid]
    );

    if (result.affectedRows === 0) {
      return res.status(500).json({ message: 'Error al actualizar el reporte' });
    }

    res.json({
      message: 'Conformidad actualizada correctamente',
      estado: cliente_conforme,
      aprobado_por: aprobado_por || null
    });

  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        message: error.message,
        field: error.field
      });
    }

    console.error('Error en updateConformidad (cliente):', error);
    res.status(500).json({ message: 'Error al actualizar conformidad' });
  }
};

export const getMiPerfil = async (req, res) => {
  try {
    const userId = req.user.id;

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
    `, [userId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Perfil de cliente no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error en getMiPerfil (cliente):', error);
    res.status(500).json({ message: 'Error al obtener perfil' });
  }
};