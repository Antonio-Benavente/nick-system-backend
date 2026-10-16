import pool from '../config/db.js';
import AdminService from '../services/admin.service.js';
import { validateReporteUpdate } from '../validators/validators.js';
import { abortar } from '../middlewares/error.middleware.js';
import { getEvidenciasPorReporte } from '../services/evidencias.service.js';
import { leerPaginacion, cabeceraPaginacion, contar } from '../services/paginacion.service.js';

export const getDashboardStats = async (req, res) => {
  res.json(await AdminService.getDashboardStats());
};

export const getReportesMesActual = async (req, res) => {
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
};

export const getReportesPorCategoria = async (req, res) => {
  res.json(await AdminService.getReportesPorCategoria());
};

export const getReportes = async (req, res) => {
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

  const paginacion = leerPaginacion(req.query);

  if (paginacion.activa) {
    const { condiciones, params } = AdminService.construirFiltrosReportes(filtros);
    const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
    const total = await contar(
      pool,
      `SELECT COUNT(*) AS total
       FROM reportes r
       INNER JOIN clientes c ON c.id = r.cliente_id
       INNER JOIN tecnicos t ON t.id = r.tecnico_id
       ${donde}`,
      params
    );
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  res.json(await AdminService.filtrarReportes(filtros, paginacion));
};

export const getReporteByUuid = async (req, res) => {
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
  `, [req.params.uuid]);

  if (rows.length === 0) {
    throw abortar(404, 'Reporte no encontrado');
  }

  const reporte = rows[0];

  reporte.evidencias = await getEvidenciasPorReporte(reporte.id);

  res.json(reporte);
};

export const updateReporte = async (req, res) => {
  const { uuid } = req.params;
  const { categoria, descripcion, fecha, modalidad, estado } = req.body;

  const datos = Object.entries({ categoria, descripcion, fecha, modalidad, estado })
    .reduce((acc, [campo, valor]) => {
      if (valor !== undefined) acc[campo] = valor;
      return acc;
    }, {});

  validateReporteUpdate(datos);

  const [reporte] = await pool.query('SELECT id FROM reportes WHERE uuid = ?', [uuid]);

  if (reporte.length === 0) {
    throw abortar(404, 'Reporte no encontrado');
  }

  const updates = [];
  const values = [];

  if (categoria !== undefined) {
    const [cat] = await pool.query(
      "SELECT id FROM categorias WHERE nombre = ? AND estado = 'activo'",
      [categoria]
    );

    if (cat.length === 0) {
      throw abortar(400, 'Categoría no válida o inactiva', {
        message: 'Categoría no válida o inactiva',
        field: 'categoria'
      });
    }

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

  const [result] = await pool.query(
    `UPDATE reportes SET ${updates.join(', ')} WHERE uuid = ?`,
    [...values, uuid]
  );

  if (result.affectedRows === 0) {
    throw abortar(404, 'Reporte no encontrado');
  }

  res.json({ message: 'Reporte actualizado correctamente' });
};
