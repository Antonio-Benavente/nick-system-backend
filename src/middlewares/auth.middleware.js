import jwt from 'jsonwebtoken';
import pool from '../config/db.js';

const ESTADO_POR_DEFECTO = 'activo';

const SELECT_USUARIO = `
  SELECT
    u.id,
    u.uuid,
    u.name,
    u.email,
    u.role,
    u.sesion_version,
    COALESCE(
      CASE u.role
        WHEN 'tecnico' THEN (SELECT estado FROM tecnicos WHERE user_id = u.id)
        WHEN 'cliente' THEN (SELECT estado FROM clientes WHERE user_id = u.id)
        ELSE 'activo'
      END,
      'inactivo'
    ) AS estado
  FROM users u
  WHERE u.id = ? AND u.uuid = ?
`;

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
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch (error) {
    console.warn(
      `Token rechazado en ${req.method} ${req.originalUrl}: ${error.name === 'TokenExpiredError' ? 'expirado' : 'inválido'}`
    );
    return res.status(401).json({ message: 'Token inválido o expirado' });
  }

  try {
    const [rows] = await pool.query(SELECT_USUARIO, [payload.id, payload.uuid]);

    if (rows.length === 0) {
      console.warn(`Token sin usuario en ${req.method} ${req.originalUrl} (id ${payload.id})`);
      return res.status(401).json({ message: 'Token inválido o expirado' });
    }

    const usuario = rows[0];

    if (Number(usuario.sesion_version) !== Number(payload.sv || 0)) {
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

    req.user = {
      id: usuario.id,
      uuid: usuario.uuid,
      name: usuario.name,
      email: usuario.email,
      role: usuario.role,
    };

    next();
  } catch (error) {
    console.error(`Error verificando la sesión en ${req.method} ${req.originalUrl}:`, error);
    return res.status(500).json({ message: 'Error verificando la sesión' });
  }
}