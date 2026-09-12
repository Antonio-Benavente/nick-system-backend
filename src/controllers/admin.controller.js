import pool from '../config/db.js';
import AdminService from '../services/admin.service.js';
import { ValidationError, validateReporteUpdate } from '../validators/validators.js';
import { getEvidenciasPorReporte } from '../services/evidencias.service.js';

export const getDashboardStats = async (req, res) => {
  try {
    const stats = await AdminService.getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('Error en getDashboardStats:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas generales' });
  }
};

export const getReportesMesActual = async (req, res) => {
  try {
    const reportes = await AdminService.getReportesMesActual();

    const conformes = reportes.filter(r => r.cliente_conforme === 'conforme').length;
    const no_conformes = reportes.filter(r => r.cliente_conforme === 'no_conforme').length;
    const por_confirmar = reportes.filter(r => r.cliente_conforme === 'por_confirmar').length;

    res.json({
      total: reportes.length,
      estadisticas: {
        conformes,
        no_conformes,
        por_confirmar
      },
      reportes
    });
  } catch (error) {
    console.error('Error en getReportesMesActual:', error);
    res.status(500).json({ message: 'Error al obtener reportes del mes' });
  }
};

export const getReportesPorCategoria = async (req, res) => {
  try {
    const categorias = await AdminService.getReportesPorCategoria();
    res.json(categorias);
  } catch (error) {
    console.error('Error en getReportesPorCategoria:', error);
    res.status(500).json({ message: 'Error al obtener reportes por categoría' });
  }
};

export const getReportes = async (req, res) => {
  try {
    const filtros = {
      incluir_eliminados: req.query.incluir_eliminados,
      tecnico_nombre: req.query.tecnico_nombre,
      tecnico_uuid: req.query.tecnico_uuid,
      cliente_nombre: req.query.cliente_nombre,
      cliente_uuid: req.query.cliente_uuid,
      categoria: req.query.categoria,
      modalidad: req.query.modalidad,
      cliente_conforme: req.query.cliente_conforme,
      fecha_desde: req.query.fecha_desde,
      fecha_hasta: req.query.fecha_hasta
    };

    const reportes = await AdminService.filtrarReportes(filtros);
    res.json(reportes);
  } catch (error) {
    console.error('Error en getReportes:', error);
    res.status(500).json({ message: 'Error al obtener reportes' });
  }
};

export const getReporteByUuid = async (req, res) => {
  try {
    const { uuid } = req.params;

    const [rows] = await pool.query(`
      SELECT
        r.*,
        c.uuid AS cliente_uuid,
        c.nombre AS cliente_nombre,
        c.empresa AS cliente_empresa,
        c.email AS cliente_email,
        c.telefono AS cliente_telefono,
        t.uuid AS tecnico_uuid,
        t.nombre AS tecnico_nombre,
        t.email AS tecnico_email,
        t.especialidad AS tecnico_especialidad
      FROM reportes r
      INNER JOIN clientes c ON c.id = r.cliente_id
      INNER JOIN tecnicos t ON t.id = r.tecnico_id
      WHERE r.uuid = ?
    `, [uuid]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    const reporte = rows[0];

    reporte.evidencias = await getEvidenciasPorReporte(reporte.id);

    res.json(reporte);
  } catch (error) {
    console.error('Error en getReporteByUuid:', error);
    res.status(500).json({ message: 'Error al obtener reporte' });
  }
};

export const updateReporte = async (req, res) => {
  const { uuid } = req.params;
  const { categoria, descripcion, fecha, modalidad, estado } = req.body;

  try {
    const dataToValidate = {};
    if (categoria !== undefined) dataToValidate.categoria = categoria;
    if (fecha !== undefined) dataToValidate.fecha = fecha;
    if (modalidad !== undefined) dataToValidate.modalidad = modalidad;
    if (estado !== undefined) dataToValidate.estado = estado;
    if (descripcion !== undefined) dataToValidate.descripcion = descripcion;

    validateReporteUpdate(dataToValidate);

    const [reporte] = await pool.query(
      'SELECT id FROM reportes WHERE uuid = ?',
      [uuid]
    );

    if (reporte.length === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    if (categoria) {
      const [cat] = await pool.query(
        'SELECT id FROM categorias WHERE nombre = ? AND estado = "activo"',
        [categoria]
      );
      if (cat.length === 0) {
        return res.status(400).json({ message: 'Categoría no válida o inactiva' });
      }
    }

    const updates = [];
    const values = [];

    if (categoria !== undefined) {
      updates.push('categoria = ?');
      values.push(categoria);
    }
    if (descripcion !== undefined) {
      updates.push('descripcion = ?');
      values.push(descripcion);
    }
    if (fecha !== undefined) {
      updates.push('fecha = ?');
      values.push(fecha);
    }
    if (modalidad !== undefined) {
      updates.push('modalidad = ?');
      values.push(modalidad);
    }
    if (estado !== undefined) {
      updates.push('estado = ?');
      values.push(estado);
    }

    if (updates.length === 0) {
      return res.status(400).json({ message: 'No se proporcionaron campos para actualizar' });
    }

    const query = `UPDATE reportes SET ${updates.join(', ')} WHERE uuid = ?`;
    values.push(uuid);

    const [result] = await pool.query(query, values);

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    res.json({ message: 'Reporte actualizado correctamente' });

  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({
        message: error.message,
        field: error.field
      });
    }

    console.error('Error en updateReporte:', error);
    res.status(500).json({ message: 'Error al actualizar reporte' });
  }
};