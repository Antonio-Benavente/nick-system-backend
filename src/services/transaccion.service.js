import pool from '../config/db.js';

export const conTransaccion = async (fn) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const resultado = await fn(connection);
    await connection.commit();
    return resultado;
  } catch (error) {
    await connection.rollback().catch(() => {});
    throw error;
  } finally {
    connection.release();
  }
};
