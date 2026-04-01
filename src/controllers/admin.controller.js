import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import AdminService from '../services/admin.service.js';
import { validateTecnico, ValidationError, validateReporte } from '../validators/validators.js';

// =====================================================
// DASHBOARD - ESTADÍSTICAS GENERALES
// =====================================================
export const getDashboardStats = async (req, res) => {
  try {
    const stats = await AdminService.getDashboardStats();
    res.json(stats);
  } catch (error) {
    console.error('Error en getDashboardStats:', error);
    res.status(500).json({ message: 'Error al obtener estadísticas generales' });
  }
};

// =====================================================
// REPORTES DEL MES ACTUAL
// =====================================================
export const getReportesMesActual = async (req, res) => {
  try {
    const reportes = await AdminService.getReportesMesActual();
    
    // Agregar estadísticas del mes
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

// =====================================================
// REPORTES POR CATEGORÍA
// =====================================================
export const getReportesPorCategoria = async (req, res) => {
  try {
    const categorias = await AdminService.getReportesPorCategoria();
    res.json(categorias);
  } catch (error) {
    console.error('Error en getReportesPorCategoria:', error);
    res.status(500).json({ message: 'Error al obtener reportes por categorÃƒÂ­a' });
  }
};

// =====================================================
// LISTAR REPORTES CON FILTROS MEJORADOS
// =====================================================
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

// =====================================================
// OBTENER REPORTE POR UUID CON EVIDENCIAS
// =====================================================
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

    // Ã¢Å“â€¦ NUEVO: Obtener evidencias del reporte
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
    console.error('Error en getReporteByUuid:', error);
    res.status(500).json({ message: 'Error al obtener reporte' });
  }
};

// =====================================================
// ACTUALIZAR REPORTE
// =====================================================
export const updateReporte = async (req, res) => {
  const { uuid } = req.params;
  const { categoria, descripcion, fecha, modalidad, estado } = req.body;

  try {
    // Validar datos básicos
    const dataToValidate = {};
    if (categoria !== undefined) dataToValidate.categoria = categoria;
    if (fecha !== undefined) dataToValidate.fecha = fecha;
    if (modalidad !== undefined) dataToValidate.modalidad = modalidad;

    if (Object.keys(dataToValidate).length > 0) {
      // Agregar cliente_uuid dummy para validación (no se edita)
      dataToValidate.cliente_uuid = 'dummy';
      validateReporte(dataToValidate);
    }

    // Verificar que existe el reporte
    const [reporte] = await pool.query(
      'SELECT id FROM reportes WHERE uuid = ?',
      [uuid]
    );

    if (reporte.length === 0) {
      return res.status(404).json({ message: 'Reporte no encontrado' });
    }

    // Verificar que la categoría existe si se proporciona
    if (categoria) {
      const [cat] = await pool.query(
        'SELECT id FROM categorias WHERE nombre = ? AND estado = "activo"',
        [categoria]
      );
      if (cat.length === 0) {
        return res.status(400).json({ message: 'Categoría no válida o inactiva' });
      }
    }

    // Construir query de actualización dinámica
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

    // Ejecutar actualización
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

// =====================================================
// LISTAR TÉCNICOS
// =====================================================
export const getTecnicos = async (req, res) => {
  try {
    const { incluir_inactivos } = req.query;
    
    let query = `
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
        u.email AS user_email
      FROM tecnicos t
      INNER JOIN users u ON u.id = t.user_id
    `;
    
    if (incluir_inactivos !== 'true') {
      query += ` WHERE t.estado = 'activo'`;
    }
    
    query += ` ORDER BY t.fecha_ingreso DESC`;

    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error en getTecnicos:', error);
    res.status(500).json({ message: 'Error al obtener tÃƒÂ©cnicos' });
  }
};

// =====================================================
// OBTENER TÉCNICO POR UUID
// =====================================================
export const getTecnicoByUuid = async (req, res) => {
  try {
    const { uuid } = req.params;
    
    const [rows] = await pool.query(`
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
      WHERE t.uuid = ?
    `, [uuid]);

    if (rows.length === 0) {
      return res.status(404).json({ message: 'Técnico no encontrado' });
    }

    res.json(rows[0]);
  } catch (error) {
    console.error('Error en getTecnicoByUuid:', error);
    res.status(500).json({ message: 'Error al obtener técnico' });
  }
};

// =====================================================
// CREAR TÉCNICO (CON USUARIO)
// =====================================================
export const createTecnico = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    // Validar datos de entrada
    validateTecnico(req.body);

    const {
      nombre,
      email,
      password,
      telefono,
      especialidad
    } = req.body;

    await connection.beginTransaction();

    // Verificar email duplicado
    const [existing] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ message: 'Email ya registrado' });
    }

    // Crear usuario
    const hashedPassword = await bcrypt.hash(password, 10);
    const userUUID = uuidv4();

    const [userResult] = await connection.query(
      `INSERT INTO users (uuid, name, email, password, role)
       VALUES (?, ?, ?, ?, 'tecnico')`,
      [userUUID, nombre, email, hashedPassword]
    );

    const userId = userResult.insertId;

    // Crear técnico
    const tecnicoUUID = uuidv4();

    await connection.query(
      `INSERT INTO tecnicos
       (uuid, user_id, nombre, email, telefono, especialidad, estado, fecha_ingreso)
       VALUES (?, ?, ?, ?, ?, ?, 'activo', CURDATE())`,
      [tecnicoUUID, userId, nombre, email, telefono || null, especialidad || null]
    );

    await connection.commit();

    res.status(201).json({
      message: 'Técnico creado correctamente',
      uuid: tecnicoUUID,
      user_uuid: userUUID
    });

  } catch (error) {
    await connection.rollback();
    
    if (error instanceof ValidationError) {
      return res.status(400).json({ 
        message: error.message,
        field: error.field 
      });
    }

    console.error('Error en createTecnico:', error);
    res.status(500).json({ message: 'Error al crear técnico' });
  } finally {
    connection.release();
  }
};

