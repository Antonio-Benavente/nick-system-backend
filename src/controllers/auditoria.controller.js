import pool from '../config/db.js';
import { cabeceraPaginacion, contar } from '../services/paginacion.service.js';

const LIMITE_POR_DEFECTO = 100;
const TOPE_AUDITORIA = 500;

const entero = (valor, porDefecto, minimo, maximo) => {
  const n = Number.parseInt(valor, 10);

  if (!Number.isFinite(n)) return porDefecto;

  return Math.min(Math.max(n, minimo), maximo);
};

export const listarAuditoriaClaves = async (req, res) => {
  const limite = entero(req.query.limite, LIMITE_POR_DEFECTO, 1, TOPE_AUDITORIA);
  const offset = entero(req.query.offset, 0, 0, Number.MAX_SAFE_INTEGER);

  const condiciones = [];
  const params = [];

  if (req.query.user_id !== undefined) {
    const userId = Number(req.query.user_id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return res.status(400).json({
        message: 'user_id debe ser un número entero positivo'
      });
    }

    condiciones.push('user_id = ?');
    params.push(userId);
  }

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const total = await contar(
    pool,
    `SELECT COUNT(*) AS total FROM claves_auditoria ${donde}`,
    params
  );

  cabeceraPaginacion(res, { total, limite, offset });

  const [rows] = await pool.query(
    `SELECT id, user_id, user_email, accion, ip, user_agent, created_at
     FROM claves_auditoria ${donde}
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, limite, offset]
  );

  res.json(rows);
};
