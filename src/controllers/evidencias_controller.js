import pool from '../config/db.js';
import { v4 as uuidv4 } from 'uuid';

// =====================================================
// OBTENER EVIDENCIAS DE UN REPORTE
// =====================================================
export const getEvidencias = async (req, res) => {
  try {
    const { reporte_uuid } = req.params;

    // Obtener el ID del reporte
    const [reporte] = await pool.query(
      'SELECT id FROM reportes WHERE uuid = ?',
      [reporte_uuid]
    );

    if (reporte.length === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    // Obtener evidencias ordenadas
    const [evidencias] = await pool.query(
      `SELECT 
        uuid,
        url,
        tipo,
        descripcion,
        orden,
        created_at
      FROM reporte_evidencias
      WHERE reporte_id = ?
      ORDER BY orden ASC, created_at ASC`,
      [reporte[0].id]
    );

    res.json(evidencias);
  } catch (error) {
    console.error('Error en getEvidencias:', error);
    res.status(500).json({ message: 'Error al obtener evidencias' });
  }
};

// =====================================================
// AGREGAR EVIDENCIA A UN REPORTE
// =====================================================
export const addEvidencia = async (req, res) => {
  try {
    const { reporte_uuid } = req.params;
    const { url, tipo, descripcion, orden } = req.body;

    // Validaciones
    if (!url) {
      return res.status(400).json({ message: 'URL es requerida' });
    }

    if (tipo && !['imagen', 'video', 'documento'].includes(tipo)) {
      return res.status(400).json({ message: 'Tipo invÃƒÂ¡lido' });
    }

    // Obtener el ID del reporte
    const [reporte] = await pool.query(
      'SELECT id FROM reportes WHERE uuid = ?',
      [reporte_uuid]
    );

    if (reporte.length === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    const reporteId = reporte[0].id;

    // Si no se especifica orden, usar el siguiente disponible
    let ordenFinal = orden;
    if (!ordenFinal) {
      const [maxOrden] = await pool.query(
        'SELECT COALESCE(MAX(orden), 0) + 1 AS siguiente FROM reporte_evidencias WHERE reporte_id = ?',
        [reporteId]
      );
      ordenFinal = maxOrden[0].siguiente;
    }

    const evidenciaUUID = uuidv4();

    await pool.query(
      `INSERT INTO reporte_evidencias 
       (uuid, reporte_id, url, tipo, descripcion, orden)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [evidenciaUUID, reporteId, url, tipo || 'imagen', descripcion || null, ordenFinal]
    );

    res.status(201).json({
      message: 'Evidencia agregada correctamente',
      uuid: evidenciaUUID
    });
  } catch (error) {
    console.error('Error en addEvidencia:', error);
    res.status(500).json({ message: 'Error al agregar evidencia' });
  }
};

// =====================================================
// AGREGAR MÃƒÅ¡LTIPLES EVIDENCIAS (BATCH)
// =====================================================
export const addEvidenciasBatch = async (req, res) => {
  try {
    const { reporte_uuid } = req.params;
    const { evidencias } = req.body; // Array de { url, tipo, descripcion }

    if (!Array.isArray(evidencias) || evidencias.length === 0) {
      return res.status(400).json({ message: 'Debe proporcionar al menos una evidencia' });
    }

    // Obtener el ID del reporte
    const [reporte] = await pool.query(
      'SELECT id FROM reportes WHERE uuid = ?',
      [reporte_uuid]
    );

    if (reporte.length === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    const reporteId = reporte[0].id;

    // Obtener el orden inicial
    const [maxOrden] = await pool.query(
      'SELECT COALESCE(MAX(orden), 0) AS max_orden FROM reporte_evidencias WHERE reporte_id = ?',
      [reporteId]
    );

    let ordenActual = maxOrden[0].max_orden + 1;
    const uuids = [];

    // Insertar cada evidencia
    for (const evidencia of evidencias) {
      if (!evidencia.url) continue;

      const evidenciaUUID = uuidv4();
      uuids.push(evidenciaUUID);

      await pool.query(
        `INSERT INTO reporte_evidencias 
         (uuid, reporte_id, url, tipo, descripcion, orden)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          evidenciaUUID,
          reporteId,
          evidencia.url,
          evidencia.tipo || 'imagen',
          evidencia.descripcion || null,
          ordenActual++
        ]
      );
    }

    res.status(201).json({
      message: `${uuids.length} evidencias agregadas correctamente`,
      uuids
    });
  } catch (error) {
    console.error('Error en addEvidenciasBatch:', error);
    res.status(500).json({ message: 'Error al agregar evidencias' });
  }
};

// =====================================================
// ACTUALIZAR EVIDENCIA
// =====================================================
export const updateEvidencia = async (req, res) => {
  try {
    const { uuid } = req.params;
    const { url, tipo, descripcion, orden } = req.body;

    const campos = [];
    const valores = [];

    if (url) {
      campos.push('url = ?');
      valores.push(url);
    }

    if (tipo) {
      if (!['imagen', 'video', 'documento'].includes(tipo)) {
        return res.status(400).json({ message: 'Tipo invÃƒÂ¡lido' });
      }
      campos.push('tipo = ?');
      valores.push(tipo);
    }

    if (descripcion !== undefined) {
      campos.push('descripcion = ?');
      valores.push(descripcion);
    }

    if (orden !== undefined) {
      campos.push('orden = ?');
      valores.push(orden);
    }

    if (campos.length === 0) {
      return res.status(400).json({ message: 'No hay campos para actualizar' });
    }

    valores.push(uuid);

    const [result] = await pool.query(
      `UPDATE reporte_evidencias SET ${campos.join(', ')} WHERE uuid = ?`,
      valores
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Evidencia no encontrada' });
    }

    res.json({ message: 'Evidencia actualizada correctamente' });
  } catch (error) {
    console.error('Error en updateEvidencia:', error);
    res.status(500).json({ message: 'Error al actualizar evidencia' });
  }
};

// =====================================================
// ELIMINAR EVIDENCIA
// =====================================================
export const deleteEvidencia = async (req, res) => {
  try {
    const { uuid } = req.params;

    const [result] = await pool.query(
      'DELETE FROM reporte_evidencias WHERE uuid = ?',
      [uuid]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Evidencia no encontrada' });
    }

    res.json({ message: 'Evidencia eliminada correctamente' });
  } catch (error) {
    console.error('Error en deleteEvidencia:', error);
    res.status(500).json({ message: 'Error al eliminar evidencia' });
  }
};

// =====================================================
// REORDENAR EVIDENCIAS
// =====================================================
export const reordenarEvidencias = async (req, res) => {
  try {
    const { reporte_uuid } = req.params;
    const { orden } = req.body; // Array de UUIDs en el nuevo orden

    if (!Array.isArray(orden) || orden.length === 0) {
      return res.status(400).json({ message: 'Debe proporcionar un array de UUIDs' });
    }

    // Obtener el ID del reporte
    const [reporte] = await pool.query(
      'SELECT id FROM reportes WHERE uuid = ?',
      [reporte_uuid]
    );

    if (reporte.length === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    // Actualizar orden de cada evidencia
    for (let i = 0; i < orden.length; i++) {
      await pool.query(
        'UPDATE reporte_evidencias SET orden = ? WHERE uuid = ? AND reporte_id = ?',
        [i + 1, orden[i], reporte[0].id]
      );
    }

    res.json({ message: 'Evidencias reordenadas correctamente' });
  } catch (error) {
    console.error('Error en reordenarEvidencias:', error);
    res.status(500).json({ message: 'Error al reordenar evidencias' });
  }
};