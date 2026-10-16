import pool from '../config/db.js';

const MINUTOS_POR_DEFECTO = 30;

const minutosVentana = () => {
  const valor = Number.parseInt(process.env.WHATSAPP_CONVERSACION_MINUTOS, 10);
  return Number.isFinite(valor) && valor > 0 ? valor : MINUTOS_POR_DEFECTO;
};

export const hayConversacionAbierta = async (numero) => {
  if (!numero) return false;

  const [filas] = await pool.query(
    `SELECT numero FROM whatsapp_conversaciones
     WHERE numero = ? AND updated_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [numero, minutosVentana()]
  );

  return filas.length > 0;
};

export const abrirConversacion = async (numero, mensajeOrigen) => {
  if (!numero || !mensajeOrigen) return false;

  const [repetido] = await pool.query(
    'SELECT numero FROM whatsapp_conversaciones WHERE mensaje_origen = ?',
    [mensajeOrigen]
  );

  if (repetido.length) return false;

  await pool.query('DELETE FROM whatsapp_conversaciones WHERE numero = ?', [numero]);
  await pool.query(
    'INSERT INTO whatsapp_conversaciones (numero, mensaje_origen) VALUES (?, ?)',
    [numero, mensajeOrigen]
  );

  return true;
};

export const cerrarConversacion = async (numero) => {
  if (!numero) return;
  await pool.query('DELETE FROM whatsapp_conversaciones WHERE numero = ?', [numero]);
};

export const limpiarConversacionesVencidas = async () => {
  const [resultado] = await pool.query(
    'DELETE FROM whatsapp_conversaciones WHERE updated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)',
    [minutosVentana()]
  );

  return resultado.affectedRows;
};
