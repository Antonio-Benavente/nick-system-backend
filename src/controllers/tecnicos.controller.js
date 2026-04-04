import pool from "../config/db.js";
import { v4 as uuidv4 } from "uuid";
import { validateReporte, validateReporteUpdate, ValidationError } from "../validators/validators.js";

// =====================================================
// OBTENER MI PERFIL (TÉCNICO autenticado)
// =====================================================
export const getMiPerfil = async (req, res) => {
  try {
    const userId = req.user.id;

    const [rows] = await pool.query(
      `
      SELECT
        t.id,
        t.uuid,
        t.nombre,
        t.email,
        t.telefono,
        t.especialidad,
        t.estado,
        t.fecha_ingreso,
        u.id AS user_id,
        u.email AS user_email,
        u.role
      FROM tecnicos t
      INNER JOIN users u ON u.id = t.user_id
      WHERE t.user_id = ?
    `,
      [userId],
    );

    if (rows.length === 0) {
      return res
        .status(404)
        .json({ message: "Perfil de técnico no encontrado" });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error("Error en getMiPerfil:", error);
    res.status(500).json({ message: "Error al obtener perfil" });
  }
};

// =====================================================
// OBTENER MIS REPORTES (TÉCNICO autenticado)
// =====================================================
export const getMisReportes = async (req, res) => {
  try {
    const userId = req.user.id;
    const { incluir_eliminados } = req.query;

    // Primero obtener el ID del técnico
    const [tecnico] = await pool.query(
      "SELECT id FROM tecnicos WHERE user_id = ?",
      [userId],
    );

    if (tecnico.length === 0) {
      return res.status(404).json({ message: "Técnico no encontrado" });
    }

    const tecnicoId = tecnico[0].id;

    // Obtener reportes del técnico
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
        c.empresa AS cliente_empresa
      FROM reportes r
      INNER JOIN clientes c ON c.id = r.cliente_id
      WHERE r.tecnico_id = ?
    `;

    const params = [tecnicoId];

    if (incluir_eliminados !== "true") {
      query += ` AND r.estado = 'activo'`;
    }

    query += " ORDER BY r.fecha DESC, r.created_at DESC";

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
    console.error("Error en getMisReportes:", error);
    res.status(500).json({ message: "Error al obtener reportes" });
  }
};

// =====================================================
// OBTENER MIS ESTADÍSTICAS (TÉCNICO autenticado)
// =====================================================
export const getMisEstadisticas = async (req, res) => {
  try {
    const userId = req.user.id;

    // Obtener el ID del técnico
    const [tecnico] = await pool.query(
      "SELECT id FROM tecnicos WHERE user_id = ?",
      [userId],
    );

    if (tecnico.length === 0) {
      return res.status(404).json({ message: "Técnico no encontrado" });
    }

    const tecnicoId = tecnico[0].id;

    // Contar reportes (solo activos para estadísticas)
    const [stats] = await pool.query(
      `
      SELECT
        COUNT(*) AS total_reportes,
        SUM(CASE WHEN cliente_conforme = 'conforme' THEN 1 ELSE 0 END) AS reportes_conformes,
        SUM(CASE WHEN cliente_conforme = 'no_conforme' THEN 1 ELSE 0 END) AS reportes_no_conformes,
        SUM(CASE WHEN cliente_conforme = 'por_confirmar' THEN 1 ELSE 0 END) AS reportes_pendientes,
        SUM(CASE WHEN modalidad = 'presencial' THEN 1 ELSE 0 END) AS reportes_presenciales,
        SUM(CASE WHEN modalidad = 'remoto' THEN 1 ELSE 0 END) AS reportes_remotos
      FROM reportes
      WHERE tecnico_id = ? AND estado = 'activo'
    `,
      [tecnicoId],
    );

    // Reportes por mes (últimos 6 meses, solo activos)
    const [reportesPorMes] = await pool.query(
      `
      SELECT
        DATE_FORMAT(fecha, '%Y-%m') AS mes,
        COUNT(*) AS cantidad
      FROM reportes
      WHERE tecnico_id = ?
        AND estado = 'activo'
        AND fecha >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
      GROUP BY DATE_FORMAT(fecha, '%Y-%m')
      ORDER BY mes DESC
    `,
      [tecnicoId],
    );

    res.json({
      estadisticas: stats[0],
      reportes_por_mes: reportesPorMes,
    });
  } catch (error) {
    console.error("Error en getMisEstadisticas:", error);
    res.status(500).json({ message: "Error al obtener estadísticas" });
  }
};

// =====================================================
// CREAR REPORTE CON EVIDENCIAS (TÉCNICO autenticado)
// =====================================================
export const createReporte = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const userId = req.user.id;

    // Validar datos de entrada
    validateReporte(req.body);

    const {
      cliente_uuid,
      categoria,
      descripcion,
      fecha,
      modalidad,
      evidencias // NUEVO: Array de { url, tipo, descripcion }
    } = req.body;

    await connection.beginTransaction();

    // Obtener ID del técnico
    const [tecnico] = await connection.query(
      'SELECT id, uuid FROM tecnicos WHERE user_id = ?',
      [userId]
    );

    if (tecnico.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Técnico no encontrado' });
    }

    // Obtener ID del cliente
    const [cliente] = await connection.query(
      'SELECT id FROM clientes WHERE uuid = ?',
      [cliente_uuid]
    );

    if (cliente.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Cliente no encontrado' });
    }

    const reporteUUID = uuidv4();
    const clienteConforme = req.body.cliente_conforme || 'por_confirmar';

    // Insertar reporte (SIN foto_antes ni foto_despues)
    const [reporteResult] = await connection.query(
      `INSERT INTO reportes
       (uuid, cliente_id, tecnico_id, categoria, descripcion, fecha, modalidad, 
        cliente_conforme, aprobado_por, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')`,
      [
        reporteUUID,
        cliente[0].id,
        tecnico[0].id,
        categoria,
        descripcion,
        fecha,
        modalidad,
        clienteConforme,
        clienteConforme === 'conforme' || clienteConforme === 'no_conforme'
          ? req.body.aprobado_por
          : null
      ]
    );

    const reporteId = reporteResult.insertId;

    // NUEVO: Insertar evidencias si se proporcionaron
    if (evidencias && Array.isArray(evidencias) && evidencias.length > 0) {
      for (let i = 0; i < evidencias.length; i++) {
        const evidencia = evidencias[i];
        
        if (!evidencia.url) continue; // Saltar si no tiene URL

        const evidenciaUUID = uuidv4();

        await connection.query(
          `INSERT INTO reporte_evidencias
           (uuid, reporte_id, url, tipo, descripcion, orden)
           VALUES (?, ?, ?, ?, ?, ?)`,
          [
            evidenciaUUID,
            reporteId,
            evidencia.url,
            evidencia.tipo || 'imagen',
            evidencia.descripcion || null,
            i + 1
          ]
        );
      }
    }

    await connection.commit();

    res.status(201).json({
      message: 'Reporte creado correctamente',
      uuid: reporteUUID,
      evidencias_agregadas: evidencias?.length || 0
    });

  } catch (error) {
    await connection.rollback();
    
    if (error instanceof ValidationError) {
      return res.status(400).json({
        message: error.message,
        field: error.field,
      });
    }
    
    console.error('Error en createReporte:', error);
    res.status(500).json({ message: 'Error al crear reporte' });
  } finally {
    connection.release();
  }
};

// =====================================================
// EDITAR REPORTE CON EVIDENCIAS (TÉCNICO autenticado)
// =====================================================
export const updateReporte = async (req, res) => {
  const connection = await pool.getConnection();
  
  try {
    const userId = req.user.id;
    const { reporteUUID } = req.params;

    // Validar datos de entrada (solo campos presentes)
    const fieldsToValidate = { ...req.body };
    if (fieldsToValidate.evidencias) delete fieldsToValidate.evidencias;
    validateReporteUpdate(fieldsToValidate);

    const {
      categoria,
      descripcion,
      fecha,
      modalidad,
      cliente_conforme,
      aprobado_por,
      evidencias // NUEVO: Array de { url, tipo, descripcion }
    } = req.body;

    await connection.beginTransaction();

    // Obtener ID del técnico
    const [tecnico] = await connection.query(
      'SELECT id FROM tecnicos WHERE user_id = ?',
      [userId]
    );

    if (tecnico.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Técnico no encontrado' });
    }

    // Obtener reporte y verificar que pertenece al técnico
    const [reporte] = await connection.query(
      'SELECT id FROM reportes WHERE uuid = ? AND tecnico_id = ?',
      [reporteUUID, tecnico[0].id]
    );

    if (reporte.length === 0) {
      await connection.rollback();
      return res.status(403).json({ 
        message: 'No tiene permiso para editar este reporte o el reporte no existe' 
      });
    }

    const reporteId = reporte[0].id;

    // Actualizar reporte
    const updateFields = [];
    const updateValues = [];

    if (categoria !== undefined) {
      updateFields.push('categoria = ?');
      updateValues.push(categoria);
    }
    if (descripcion !== undefined) {
      updateFields.push('descripcion = ?');
      updateValues.push(descripcion);
    }
    if (fecha !== undefined) {
      updateFields.push('fecha = ?');
      updateValues.push(fecha);
    }
    if (modalidad !== undefined) {
      updateFields.push('modalidad = ?');
      updateValues.push(modalidad);
    }
    if (cliente_conforme !== undefined) {
      updateFields.push('cliente_conforme = ?');
      updateValues.push(cliente_conforme);
    }
    if (aprobado_por !== undefined) {
      updateFields.push('aprobado_por = ?');
      updateValues.push(aprobado_por);
    }

    if (updateFields.length > 0) {
      updateFields.push('updated_at = CURRENT_TIMESTAMP');
      updateValues.push(reporteId);

      await connection.query(
        `UPDATE reportes SET ${updateFields.join(', ')} WHERE id = ?`,
        updateValues
      );
    }

    // NUEVO: Actualizar evidencias si se proporcionaron
    let evidenciasAgregadas = 0;
    let evidenciasActualizadas = 0;

    if (evidencias && Array.isArray(evidencias) && evidencias.length > 0) {
      // Obtener evidencias existentes
      const [existentes] = await connection.query(
        'SELECT uuid FROM reporte_evidencias WHERE reporte_id = ?',
        [reporteId]
      );

      const existentesUUIDs = new Set(existentes.map(e => e.uuid));

      for (let i = 0; i < evidencias.length; i++) {
        const evidencia = evidencias[i];
        
        if (!evidencia.url) continue;

        if (evidencia.uuid && existentesUUIDs.has(evidencia.uuid)) {
          // Actualizar evidencia existente
          await connection.query(
            `UPDATE reporte_evidencias 
             SET url = ?, tipo = ?, descripcion = ?, orden = ?, updated_at = CURRENT_TIMESTAMP
             WHERE uuid = ? AND reporte_id = ?`,
            [
              evidencia.url,
              evidencia.tipo || 'imagen',
              evidencia.descripcion || null,
              i + 1,
              evidencia.uuid,
              reporteId
            ]
          );
          evidenciasActualizadas++;
          existentesUUIDs.delete(evidencia.uuid);
        } else {
          // Crear nueva evidencia
          const evidenciaUUID = uuidv4();
          await connection.query(
            `INSERT INTO reporte_evidencias
             (uuid, reporte_id, url, tipo, descripcion, orden)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              evidenciaUUID,
              reporteId,
              evidencia.url,
              evidencia.tipo || 'imagen',
              evidencia.descripcion || null,
              i + 1
            ]
          );
          evidenciasAgregadas++;
        }
      }

      // Eliminar evidencias que no se incluyen en la actualización
      if (existentesUUIDs.size > 0) {
        const uuidsAEliminar = Array.from(existentesUUIDs);
        for (const uuid of uuidsAEliminar) {
          await connection.query(
            'DELETE FROM reporte_evidencias WHERE uuid = ?',
            [uuid]
          );
        }
      }
    }

    await connection.commit();

    res.json({
      message: 'Reporte actualizado correctamente',
      uuid: reporteUUID,
      evidencias_agregadas: evidenciasAgregadas,
      evidencias_actualizadas: evidenciasActualizadas
    });

  } catch (error) {
    await connection.rollback();
    
    if (error instanceof ValidationError) {
      return res.status(400).json({
        message: error.message,
        field: error.field,
      });
    }
    
    console.error('Error en updateReporte:', error);
    res.status(500).json({ message: 'Error al actualizar reporte' });
  } finally {
    connection.release();
  }
};