import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { abortar } from '../middlewares/error.middleware.js';
import { conTransaccion } from './transaccion.service.js';
import { revocarDispositivos } from './dispositivos.service.js';
import { contar } from './paginacion.service.js';
import { soloDefinidos } from '../utils/objetos.js';

export const CAMPOS_TECNICO = ['nombre', 'email', 'telefono', 'especialidad'];

const CAMPOS_ACTUALIZABLES = [...CAMPOS_TECNICO, 'password'];

const SELECT_TECNICO = `
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

const SELECT_TECNICO_DETALLE = `
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
`;

export const listarTecnicos = async ({
  incluirInactivos = false,
  buscar = null,
  paginacion
} = {}) => {
  const condiciones = [];
  const params = [];

  if (!incluirInactivos) {
    condiciones.push('t.estado = ?');
    params.push('activo');
  }

  if (buscar) {
    condiciones.push('(t.nombre LIKE ? OR t.email LIKE ? OR t.especialidad LIKE ?)');
    const patron = `%${String(buscar).trim().slice(0, 100)}%`;
    params.push(patron, patron, patron);
  }

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const total = paginacion.activa
    ? await contar(pool, `SELECT COUNT(*) AS total FROM tecnicos t ${donde}`, params)
    : null;

  const [filas] = await pool.query(
    `${SELECT_TECNICO}
     ${donde}
     ORDER BY t.fecha_ingreso DESC
     LIMIT ? OFFSET ?`,
    [...params, paginacion.limite, paginacion.offset]
  );

  return { filas, total };
};

export const obtenerTecnicoPorUuid = async (uuid) => {
  const [filas] = await pool.query(
    `${SELECT_TECNICO_DETALLE}
     WHERE t.uuid = ?`,
    [uuid]
  );

  return filas[0] || null;
};

export const crearTecnico = async ({
  nombre,
  email,
  password,
  telefono,
  especialidad
}) =>
  conTransaccion(async (connection) => {
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

export const actualizarTecnico = async (uuid, body) => {
  const datosRecibidos = soloDefinidos(body, CAMPOS_ACTUALIZABLES);

  await conTransaccion(async (connection) => {
    const [tecnico] = await connection.query(
      'SELECT id, user_id FROM tecnicos WHERE uuid = ?',
      [uuid]
    );

    if (tecnico.length === 0) {
      throw abortar(404, 'Técnico no encontrado');
    }

    const { id: tecnicoId, user_id: userId } = tecnico[0];

    if (userId && datosRecibidos.email) {
      const [existing] = await connection.query(
        'SELECT id FROM users WHERE email = ? AND id != ?',
        [datosRecibidos.email, userId]
      );

      if (existing.length > 0) {
        throw abortar(409, 'Email ya está en uso');
      }
    }

    const datos = soloDefinidos(datosRecibidos, CAMPOS_TECNICO);

    if (Object.keys(datos).length > 0) {
      const campos = Object.entries(datos).map(([campo]) => `${campo} = ?`);

      await connection.query(
        `UPDATE tecnicos SET ${campos.join(', ')} WHERE id = ?`,
        [...Object.values(datos), tecnicoId]
      );
    }

    if (!userId) return;

    const usuario = {};

    if (datosRecibidos.email !== undefined) usuario.email = datosRecibidos.email;
    if (datosRecibidos.nombre !== undefined) usuario.name = datosRecibidos.nombre;

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

export const inactivarTecnico = async (uuid) => {
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
      await revocarDispositivos(tecnico[0].user_id, {
        motivo: 'inactivacion',
        conexion: connection
      });

      await connection.query(
        'UPDATE users SET sesion_version = sesion_version + 1 WHERE id = ?',
        [tecnico[0].user_id]
      );
    }
  });
};

export const restaurarTecnico = async (uuid) => {
  const [tecnico] = await pool.query(
    'SELECT user_id, estado FROM tecnicos WHERE uuid = ?',
    [uuid]
  );

  if (!tecnico.length || tecnico[0].estado === 'activo') {
    throw abortar(404, 'Técnico no encontrado o ya está activo');
  }

  if (tecnico[0].user_id) {
    await revocarDispositivos(tecnico[0].user_id, { motivo: 'restauracion' });
  }

  await pool.query(
    `UPDATE tecnicos SET estado = 'activo' WHERE uuid = ? AND estado = 'inactivo'`,
    [uuid]
  );
};

export default {
  listarTecnicos,
  obtenerTecnicoPorUuid,
  crearTecnico,
  actualizarTecnico,
  inactivarTecnico,
  restaurarTecnico
};
