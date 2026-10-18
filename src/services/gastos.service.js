import { randomUUID } from 'node:crypto';
import pool from '../config/db.js';

const COLUMNAS = 'uuid, concepto, detalle, CAST(monto AS CHAR) AS monto, created_at';

export const listarGastos = async (ticketId) => {
  const [filas] = await pool.query(
    `SELECT ${COLUMNAS} FROM ticket_gastos WHERE ticket_id = ? ORDER BY created_at ASC, id ASC`,
    [ticketId]
  );
  return filas;
};

export const crearGasto = async (ticketId, { concepto, detalle, monto }) => {
  const uuid = randomUUID();

  const [resultado] = await pool.query(
    `INSERT INTO ticket_gastos (uuid, ticket_id, concepto, detalle, monto)
     VALUES (?, ?, ?, ?, ?)`,
    [uuid, ticketId, concepto, detalle, monto]
  );

  const [filas] = await pool.query(
    `SELECT ${COLUMNAS} FROM ticket_gastos WHERE id = ?`,
    [resultado.insertId]
  );

  return filas[0];
};

export const actualizarGasto = async (uuid, { concepto, detalle, monto }) => {
  const [resultado] = await pool.query(
    `UPDATE ticket_gastos SET concepto = ?, detalle = ?, monto = ? WHERE uuid = ?`,
    [concepto, detalle, monto, uuid]
  );

  if (resultado.affectedRows !== 1) return null;

  const [filas] = await pool.query(
    `SELECT ${COLUMNAS} FROM ticket_gastos WHERE uuid = ?`,
    [uuid]
  );

  return filas[0];
};

export const eliminarGasto = async (uuid) => {
  const [resultado] = await pool.query('DELETE FROM ticket_gastos WHERE uuid = ?', [uuid]);
  return resultado.affectedRows === 1;
};