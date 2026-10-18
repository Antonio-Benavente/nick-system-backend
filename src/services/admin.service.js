import pool from '../config/db.js';
import { attachEvidencias } from './evidencias.service.js';
import {
  validarRangoFechas,
  validarEnumFiltro,
  sanear,
  REPORTE_MODALIDADES,
  REPORTE_CONFORMIDAD,
  REPORTE_LIMITES
} from '../validators/validators.js';

const LIMITE_BUSQUEDA = 100;

class AdminService {

  async getDashboardStats() {
    const [stats] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM reportes WHERE estado = 'activo') AS total_reportes,
        (SELECT COUNT(*) FROM tecnicos WHERE estado = 'activo') AS empleados_activos,
        (SELECT COUNT(*) FROM clientes WHERE estado = 'activo') AS clientes_activos,
        (SELECT COUNT(*) FROM reportes WHERE estado = 'activo' AND cliente_conforme = 'conforme') AS reportes_conformes,
        (SELECT COUNT(*) FROM reportes WHERE estado = 'activo' AND cliente_conforme = 'no_conforme') AS reportes_no_conformes,
        (SELECT COUNT(*) FROM reportes WHERE estado = 'activo' AND cliente_conforme = 'por_confirmar') AS reportes_por_confirmar,
        (SELECT COUNT(*) FROM tickets) AS total_tickets,
        (SELECT COUNT(*) FROM tickets WHERE estado = 'pendiente') AS tickets_pendientes,
        (SELECT COUNT(*) FROM tickets WHERE estado = 'asignado') AS tickets_asignados,
        (SELECT COUNT(*) FROM tickets WHERE estado = 'en_servicio') AS tickets_en_servicio,
        (SELECT COUNT(*) FROM tickets WHERE estado = 'atendido') AS tickets_atendidos,
        (SELECT COUNT(*) FROM tickets WHERE estado = 'cancelado') AS tickets_cancelados,
        (SELECT COUNT(*) FROM tickets WHERE cliente_uuid IS NOT NULL) AS tickets_vinculados,
        (SELECT COUNT(*) FROM tickets WHERE cliente_uuid IS NULL) AS tickets_sin_cliente
    `);

    return stats[0];
  }

  async getReportesMesActual() {
    const [reportes] = await pool.query(`
      SELECT
        r.id,
        r.uuid,
        r.categoria,
        r.descripcion,
        r.fecha,
        r.modalidad,
        r.cliente_conforme,
        r.estado,
        c.nombre AS cliente_nombre,
        c.empresa AS cliente_empresa,
        t.nombre AS tecnico_nombre,
        t.especialidad AS tecnico_especialidad
      FROM reportes r
      INNER JOIN clientes c ON c.id = r.cliente_id
      INNER JOIN tecnicos t ON t.id = r.tecnico_id
      WHERE r.estado = 'activo'
        AND YEAR(r.fecha) = YEAR(CURDATE())
        AND MONTH(r.fecha) = MONTH(CURDATE())
      ORDER BY r.fecha DESC, r.created_at DESC
    `);

    return reportes;
  }

  async getReportesPorCategoria() {
    const [categorias] = await pool.query(`
      SELECT
        categoria,
        COUNT(*) AS cantidad,
        CAST(COALESCE(SUM(CASE WHEN cliente_conforme = 'conforme' THEN 1 ELSE 0 END), 0) AS SIGNED) AS conformes,
        CAST(COALESCE(SUM(CASE WHEN cliente_conforme = 'no_conforme' THEN 1 ELSE 0 END), 0) AS SIGNED) AS no_conformes,
        CAST(COALESCE(SUM(CASE WHEN cliente_conforme = 'por_confirmar' THEN 1 ELSE 0 END), 0) AS SIGNED) AS por_confirmar
      FROM reportes
      WHERE estado = 'activo'
      GROUP BY categoria
      ORDER BY cantidad DESC
    `);

    return categorias;
  }

  construirFiltrosReportes(filtros) {
    const condiciones = [];
    const params = [];

    if (filtros.incluir_eliminados !== 'true') {
      condiciones.push('r.estado = ?');
      params.push('activo');
    }

    const tecnicoNombre = sanear(filtros.tecnico_nombre, LIMITE_BUSQUEDA);
    if (tecnicoNombre) {
      condiciones.push('t.nombre LIKE ?');
      params.push(`%${tecnicoNombre}%`);
    }

    if (filtros.tecnico_uuid) {
      condiciones.push('t.uuid = ?');
      params.push(sanear(filtros.tecnico_uuid, 36));
    }

    const clienteNombre = sanear(filtros.cliente_nombre, LIMITE_BUSQUEDA);
    if (clienteNombre) {
      condiciones.push('(c.nombre LIKE ? OR c.empresa LIKE ?)');
      params.push(`%${clienteNombre}%`, `%${clienteNombre}%`);
    }

    if (filtros.cliente_uuid) {
      condiciones.push('c.uuid = ?');
      params.push(sanear(filtros.cliente_uuid, 36));
    }

    const categoria = sanear(filtros.categoria, REPORTE_LIMITES.categoria);
    if (categoria) {
      condiciones.push('r.categoria = ?');
      params.push(categoria);
    }

    const modalidad = validarEnumFiltro(filtros.modalidad, REPORTE_MODALIDADES, 'modalidad');
    if (modalidad) {
      condiciones.push('r.modalidad = ?');
      params.push(modalidad);
    }

    const conformidad = validarEnumFiltro(
      filtros.cliente_conforme,
      REPORTE_CONFORMIDAD,
      'cliente_conforme'
    );
    if (conformidad) {
      condiciones.push('r.cliente_conforme = ?');
      params.push(conformidad);
    }

    const rango = validarRangoFechas(filtros);

    if (rango.fecha_desde) {
      condiciones.push('r.fecha >= ?');
      params.push(rango.fecha_desde);
    }

    if (rango.fecha_hasta) {
      condiciones.push('r.fecha <= ?');
      params.push(rango.fecha_hasta);
    }

    return { condiciones, params };
  }

  async filtrarReportes(filtros, paginacion = { limite: 5000, offset: 0 }) {
    const { condiciones, params } = this.construirFiltrosReportes(filtros);
    const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

    const [reportes] = await pool.query(
      `
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
        t.uuid AS tecnico_uuid,
        t.nombre AS tecnico_nombre,
        t.especialidad AS tecnico_especialidad
      FROM reportes r
      INNER JOIN clientes c ON c.id = r.cliente_id
      INNER JOIN tecnicos t ON t.id = r.tecnico_id
      ${donde}
      ORDER BY r.fecha DESC, r.created_at DESC
      LIMIT ? OFFSET ?
    `,
      [...params, paginacion.limite, paginacion.offset]
    );

    return attachEvidencias(reportes);
  }
}

export default new AdminService();
