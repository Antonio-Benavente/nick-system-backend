import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import { v4 as uuidv4 } from 'uuid';
import { validateTecnico, ValidationError, validatePassword } from '../validators/validators.js';

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