import pool from '../config/db.js';
import { config } from '../config/env.js';

const MINUTOS_ATASCO = 10;
const DIAS_RETENCION = 30;

const sinTabla = (error) => error?.code === 'ER_NO_SUCH_TABLE';

export const reclamarEvento = async ({ origen, eventoId, payload }) => {
  if (!eventoId || config.FF_INCOMING_EVENTS === 'off') {
    return { procesar: true, id: null };
  }

  const contenido = payload ? JSON.stringify(payload) : null;

  try {
    const [resultado] = await pool.query(
      `INSERT INTO incoming_events (origen, evento_externo_id, estado, payload, intentos)
       VALUES (?, ?, 'processing', ?, 1)`,
      [origen, eventoId, contenido]
    );

    return { procesar: true, id: resultado.insertId, nuevo: true };
  } catch (error) {
    if (sinTabla(error)) {
      console.warn('incoming_events no existe: se procesa sin idempotencia técnica');
      return { procesar: true, id: null };
    }

    if (error?.code !== 'ER_DUP_ENTRY') throw error;
  }

  const [filas] = await pool.query(
    'SELECT id, estado, intentos FROM incoming_events WHERE origen = ? AND evento_externo_id = ?',
    [origen, eventoId]
  );

  const evento = filas[0];
  if (!evento) return { procesar: true, id: null };

  if (config.FF_INCOMING_EVENTS !== 'enforce') {
    await pool.query(
      `UPDATE incoming_events
       SET estado = 'processing', intentos = intentos + 1, error = NULL
       WHERE id = ?`,
      [evento.id]
    );

    return { procesar: true, id: evento.id, repetido: true };
  }

  if (evento.estado === 'processed') {
    return { procesar: false, id: evento.id, motivo: 'ya_procesado' };
  }

  if (evento.estado === 'processing') {
    const [reclamado] = await pool.query(
      `UPDATE incoming_events
       SET intentos = intentos + 1, error = NULL, actualizado_en = NOW()
       WHERE id = ?
         AND estado = 'processing'
         AND actualizado_en < DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
      [evento.id, MINUTOS_ATASCO]
    );

    if (reclamado.affectedRows === 0) {
      return { procesar: false, id: evento.id, motivo: 'en_proceso' };
    }

    return { procesar: true, id: evento.id, reintento: true };
  }

  await pool.query(
    `UPDATE incoming_events
     SET estado = 'processing', intentos = intentos + 1, error = NULL
     WHERE id = ?`,
    [evento.id]
  );

  return { procesar: true, id: evento.id, reintento: true };
};

export const marcarProcesado = async (id) => {
  if (!id) return;

  try {
    await pool.query(
      `UPDATE incoming_events
       SET estado = 'processed', procesado_en = NOW(), error = NULL, actualizado_en = NOW()
       WHERE id = ?`,
      [id]
    );
  } catch (error) {
    if (!sinTabla(error)) throw error;
  }
};

export const marcarFallido = async (id, error) => {
  if (!id) return;

  const detalle = String(error?.message || error || 'Error desconocido').slice(0, 2000);

  try {
    await pool.query(
      `UPDATE incoming_events
       SET estado = 'failed', error = ?, actualizado_en = NOW()
       WHERE id = ?`,
      [detalle, id]
    );
  } catch (fallo) {
    if (!sinTabla(fallo)) throw fallo;
  }
};

export const limpiarEventosAntiguos = async () => {
  try {
    const [resultado] = await pool.query(
      `DELETE FROM incoming_events
       WHERE estado IN ('processed', 'failed')
         AND creado_en < DATE_SUB(NOW(), INTERVAL ? DAY)`,
      [DIAS_RETENCION]
    );

    return resultado.affectedRows;
  } catch (error) {
    if (sinTabla(error)) return 0;
    throw error;
  }
};
