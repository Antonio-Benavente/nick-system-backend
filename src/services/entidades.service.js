import pool from '../config/db.js';

export async function getClienteByUserId(userId, client = pool) {
  const [rows] = await client.query(
    'SELECT id FROM clientes WHERE user_id = ?',
    [userId]
  );

  return rows[0] || null;
}

export async function getTecnicoByUserId(userId, client = pool) {
  const [rows] = await client.query(
    'SELECT id, uuid FROM tecnicos WHERE user_id = ?',
    [userId]
  );

  return rows[0] || null;
}