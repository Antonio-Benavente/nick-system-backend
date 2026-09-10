import pool from '../config/db.js';

const COLUMNAS = 'uuid, url, tipo, descripcion, orden, created_at';
const COLUMNAS_BASICAS = 'uuid, url, tipo, descripcion, orden';

export async function getEvidenciasPorReporte(reporteId, { includeCreatedAt = true } = {}) {
  const columns = includeCreatedAt ? COLUMNAS : COLUMNAS_BASICAS;

  const [evidencias] = await pool.query(
    `SELECT ${columns}
     FROM reporte_evidencias
     WHERE reporte_id = ?
     ORDER BY orden ASC`,
    [reporteId]
  );

  return evidencias;
}

export async function getEvidenciasPorReportes(reporteIds) {
  if (!Array.isArray(reporteIds) || reporteIds.length === 0) {
    return [];
  }

  const [rows] = await pool.query(
    `SELECT reporte_id, ${COLUMNAS}
     FROM reporte_evidencias
     WHERE reporte_id IN (?)
     ORDER BY reporte_id, orden ASC`,
    [reporteIds]
  );

  return rows;
}

export async function attachEvidencias(reportes) {
  if (!Array.isArray(reportes) || reportes.length === 0) {
    return reportes;
  }

  const reporteIds = reportes.map(r => r.id);
  const rows = await getEvidenciasPorReportes(reporteIds);

  const evidenciasPorReporte = new Map();
  for (const row of rows) {
    const { reporte_id, ...evidencia } = row;
    if (!evidenciasPorReporte.has(reporte_id)) {
      evidenciasPorReporte.set(reporte_id, []);
    }
    evidenciasPorReporte.get(reporte_id).push(evidencia);
  }

  for (const reporte of reportes) {
    reporte.evidencias = evidenciasPorReporte.get(reporte.id) || [];
  }

  return reportes;
}