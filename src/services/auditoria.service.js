import pool from '../config/db.js';

const RECORTE = {
  accion: 50,
  ip: 45,
  user_agent: 255
};

const recortar = (valor, max) =>
  typeof valor === 'string' && valor.trim() ? valor.trim().slice(0, max) : null;

const ipDe = (req) =>
  recortar(req.headers['x-forwarded-for']?.split(',')[0] || req.ip || req.socket?.remoteAddress, RECORTE.ip);

export const registrarAuditoriaClave = async (req, accion) => {
  try {
    await pool.query(
      `INSERT INTO claves_auditoria (user_id, user_email, accion, ip, user_agent)
       VALUES (?, ?, ?, ?, ?)`,
      [
        req.user.id,
        recortar(req.user.email, 100) || 'desconocido',
        recortar(accion, RECORTE.accion) || 'desconocida',
        ipDe(req),
        recortar(req.headers['user-agent'], RECORTE.user_agent)
      ]
    );
  } catch (error) {
    console.warn('No se pudo registrar la auditoría de claves:', error.message);
  }
};