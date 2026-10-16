import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import { validatePassword } from '../validators/validators.js';
import { abortar } from '../middlewares/error.middleware.js';

const JWT_EXPIRES_IN_POR_DEFECTO = '1d';

const HASH_IGUALADO =
  '$2a$10$SQ382ScImEnz2yL4zzZkv.NmveD76AEMu975vZwIhvdlCGwLiZ.b.';

const RESPUESTA_SESION = (user) => ({
  id: user.id,
  uuid: user.uuid,
  name: user.name,
  email: user.email,
  role: user.role,
  empresa: user.empresa ?? null,
});

const firmarToken = (user, sesionVersion) =>
  jwt.sign(
    {
      id: user.id,
      uuid: user.uuid,
      role: user.role,
      sv: sesionVersion
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || JWT_EXPIRES_IN_POR_DEFECTO }
  );

const estaActivo = async (user) => {
  if (user.role === 'tecnico') {
    const [tecnico] = await pool.query(
      'SELECT estado FROM tecnicos WHERE user_id = ?',
      [user.id]
    );
    return Boolean(tecnico.length) && tecnico[0].estado === 'activo';
  }

  if (user.role === 'cliente') {
    const [cliente] = await pool.query(
      'SELECT estado FROM clientes WHERE user_id = ?',
      [user.id]
    );
    return Boolean(cliente.length) && cliente[0].estado === 'activo';
  }

  return true;
};

export const login = async (req, res) => {
  const { email, password } = req.body;

  if (typeof email !== 'string' || typeof password !== 'string' || !email.trim() || !password) {
    throw abortar(400, 'Email y contraseña son requeridos');
  }

  const [rows] = await pool.query(
    'SELECT id, uuid, name, email, role, empresa, password, sesion_version FROM users WHERE email = ?',
    [email.trim()]
  );

  const user = rows[0];

  const isValid = await bcrypt.compare(password, user?.password || HASH_IGUALADO);

  if (!user || !isValid) {
    throw abortar(401, 'Credenciales inválidas');
  }

  if (!(await estaActivo(user))) {
    throw abortar(401, 'Credenciales inválidas');
  }

  const token = firmarToken(user, user.sesion_version);

  res.json({
    token,
    user: RESPUESTA_SESION(user)
  });
};

export const miPerfil = async (req, res) => {
  const [rows] = await pool.query(
    'SELECT id, uuid, name, email, role, empresa FROM users WHERE id = ?',
    [req.user.id]
  );

  if (rows.length === 0) {
    throw abortar(404, 'Usuario no encontrado');
  }

  res.json(RESPUESTA_SESION(rows[0]));
};

export const logout = async (req, res) => {
  await pool.query('UPDATE users SET sesion_version = sesion_version + 1 WHERE id = ?', [
    req.user.id
  ]);

  res.json({ message: 'Sesión cerrada correctamente' });
};

export const cambiarPassword = async (req, res) => {
  const { password_actual, password_nuevo } = req.body;

  if (typeof password_actual !== 'string' || !password_actual) {
    throw abortar(400, 'La contraseña actual es requerida', {
      message: 'La contraseña actual es requerida',
      field: 'password_actual'
    });
  }

  validatePassword(password_nuevo, 'password_nuevo');

  if (password_actual === password_nuevo) {
    throw abortar(400, 'La contraseña nueva debe ser distinta de la actual', {
      message: 'La contraseña nueva debe ser distinta de la actual',
      field: 'password_nuevo'
    });
  }

  const [rows] = await pool.query('SELECT password FROM users WHERE id = ?', [req.user.id]);

  if (rows.length === 0) {
    throw abortar(404, 'Usuario no encontrado');
  }

  const coincide = await bcrypt.compare(password_actual, rows[0].password);

  if (!coincide) {
    throw abortar(400, 'La contraseña actual no es correcta', {
      message: 'La contraseña actual no es correcta',
      field: 'password_actual'
    });
  }

  const hash = await bcrypt.hash(password_nuevo, 10);

  await pool.query(
    'UPDATE users SET password = ?, sesion_version = sesion_version + 1 WHERE id = ?',
    [hash, req.user.id]
  );

  res.json({ message: 'Contraseña actualizada. Inicia sesión nuevamente.' });
};
