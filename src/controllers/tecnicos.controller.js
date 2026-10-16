import { randomUUID } from 'node:crypto';
import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import {
  validateTecnico,
  validateTecnicoUpdate
} from '../validators/validators.js';
import { abortar } from '../middlewares/error.middleware.js';
import { conTransaccion } from '../services/transaccion.service.js';
import { leerPaginacion, cabeceraPaginacion, contar } from '../services/paginacion.service.js';

const CAMPOS_TECNICO = ['nombre', 'email', 'telefono', 'especialidad'];

const soloDefinidos = (body, campos) =>
  campos.reduce((acc, campo) => {
    if (body[campo] !== undefined) acc[campo] = body[campo];
    return acc;
  }, {});

export const getTecnicos = async (req, res) => {
  const { incluir_inactivos } = req.query;
  const paginacion = leerPaginacion(req.query);

  const condiciones = [];
  const params = [];

  if (incluir_inactivos !== 'true') {
    condiciones.push('t.estado = ?');
    params.push('activo');
  }

  if (req.query.buscar) {
    condiciones.push('(t.nombre LIKE ? OR t.email LIKE ? OR t.especialidad LIKE ?)');
    const patron = `%${String(req.query.buscar).trim().slice(0, 100)}%`;
    params.push(patron, patron, patron);
  }

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  if (paginacion.activa) {
    const total = await contar(
      pool,
      `SELECT COUNT(*) AS total FROM tecnicos t ${donde}`,
      params
    );
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  const [rows] = await pool.query(
    `SELECT
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
    ${donde}
    ORDER BY t.fecha_ingreso DESC
    LIMIT ? OFFSET ?`,
    [...params, paginacion.limite, paginacion.offset]
  );

  res.json(rows);
};

export const getTecnicoByUuid = async (req, res) => {
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
  `, [req.params.uuid]);

  if (rows.length === 0) {
    throw abortar(404, 'Técnico no encontrado');
  }

  res.json(rows[0]);
};

export const createTecnico = async (req, res) => {
  validateTecnico(req.body);

  if (!req.body.password) {
    throw abortar(
      400,
      'La contraseña es requerida para crear al técnico',
      { message: 'La contraseña es requerida para crear al técnico', field: 'password' }
    );
  }

  const {
    nombre,
    email,
    password,
    telefono,
    especialidad
  } = req.body;

  const resultado = await conTransaccion(async (connection) => {
    const [existing] = await connection.query(
      'SELECT id FROM users WHERE email = ?',
      [email]
    );

    if (existing.length > 0) {
      throw abortar(409, 'Email ya registrado');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const userUUID = randomUUID();

    const [userResult] = await connection.query(
      `INSERT INTO users (uuid, name, email, password, role)
       VALUES (?, ?, ?, ?, 'tecnico')`,
      [userUUID, nombre, email, hashedPassword]
    );

    const userId = userResult.insertId;
    const tecnicoUUID = randomUUID();

    await connection.query(
      `INSERT INTO tecnicos
       (uuid, user_id, nombre, email, telefono, especialidad, estado, fecha_ingreso)
       VALUES (?, ?, ?, ?, ?, ?, 'activo', CURDATE())`,
      [tecnicoUUID, userId, nombre, email, telefono || null, especialidad || null]
    );

    return { uuid: tecnicoUUID, user_uuid: userUUID };
  });

  res.status(201).json({
    message: 'Técnico creado correctamente',
    ...resultado
  });
};

export const updateTecnico = async (req, res) => {
  const { uuid } = req.params;
  const body = soloDefinidos(req.body, [...CAMPOS_TECNICO, 'password']);

  validateTecnicoUpdate(body);

  await conTransaccion(async (connection) => {
    const [tecnico] = await connection.query(
      'SELECT id, user_id FROM tecnicos WHERE uuid = ?',
      [uuid]
    );

    if (tecnico.length === 0) {
      throw abortar(404, 'Técnico no encontrado');
    }

    const { id: tecnicoId, user_id: userId } = tecnico[0];

    if (userId && body.email) {
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [body.email, userId]
      );

      if (existing.length > 0) {
        throw abortar(409, 'Email ya está en uso');
      }
    }

    const datos = soloDefinidos(body, CAMPOS_TECNICO);

    if (Object.keys(datos).length > 0) {
      const campos = Object.entries(datos).map(([campo]) => `${campo} = ?`);

      await connection.query(
        `UPDATE tecnicos SET ${campos.join(', ')} WHERE id = ?`,
        [...Object.values(datos), tecnicoId]
      );
    }

    if (!userId) return;

    const usuario = {};

    if (body.email !== undefined) usuario.email = body.email;
    if (body.nombre !== undefined) usuario.name = body.nombre;

    if (Object.keys(usuario).length > 0) {
      const campos = Object.entries(usuario).map(([campo]) => `${campo} = ?`);

      await connection.query(
        `UPDATE users SET ${campos.join(', ')} WHERE id = ?`,
        [...Object.values(usuario), userId]
      );
    }

    if (body.password !== undefined) {
      const hashedPassword = await bcrypt.hash(body.password, 10);
      await connection.query(
        'UPDATE users SET password = ?, sesion_version = sesion_version + 1 WHERE id = ?',
        [hashedPassword, userId]
      );
    }
  });

  res.json({ message: 'Técnico actualizado correctamente' });
};

export const deleteTecnico = async (req, res) => {
  const { uuid } = req.params;

  await conTransaccion(async (connection) => {
    const [tecnico] = await connection.query(
      'SELECT id, user_id FROM tecnicos WHERE uuid = ?',
      [uuid]
    );

    if (tecnico.length === 0) {
      throw abortar(404, 'Técnico no encontrado');
    }

    await connection.query(
      `UPDATE tecnicos SET estado = 'inactivo' WHERE id = ?`,
      [tecnico[0].id]
    );

    if (tecnico[0].user_id) {
      await connection.query(
        'UPDATE users SET sesion_version = sesion_version + 1 WHERE id = ?',
        [tecnico[0].user_id]
      );
    }
  });

  res.json({ message: 'Técnico inactivado correctamente' });
};

export const restaurarTecnico = async (req, res) => {
  const [result] = await pool.query(
    `UPDATE tecnicos SET estado = 'activo' WHERE uuid = ? AND estado = 'inactivo'`,
    [req.params.uuid]
  );

  if (result.affectedRows === 0) {
    throw abortar(404, 'Técnico no encontrado o ya está activo');
  }

  res.json({ message: 'Técnico restaurado correctamente' });
};
