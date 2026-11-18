import AdminService from '../services/admin.service.js';
import { validateReporteUpdate } from '../validators/validators.js';
import { leerPaginacion, cabeceraPaginacion } from '../services/paginacion.service.js';
import { soloDefinidos } from '../utils/objetos.js';

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
    const total = await AdminService.contarReportes(filtros);
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  res.json(await AdminService.filtrarReportes(filtros, paginacion));
};

export const getReporteByUuid = async (req, res) => {
  res.json(await AdminService.getReporteDetalle(req.params.uuid));
};

export const updateReporte = async (req, res) => {
  const datos = soloDefinidos(req.body, ['categoria', 'descripcion', 'fecha', 'modalidad', 'estado']);

  validateReporteUpdate(datos);

  await AdminService.actualizarReporte(req.params.uuid, datos);

  res.json({ message: 'Reporte actualizado correctamente' });
};
