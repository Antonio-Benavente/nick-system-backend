import pool from '../config/db.js';

export const conTransaccion = async (fn) => {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const resultado = await fn(connection);
    await connection.commit();
    return resultado;
  } catch (error) {
    await connection.rollback().catch((falloRollback) => {
      console.error('No se pudo hacer rollback de la transacción:', falloRollback.message);
    });
    throw error;
  } finally {
    connection.release();
  }
};
