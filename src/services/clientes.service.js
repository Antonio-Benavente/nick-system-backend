import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { abortar } from '../middlewares/error.middleware.js';
import { conTransaccion } from './transaccion.service.js';
import { revocarDispositivos } from './dispositivos.service.js';
import { contar } from './paginacion.service.js';
import { soloDefinidos } from '../utils/objetos.js';

export const CAMPOS_CLIENTE = ['nombre', 'empresa', 'email', 'telefono', 'direccion'];

const CAMPOS_ACTUALIZABLES = [...CAMPOS_CLIENTE, 'password'];

const SELECT_CLIENTE = `
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
    u.email AS user_email
  FROM clientes c
  LEFT JOIN users u ON u.id = c.user_id
`;

const SELECT_CLIENTE_DETALLE = `
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
`;

export const listarClientes = async ({
  incluirInactivos = false,
  buscar = null,
  paginacion
} = {}) => {
  const condiciones = [];
  const params = [];

  if (!incluirInactivos) {
    condiciones.push('c.estado = ?');
    params.push('activo');
  }

  if (buscar) {
    condiciones.push('(c.nombre LIKE ? OR c.empresa LIKE ? OR c.email LIKE ?)');
    const patron = `%${String(buscar).trim().slice(0, 100)}%`;
    params.push(patron, patron, patron);
  }

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const total = paginacion.activa
    ? await contar(pool, `SELECT COUNT(*) AS total FROM clientes c ${donde}`, params)
    : null;

  const [filas] = await pool.query(
    `${SELECT_CLIENTE}
     ${donde}
     ORDER BY c.fecha_registro DESC
     LIMIT ? OFFSET ?`,
    [...params, paginacion.limite, paginacion.offset]
  );

  return { filas, total };
};

export const obtenerClientePorUuid = async (uuid) => {
  const [filas] = await pool.query(
    `${SELECT_CLIENTE_DETALLE}
     WHERE c.uuid = ?`,
    [uuid]
  );

  return filas[0] || null;
};

export const crearCliente = async ({
  nombre,
  empresa,
  email,
  password,
  telefono,
  direccion
}) =>
  conTransaccion(async (connection) => {
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

export const actualizarCliente = async (uuid, body) => {
  const datosRecibidos = soloDefinidos(body, CAMPOS_ACTUALIZABLES);

  await conTransaccion(async (connection) => {
    const [cliente] = await connection.query(
      'SELECT id, user_id FROM clientes WHERE uuid = ?',
      [uuid]
    );

    if (cliente.length === 0) {
      throw abortar(404, 'Cliente no encontrado');
    }

    const { id: clienteId, user_id: userId } = cliente[0];

    if (datosRecibidos.email !== undefined) {
      const email = datosRecibidos.email.trim();
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [email, userId || 0]
      );

      if (existing.length > 0) {
        throw abortar(409, 'Email ya está en uso');
      }
    }

    const datos = soloDefinidos(datosRecibidos, CAMPOS_CLIENTE);

    if (Object.keys(datos).length > 0) {
      const campos = Object.entries(datos).map(([campo]) => `${campo} = ?`);

      await connection.query(
        `UPDATE clientes SET ${campos.join(', ')} WHERE id = ?`,
        [...Object.values(datos), clienteId]
      );
    }

    if (!userId) return;

    const usuario = {};

    if (datosRecibidos.email !== undefined) usuario.email = datosRecibidos.email.trim();
    if (datosRecibidos.nombre !== undefined) usuario.name = datosRecibidos.nombre;
    if (datosRecibidos.empresa !== undefined) usuario.empresa = datosRecibidos.empresa;

    if (Object.keys(usuario).length > 0) {
      const campos = Object.entries(usuario).map(([campo]) => `${campo} = ?`);

      await connection.query(
        `UPDATE users SET ${campos.join(', ')} WHERE id = ?`,
        [...Object.values(usuario), userId]
      );
    }

    if (datosRecibidos.password !== undefined) {
      const hashedPassword = await bcrypt.hash(datosRecibidos.password, 10);
      await connection.query(
        'UPDATE users SET password = ?, sesion_version = sesion_version + 1 WHERE id = ?',
        [hashedPassword, userId]
      );

      await revocarDispositivos(userId, {
        motivo: 'admin_password',
        conexion: connection
      });
    }
  });
};

export const inactivarCliente = async (uuid) => {
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
      await revocarDispositivos(cliente[0].user_id, {
        motivo: 'inactivacion',
        conexion: connection
      });

      await connection.query(
        'UPDATE users SET sesion_version = sesion_version + 1 WHERE id = ?',
        [cliente[0].user_id]
      );
    }
  });
};

export const restaurarCliente = async (uuid) => {
  const [cliente] = await pool.query(
    'SELECT user_id, estado FROM clientes WHERE uuid = ?',
    [uuid]
  );

  if (!cliente.length || cliente[0].estado === 'activo') {
    throw abortar(404, 'Cliente no encontrado o ya está activo');
  }

  if (cliente[0].user_id) {
    await revocarDispositivos(cliente[0].user_id, { motivo: 'restauracion' });
  }

  await pool.query(
    `UPDATE clientes SET estado = 'activo' WHERE uuid = ? AND estado = 'inactivo'`,
    [uuid]
  );
};

export default {
  listarClientes,
  obtenerClientePorUuid,
  crearCliente,
  actualizarCliente,
  inactivarCliente,
  restaurarCliente
};
