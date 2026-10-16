import { randomUUID } from 'node:crypto';
import pool from '../config/db.js';
import bcrypt from 'bcryptjs';
import {
  validateCliente,
  validateClienteUpdate
} from '../validators/validators.js';
import { abortar } from '../middlewares/error.middleware.js';
import { conTransaccion } from '../services/transaccion.service.js';
import { leerPaginacion, cabeceraPaginacion, contar } from '../services/paginacion.service.js';

const CAMPOS_CLIENTE = ['nombre', 'empresa', 'email', 'telefono', 'direccion'];

const soloDefinidos = (body, campos) =>
  campos.reduce((acc, campo) => {
    if (body[campo] !== undefined) acc[campo] = body[campo];
    return acc;
  }, {});

export const getClientes = async (req, res) => {
  const { incluir_inactivos } = req.query;
  const paginacion = leerPaginacion(req.query);

  const condiciones = [];
  const params = [];

  if (incluir_inactivos !== 'true') {
    condiciones.push('c.estado = ?');
    params.push('activo');
  }

  if (req.query.buscar) {
    condiciones.push('(c.nombre LIKE ? OR c.empresa LIKE ? OR c.email LIKE ?)');
    const patron = `%${String(req.query.buscar).trim().slice(0, 100)}%`;
    params.push(patron, patron, patron);
  }

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  if (paginacion.activa) {
    const total = await contar(
      pool,
      `SELECT COUNT(*) AS total FROM clientes c ${donde}`,
      params
    );
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  const [rows] = await pool.query(
    `SELECT
      c.id,
      c.uuid,
      c.nombre,
      c.empresa,
      c.email,
      c.telefono,
      c.direccion,
      c.estado,
      c.fecha_registro,
      u.id AS user_id,
      u.email AS user_email
    FROM clientes c
    LEFT JOIN users u ON u.id = c.user_id
    ${donde}
    ORDER BY c.fecha_registro DESC
    LIMIT ? OFFSET ?`,
    [...params, paginacion.limite, paginacion.offset]
  );

  res.json(rows);
};

export const getClienteByUuid = async (req, res) => {
  const [rows] = await pool.query(`
    SELECT
      c.id,
      c.uuid,
      c.nombre,
      c.empresa,
      c.email,
      c.telefono,
      c.direccion,
      c.estado,
      c.fecha_registro,
      u.id AS user_id,
      u.email AS user_email,
      u.role
    FROM clientes c
    LEFT JOIN users u ON u.id = c.user_id
    WHERE c.uuid = ?
  `, [req.params.uuid]);

  if (rows.length === 0) {
    throw abortar(404, 'Cliente no encontrado');
  }

  res.json(rows[0]);
};

export const createCliente = async (req, res) => {
  validateCliente(req.body);

  const {
    nombre,
    empresa,
    email,
    password,
    telefono,
    direccion
  } = req.body;

  const resultado = await conTransaccion(async (connection) => {
    let userId = null;
    let userUUID = null;

    if (password) {
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE email = ?',
        [email.trim()]
      );

      if (existing.length > 0) {
        throw abortar(409, 'Email ya registrado');
      }

      const hashedPassword = await bcrypt.hash(password, 10);
      userUUID = randomUUID();

      const [userResult] = await connection.query(
        `INSERT INTO users (uuid, name, email, password, role, empresa)
         VALUES (?, ?, ?, ?, 'cliente', ?)`,
        [userUUID, nombre, email.trim(), hashedPassword, empresa]
      );

      userId = userResult.insertId;
    }

    const clienteUUID = randomUUID();

    await connection.query(
      `INSERT INTO clientes
       (uuid, user_id, nombre, empresa, email, telefono, direccion, estado, fecha_registro)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'activo', CURDATE())`,
      [clienteUUID, userId, nombre, empresa, email, telefono || null, direccion || null]
    );

    return { uuid: clienteUUID, user_uuid: userUUID };
  });

  res.status(201).json({
    message: 'Cliente creado correctamente',
    ...resultado
  });
};

export const updateCliente = async (req, res) => {
  const { uuid } = req.params;
  const body = soloDefinidos(req.body, [...CAMPOS_CLIENTE, 'password']);

  validateClienteUpdate(body);

  await conTransaccion(async (connection) => {
    const [cliente] = await connection.query(
      'SELECT id, user_id FROM clientes WHERE uuid = ?',
      [uuid]
    );

    if (cliente.length === 0) {
      throw abortar(404, 'Cliente no encontrado');
    }

    const { id: clienteId, user_id: userId } = cliente[0];

    if (body.email !== undefined) {
      const email = body.email.trim();
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId || 0]
      );

      if (existing.length > 0) {
        throw abortar(409, 'Email ya está en uso');
      }
    }

    const datos = soloDefinidos(body, CAMPOS_CLIENTE);

    if (Object.keys(datos).length > 0) {
      const campos = Object.entries(datos).map(([campo]) => `${campo} = ?`);

      await connection.query(
        `UPDATE clientes SET ${campos.join(', ')} WHERE id = ?`,
        [...Object.values(datos), clienteId]
      );
    }

    if (!userId) return;

    const usuario = {};

    if (body.email !== undefined) usuario.email = body.email.trim();
    if (body.nombre !== undefined) usuario.name = body.nombre;
    if (body.empresa !== undefined) usuario.empresa = body.empresa;

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

  res.json({ message: 'Cliente actualizado correctamente' });
};

export const deleteCliente = async (req, res) => {
  const { uuid } = req.params;

  await conTransaccion(async (connection) => {
    const [cliente] = await connection.query(
      'SELECT id, user_id FROM clientes WHERE uuid = ?',
      [uuid]
    );

    if (cliente.length === 0) {
      throw abortar(404, 'Cliente no encontrado');
    }

    await connection.query(
      `UPDATE clientes SET estado = 'inactivo' WHERE id = ?`,
      [cliente[0].id]
    );

    if (cliente[0].user_id) {
      await connection.query(
        'UPDATE users SET sesion_version = sesion_version + 1 WHERE id = ?',
        [cliente[0].user_id]
      );
    }
  });

  res.json({ message: 'Cliente inactivado correctamente' });
};

export const restaurarCliente = async (req, res) => {
  const [result] = await pool.query(
    `UPDATE clientes SET estado = 'activo' WHERE uuid = ? AND estado = 'inactivo'`,
    [req.params.uuid]
  );

  if (result.affectedRows === 0) {
    throw abortar(404, 'Cliente no encontrado o ya está activo');
  }

  res.json({ message: 'Cliente restaurado correctamente' });
};
