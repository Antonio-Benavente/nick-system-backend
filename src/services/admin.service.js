import pool from '../config/db.js';

/**
 * Servicio para operaciones administrativas
 * Implementa lÃ³gica de negocio separada del controlador
 */
class AdminService {
  /**
   * Obtiene estadÃ­sticas generales del dashboard
   */
  async getDashboardStats() {
    const [stats] = await pool.query(`
      SELECT
        (SELECT COUNT(*) FROM reportes WHERE estado = 'activo') AS total_reportes,
        (SELECT COUNT(*) FROM tecnicos WHERE estado = 'activo') AS empleados_activos,
        (SELECT COUNT(*) FROM clientes WHERE estado = 'activo') AS clientes_activos,
        (SELECT COUNT(*) FROM reportes WHERE estado = 'activo' AND cliente_conforme = 'conforme') AS reportes_conformes,
        (SELECT COUNT(*) FROM reportes WHERE estado = 'activo' AND cliente_conforme = 'no_conforme') AS reportes_no_conformes,
        (SELECT COUNT(*) FROM reportes WHERE estado = 'activo' AND cliente_conforme = 'por_confirmar') AS reportes_por_confirmar
    `);

    return stats[0];
  }

  /**
   * Obtiene reportes del mes actual (del 1 hasta la fecha actual)
   */
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

  /**
   * Obtiene estadÃ­sticas de reportes por categorÃ­a
   */
  async getReportesPorCategoria() {
    const [categorias] = await pool.query(`
      SELECT
        categoria,
        COUNT(*) AS cantidad,
        SUM(CASE WHEN cliente_conforme = 'conforme' THEN 1 ELSE 0 END) AS conformes,
        SUM(CASE WHEN cliente_conforme = 'no_conforme' THEN 1 ELSE 0 END) AS no_conformes,
        SUM(CASE WHEN cliente_conforme = 'por_confirmar' THEN 1 ELSE 0 END) AS por_confirmar
      FROM reportes
      WHERE estado = 'activo'
      GROUP BY categoria
      ORDER BY cantidad DESC
    `);

    return categorias;
  }

  /**
   * Filtra reportes con mÃºltiples criterios
   */
  async filtrarReportes(filtros) {
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
        c.uuid AS cliente_uuid,
        c.nombre AS cliente_nombre,
        c.empresa AS cliente_empresa,
        t.uuid AS tecnico_uuid,
        t.nombre AS tecnico_nombre,
        t.especialidad AS tecnico_especialidad
      FROM reportes r
      INNER JOIN clientes c ON c.id = r.cliente_id
      INNER JOIN tecnicos t ON t.id = r.tecnico_id
      WHERE 1=1
    `;

    const params = [];

    // Filtro por estado
    if (filtros.incluir_eliminados !== 'true') {
      query += ` AND r.estado = 'activo'`;
    }

    // Filtro por nombre de tÃ©cnico
    if (filtros.tecnico_nombre) {
      query += ` AND t.nombre LIKE ?`;
      params.push(`%${filtros.tecnico_nombre}%`);
    }

    // Filtro por UUID de tÃ©cnico
    if (filtros.tecnico_uuid) {
      query += ` AND t.uuid = ?`;
      params.push(filtros.tecnico_uuid);
    }

    // Filtro por nombre de cliente
    if (filtros.cliente_nombre) {
      query += ` AND (c.nombre LIKE ? OR c.empresa LIKE ?)`;
      params.push(`%${filtros.cliente_nombre}%`, `%${filtros.cliente_nombre}%`);
    }

    // Filtro por UUID de cliente
    if (filtros.cliente_uuid) {
      query += ` AND c.uuid = ?`;
      params.push(filtros.cliente_uuid);
    }

    // Filtro por categorÃ­a
    if (filtros.categoria) {
      query += ` AND r.categoria = ?`;
      params.push(filtros.categoria);
    }

    // Filtro por modalidad
    if (filtros.modalidad) {
      query += ` AND r.modalidad = ?`;
      params.push(filtros.modalidad);
    }

    // Filtro por estado de conformidad
    if (filtros.cliente_conforme) {
      query += ` AND r.cliente_conforme = ?`;
      params.push(filtros.cliente_conforme);
    }

    // Filtro por rango de fechas
    if (filtros.fecha_desde) {
      query += ` AND r.fecha >= ?`;
      params.push(filtros.fecha_desde);
    }

    if (filtros.fecha_hasta) {
      query += ` AND r.fecha <= ?`;
      params.push(filtros.fecha_hasta);
    }

    query += ' ORDER BY r.fecha DESC, r.created_at DESC';

    const [reportes] = await pool.query(query, params);

    // Obtener evidencias para cada reporte
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

    return reportes;
  }
}

export default new AdminService();
