import pool from '../config/db.js';
import { validateConformidad, ValidationError } from '../validators/validators.js';

// =====================================================
// OBTENER MIS REPORTES (Cliente autenticado)
// =====================================================
export const getMisReportes = async (req, res) => {
  try {
    const userId = req.user.id;
    const { incluir_eliminados } = req.query;

    // Obtener el ID del cliente
    const [cliente] = await pool.query(
      'SELECT id FROM clientes WHERE user_id = ?',
      [userId]
    );

    if (cliente.length === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    const clienteId = cliente[0].id;

    // Obtener reportes del cliente
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

    const params = [clienteId];

    if (incluir_eliminados !== 'true') {
      query += ` AND r.estado = 'activo'`;
    }

    query += ' ORDER BY r.fecha DESC, r.created_at DESC';

    const [reportes] = await pool.query(query, params);

    // NUEVO: Obtener evidencias para cada reporte
    for (const reporte of reportes) {
      const [evidencias] = await pool.query(
        `SELECT uuid, url, tipo, descripcion, orden, created_at
         FROM reporte_evidencias
         WHERE reporte_id = ?
         ORDER BY orden ASC`,
        [reporte.id]
      );
      
      reporte.evidencias = evidencias;
    }

    res.json(reportes);
  } catch (error) {
    console.error('Error en getMisReportes (cliente):', error);
    res.status(500).json({ message: 'Error al obtener reportes' });
  }
};

// =====================================================
// OBTENER REPORTE ESPECÍFICO (Cliente autenticado)
// =====================================================
export const getReporteByUuid = async (req, res) => {
  try {
    const userId = req.user.id;
    const { uuid } = req.params;

    // Obtener el ID del cliente
    const [cliente] = await pool.query(
      'SELECT id FROM clientes WHERE user_id = ?',
      [userId]
    );

    if (cliente.length === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    const clienteId = cliente[0].id;

    // Obtener el reporte solo si pertenece al cliente
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
    `, [uuid, clienteId]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    const reporte = rows[0];

    // NUEVO: Obtener evidencias del reporte
    const [evidencias] = await pool.query(
      `SELECT uuid, url, tipo, descripcion, orden, created_at
       FROM reporte_evidencias
       WHERE reporte_id = ?
       ORDER BY orden ASC`,
      [reporte.id]
    );

    reporte.evidencias = evidencias;

    res.json(reporte);
  } catch (error) {
    console.error('Error en getReporteByUuid (cliente):', error);
    res.status(500).json({ message: 'Error al obtener reporte' });
  }
};

// =====================================================
// ACTUALIZAR CONFORMIDAD DEL REPORTE (Cliente autenticado)
// VERSIÓN CORREGIDA
// =====================================================
export const updateConformidad = async (req, res) => {
  try {
    const userId = req.user.id;
    const { uuid } = req.params;

    // Validar datos de entrada
    validateConformidad(req.body);

    const { cliente_conforme, aprobado_por } = req.body;

    // Obtener el ID del cliente
    const [cliente] = await pool.query(
      'SELECT id FROM clientes WHERE user_id = ?',
      [userId]
    );

    if (cliente.length === 0) {
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    const clienteId = cliente[0].id;

    // Verificar que el reporte existe
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

    // Verificar permisos
    if (reporte[0].cliente_id !== clienteId) {
      return res.status(403).json({ message: 'No tienes permisos para modificar este reporte' });
    }

    // Actualizar conformidad
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

// =====================================================
// OBTENER MI PERFIL (Cliente autenticado)
// =====================================================
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