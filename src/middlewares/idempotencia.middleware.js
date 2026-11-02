import pool from '../config/db.js';
import { config } from '../config/env.js';

const LARGO_MINIMO = 8;
const LARGO_MAXIMO = 191;
const MAXIMO_RESPUESTA = 64 * 1024;
const MINUTOS_VIGENCIA = 24;

const sinTabla = (error) => error?.code === 'ER_NO_SUCH_TABLE';

const endpointDe = (req) => String(req.originalUrl || '').split('?')[0].slice(0, 191);

const responderGuardado = (res, fila) => {
  let cuerpo = null;

  try {
    cuerpo = fila.respuesta ? JSON.parse(fila.respuesta) : null;
  } catch {
    cuerpo = null;
  }

  res.setHeader('Idempotent-Replay', 'true');
  return res.status(fila.status_code || 200).json(cuerpo);
};

export const idempotencia = (req, res, next) => {
  if (config.FF_IDEMPOTENCY !== 'enforce') return next();

  const clave = String(req.get('idempotency-key') || '').trim();

  if (!clave) return next();

  if (clave.length < LARGO_MINIMO || clave.length > LARGO_MAXIMO) {
    return res.status(400).json({
      message: `Idempotency-Key debe tener entre ${LARGO_MINIMO} y ${LARGO_MAXIMO} caracteres`
    });
  }

  const endpoint = endpointDe(req);
  const userId = req.user?.id || 0;

  const continuar = async () => {
    const json = res.json.bind(res);

    res.json = (cuerpo) => {
      const texto = cuerpo === undefined ? null : JSON.stringify(cuerpo);

      if (res.statusCode >= 400 || (texto && texto.length > MAXIMO_RESPUESTA)) {
        pool
          .query(
            'DELETE FROM idempotency_keys WHERE clave = ? AND endpoint = ? AND user_id = ?',
            [clave, endpoint, userId]
          )
          .catch(() => {});
        return json(cuerpo);
      }

      pool
        .query(
          `UPDATE idempotency_keys
           SET estado = 'completed', status_code = ?, respuesta = ?, actualizado_en = NOW()
           WHERE clave = ? AND endpoint = ? AND user_id = ?`,
          [res.statusCode, texto, clave, endpoint, userId]
        )
        .catch((error) => {
          if (!sinTabla(error)) console.warn('No se pudo guardar la respuesta idempotente:', error.message);
        })
        .finally(() => json(cuerpo));

      return res;
    };

    next();
  };

  pool
    .query(
      `INSERT INTO idempotency_keys (clave, endpoint, user_id, estado)
       VALUES (?, ?, ?, 'processing')`,
      [clave, endpoint, userId]
    )
    .then(() => continuar())
    .catch(async (error) => {
      if (sinTabla(error)) {
        console.warn('idempotency_keys no existe: se procesa sin idempotencia');
        return continuar();
      }

      if (error?.code !== 'ER_DUP_ENTRY') {
        console.error('Error comprobando Idempotency-Key:', error);
        return next(error);
      }

      try {
        const [filas] = await pool.query(
          `SELECT estado, status_code, respuesta FROM idempotency_keys
           WHERE clave = ? AND endpoint = ? AND user_id = ?`,
          [clave, endpoint, userId]
        );

        const fila = filas[0];

        if (!fila) return continuar();

        if (fila.estado === 'completed') {
          return responderGuardado(res, fila);
        }

        return res.status(409).json({
          message: 'Ya hay una petición en curso con esa Idempotency-Key'
        });
      } catch (consultaError) {
        return next(consultaError);
      }
    });
};

export const limpiarIdempotenciaAntigua = async () => {
  try {
    const [resultado] = await pool.query(
      'DELETE FROM idempotency_keys WHERE actualizado_en < DATE_SUB(NOW(), INTERVAL ? HOUR)',
      [MINUTOS_VIGENCIA]
    );

    return resultado.affectedRows;
  } catch (error) {
    if (sinTabla(error)) return 0;
    throw error;
  }
};
