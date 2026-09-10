import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import AdminService from '../services/admin.service.js';
import { validateTecnico, ValidationError, validateReporteUpdate, validateClave, validatePassword, CLAVE_TIPO_LABELS } from '../validators/validators.js';
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

export const getClaves = async (req, res) => {
  try {
    const { incluir_inactivos } = req.query;

    let query = `
      SELECT
        id,
        empresa,
        tipo,
        usuario,
        password,
        estado
      FROM claves
    `;

    if (incluir_inactivos !== 'true') {
      query += ` WHERE estado = 'activo'`;
    }

    query += ` ORDER BY empresa`;

    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error en getClaves:', error);
    res.status(500).json({ message: 'Error al obtener la tabla claves' });
  }
};

export const createClave = async (req, res) => {
  const { empresa, tipo, usuario, password } = req.body;

  try {
    validateClave({ empresa, tipo, usuario, password });

    const [dup] = await pool.query(
      'SELECT id FROM claves WHERE empresa = ? AND tipo = ? AND usuario = ?',
      [empresa.trim(), tipo, usuario.trim()]
    );
    if (dup.length > 0) {
      return res.status(409).json({ message: `Ya existe un ${CLAVE_TIPO_LABELS[tipo]} con ese valor en esa empresa` });
    }

    const [result] = await pool.query(
      'INSERT INTO claves (empresa, tipo, usuario, password, estado) VALUES (?, ?, ?, ?, ?)',
      [empresa.trim(), tipo, usuario.trim(), password, 'activo']
    );

    res.status(201).json({ message: 'Clave creada correctamente', id: result.insertId });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message, field: error.field });
    }
    console.error('Error en createClave:', error);
    res.status(500).json({ message: 'Error al crear la clave' });
  }
};

export const updateClave = async (req, res) => {
  const { id } = req.params;
  const { empresa, tipo, usuario, password } = req.body;

  try {
    if (empresa === undefined && tipo === undefined && usuario === undefined && password === undefined) {
      return res.status(400).json({ message: 'No se proporcionaron campos para actualizar' });
    }

    const [rows] = await pool.query('SELECT * FROM claves WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Clave no encontrada' });
    }

    const newEmpresa = empresa !== undefined ? empresa.trim() : rows[0].empresa;
    const newTipo = tipo !== undefined ? tipo : rows[0].tipo;
    const newUsuario = usuario !== undefined ? usuario.trim() : rows[0].usuario;
    const newPassword = password !== undefined ? password : rows[0].password;

    validateClave({ empresa: newEmpresa, tipo: newTipo, usuario: newUsuario, password: newPassword });

    const [dup] = await pool.query(
      'SELECT id FROM claves WHERE empresa = ? AND tipo = ? AND usuario = ? AND id != ?',
      [newEmpresa, newTipo, newUsuario, id]
    );
    if (dup.length > 0) {
      return res.status(409).json({ message: `Ya existe un ${CLAVE_TIPO_LABELS[newTipo]} con ese valor en esa empresa` });
    }

    await pool.query(
      'UPDATE claves SET empresa = ?, tipo = ?, usuario = ?, password = ? WHERE id = ?',
      [newEmpresa, newTipo, newUsuario, newPassword, id]
    );

    res.json({ message: 'Clave actualizada correctamente' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message, field: error.field });
    }
    console.error('Error en updateClave:', error);
    res.status(500).json({ message: 'Error al actualizar la clave' });
  }
};

export const deleteClave = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE claves SET estado = 'inactivo' WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Clave no encontrada' });
    }

    res.json({ message: 'Clave inactivada correctamente' });
  } catch (error) {
    console.error('Error en deleteClave:', error);
    res.status(500).json({ message: 'Error al inactivar la clave' });
  }
};

export const restaurarClave = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE claves SET estado = 'activo' WHERE id = ? AND estado = 'inactivo'`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Clave no encontrada o ya está activa' });
    }

    res.json({ message: 'Clave restaurada correctamente' });
  } catch (error) {
    console.error('Error en restaurarClave:', error);
    res.status(500).json({ message: 'Error al restaurar la clave' });
  }
};

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
    res.status(500).json({ message: 'Error al obtener técnicos' });
  }
};

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

export const createTecnico = async (req, res) => {
  const connection = await pool.getConnection();

  try {
    validateTecnico(req.body);

    const {
      nombre,
      email,
      password,
      telefono,
      especialidad
    } = req.body;

    await connection.beginTransaction();

    const [existing] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      await connection.rollback();
      return res.status(409).json({ message: 'Email ya registrado' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userUUID = uuidv4();

    const [userResult] = await connection.query(
      `INSERT INTO users (uuid, name, email, password, role)
       VALUES (?, ?, ?, ?, 'tecnico')`,
      [userUUID, nombre, email, hashedPassword]
    );

    const userId = userResult.insertId;

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

export const updateTecnico = async (req, res) => {
  const { uuid } = req.params;
  const { nombre, email, telefono, especialidad, password } = req.body;

  const connection = await pool.getConnection();

  try {
    if (password) {
      validatePassword(password);
    }

    await connection.beginTransaction();

    const [tecnico] = await connection.query(
      'SELECT user_id FROM tecnicos WHERE uuid = ?',
      [uuid]
    );

    if (tecnico.length === 0) {
      await connection.rollback();
      return res.status(404).json({ message: 'Técnico no encontrado' });
    }

    const userId = tecnico[0].user_id;

    if (email) {
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId]
      );

      if (existing.length > 0) {
        await connection.rollback();
        return res.status(409).json({ message: 'Email ya está en uso' });
      }

      await connection.query(
        'UPDATE users SET email = ?, name = ? WHERE id = ?',
        [email, nombre, userId]
      );
    }

    if (password) {
      const hashedPassword = await bcrypt.hash(password, 10);
      await connection.query(
        'UPDATE users SET password = ? WHERE id = ?',
        [hashedPassword, userId]
      );
    }

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