// =====================================================
// ACTUALIZAR TÉCNICO
// =====================================================
export const updateTecnico = async (req, res) => {
  const { uuid } = req.params;
  const { nombre, email, telefono, especialidad, password } = req.body;

  const connection = await pool.getConnection();

  try {
    // Validar contraseña si se proporciona
    if (password) {
      const { validatePassword } = await import('../validators/validators.js');
      validatePassword(password);
    }

    await connection.beginTransaction();

    // Verificar que existe el técnico
    const [tecnico] = await connection.query(
      'SELECT user_id FROM tecnicos WHERE uuid = ?',
      [uuid]
    );

    if (tecnico.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Técnico no encontrado' });
    }

    const userId = tecnico[0].user_id;

    // Si cambió el email, verificar que no esté en uso
    if (email) {
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
      );

      if (existing.length > 0) {
        await connection.rollback();
        return res.status(409).json({ message: 'Email ya está en uso' });
      }

      // Actualizar email en users
      await connection.query(
        'UPDATE users SET email = ?, name = ? WHERE id = ?',
        [email, nombre, userId]
      );
    }

    // Si se proporciona nueva contraseña, hashearla y actualizar
    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await connection.query(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashedPassword, userId]
      );
    }

    // Actualizar técnico
    await connection.query(
      `UPDATE tecnicos 
       SET nombre = ?, email = ?, telefono = ?, especialidad = ?
       WHERE uuid = ?`,
      [nombre, email, telefono, especialidad, uuid]
    );

    await connection.commit();

    res.json({ message: 'Técnico actualizado correctamente' });

  } catch (error) {
    await connection.rollback();
    
    if (error instanceof ValidationError) {
      return res.status(400).json({ 
        message: error.message,
        field: error.field 
      });
    }

    console.error('Error en updateTecnico:', error);
    res.status(500).json({ message: 'Error al actualizar técnico' });
  } finally {
    connection.release();
  }
};

// =====================================================
// ELIMINAR TÉCNICO (SOFT DELETE)
// =====================================================
export const deleteTecnico = async (req, res) => {
  const { uuid } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE tecnicos SET estado = 'inactivo' WHERE uuid = ?`,
      [uuid]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Técnico no encontrado' });
    }

    res.json({ message: 'Técnico inactivado correctamente' });
  } catch (error) {
    console.error('Error en deleteTecnico:', error);
    res.status(500).json({ message: 'Error al inactivar técnico' });
  }
};

// =====================================================
// RESTAURAR TÉCNICO
// =====================================================
export const restaurarTecnico = async (req, res) => {
  const { uuid } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE tecnicos SET estado = 'activo' WHERE uuid = ? AND estado = 'inactivo'`,
      [uuid]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Técnico no encontrado o ya está activo' });
    }

    res.json({ message: 'Técnico restaurado correctamente' });
  } catch (error) {
    console.error('Error en restaurarTecnico:', error);
    res.status(500).json({ message: 'Error al restaurar técnico' });
  }
};