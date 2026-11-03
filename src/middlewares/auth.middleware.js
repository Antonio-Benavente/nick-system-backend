import jwt from 'jsonwebtoken';
import pool from '../config/db.js';
import { config } from '../config/env.js';
import { contextoPeticion } from '../config/logs.js';

const ESTADO_POR_DEFECTO = 'activo';

const SELECT_USUARIO = `
  SELECT
    u.id,
    u.uuid,
    u.name,
    u.email,
    u.role,
    u.sesion_version,
    te.id AS tecnico_id,
    te.uuid AS tecnico_uuid,
    COALESCE(te.estado, 'inactivo') AS estado,
    d.id AS dispositivo_id,
    d.revocado_at AS dispositivo_revocado_at
  FROM users u
  LEFT JOIN tecnicos te ON te.user_id = u.id AND u.role = 'tecnico'
  LEFT JOIN dispositivos d ON d.sid = ? AND d.user_id = u.id
  WHERE u.id = ? AND u.uuid = ?
`;

const SELECT_USUARIO_CLIENTE = `
  SELECT
    u.id,
    u.uuid,
    u.name,
    u.email,
    u.role,
    u.sesion_version,
    cl.id AS cliente_id,
    COALESCE(cl.estado, 'inactivo') AS estado
  FROM users u
  LEFT JOIN clientes cl ON cl.user_id = u.id AND u.role = 'cliente'
  WHERE u.id = ? AND u.uuid = ?
`;

const SELECT_USUARIO_ADMIN = `
  SELECT
    u.id,
    u.uuid,
    u.name,
    u.email,
    u.role,
    u.sesion_version,
    'activo' AS estado
  FROM users u
  WHERE u.id = ? AND u.uuid = ?
`;

const SELECT_POR_ROL = {
  admin: SELECT_USUARIO_ADMIN,
  tecnico: SELECT_USUARIO,
  cliente: SELECT_USUARIO_CLIENTE
};

export default async function authMiddleware(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader) {
    return res.status(401).json({ message: 'Token requerido' });
  }

  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : null;

  if (!token) {
    return res.status(401).json({ message: 'Token requerido' });
  }

  let payload;
  try {
    payload = jwt.verify(token, config.JWT_SECRET);
  } catch (error) {
    console.warn(
      `Token rechazado en ${req.method} ${req.originalUrl}: ${error.name === 'TokenExpiredError' ? 'expirado' : 'inválido'}`
    );
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }

  try {
    if (payload.sid && payload.role !== 'tecnico') {
      console.warn(`Token con sid de rol no técnico en ${req.method} ${req.originalUrl}`);
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }

    const consulta = SELECT_POR_ROL[payload.role] || SELECT_USUARIO_ADMIN;
    const parametros = payload.role === 'tecnico'
      ? [payload.sid || '', payload.id, payload.uuid]
      : [payload.id, payload.uuid];
    const [rows] = await pool.query(consulta, parametros);

    if (rows.length === 0) {
      console.warn(`Token sin usuario en ${req.method} ${req.originalUrl} (id ${payload.id})`);
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }

    const usuario = rows[0];

    if (usuario.role !== payload.role) {
      console.warn(`Rol del token distinto al de la base en ${req.method} ${req.originalUrl}`);
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }

    if (payload.sid) {
      if (!usuario.dispositivo_id || usuario.dispositivo_revocado_at) {
        console.warn(`Dispositivo revocado en ${req.method} ${req.originalUrl} (id ${payload.id})`);
        return res.status(401).json({
          message: 'La sesión fue cerrada. Inicia sesión nuevamente.'
        });
      }
    } else if (Number(usuario.sesion_version) !== Number(payload.sv || 0)) {
      console.warn(`Sesión cerrada (sesion_version) en ${req.method} ${req.originalUrl} (id ${payload.id})`);
      return res.status(401).json({
        message: 'La sesión fue cerrada. Inicia sesión nuevamente.',
      });
    }

    if (usuario.estado !== ESTADO_POR_DEFECTO) {
      console.warn(`Cuenta inactiva en ${req.method} ${req.originalUrl} (id ${payload.id}, rol ${usuario.role})`);
      return res.status(401).json({
        message: 'Tu cuenta está inactiva. Contacta al administrador.',
      });
    }

    const contexto = contextoPeticion.getStore();
    if (contexto) contexto.userId = usuario.id;

    req.user = {
      id: usuario.id,
      uuid: usuario.uuid,
      name: usuario.name,
      email: usuario.email,
      role: usuario.role,
      ...(payload.sid ? { sid: payload.sid } : {})
    };

    if (payload.sid) {
      pool
        .query(
          `UPDATE dispositivos
           SET last_seen_at = NOW()
           WHERE sid = ? AND user_id = ? AND revocado_at IS NULL
             AND last_seen_at < DATE_SUB(NOW(), INTERVAL 5 MINUTE)`,
          [payload.sid, usuario.id]
        )
        .catch((error) => {
          console.warn(`No se pudo actualizar last_seen_at: ${error.message}`);
        });
    }

    if (usuario.role === 'tecnico') {
      req.user.tecnico = { id: usuario.tecnico_id, uuid: usuario.tecnico_uuid };
    }

    if (usuario.role === 'cliente') {
      req.user.cliente = { id: usuario.cliente_id };
    }

    next();
  } catch (error) {
    console.error(`Error verificando la sesión en ${req.method} ${req.originalUrl}:`, error);
    return res.status(500).json({ message: 'Error verificando la sesión' });
  }
}