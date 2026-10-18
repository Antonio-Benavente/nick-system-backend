import pool from '../config/db.js';

const MINUTOS_POR_DEFECTO = 30;
const DIAS_MENSAJES_POR_DEFECTO = 7;

const minutosVentana = () => {
  const valor = Number.parseInt(process.env.WHATSAPP_CONVERSACION_MINUTOS, 10);
  return Number.isFinite(valor) && valor > 0 ? valor : MINUTOS_POR_DEFECTO;
};

const diasMensajes = () => {
  const valor = Number.parseInt(process.env.WHATSAPP_MENSAJES_DIAS, 10);
  return Number.isFinite(valor) && valor > 0 ? valor : DIAS_MENSAJES_POR_DEFECTO;
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

// Estado pendiente: cuántos intentos lleva el cliente sin completar los datos.
export const obtenerConversacion = async (numero) => {
  if (!numero) return null;

  const [filas] = await pool.query(
    `SELECT numero, mensaje_origen, intentos FROM whatsapp_conversaciones
     WHERE numero = ? AND updated_at >= DATE_SUB(NOW(), INTERVAL ? MINUTE)`,
    [numero, minutosVentana()]
  );

  return filas[0] || null;
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
    'INSERT INTO whatsapp_conversaciones (numero, mensaje_origen, intentos) VALUES (?, ?, 0)',
    [numero, mensajeOrigen]
  );

  return true;
};

export const sumarIntento = async (numero) => {
  if (!numero) return 0;

  await pool.query('UPDATE whatsapp_conversaciones SET intentos = intentos + 1 WHERE numero = ?', [
    numero
  ]);

  const [filas] = await pool.query('SELECT intentos FROM whatsapp_conversaciones WHERE numero = ?', [
    numero
  ]);

  return filas[0]?.intentos ?? 0;
};

export const cerrarConversacion = async (numero) => {
  if (!numero) return;
  await pool.query('DELETE FROM whatsapp_conversaciones WHERE numero = ?', [numero]);
};

/**
 * Idempotencia del webhook. Se llama justo ANTES de enviarle una respuesta al
 * cliente: si el wamid ya estaba, Meta está reintentando y hay que salir sin
 * volver a escribir. `true` = es un mensaje nuevo.
 */
export const registrarMensajeProcesado = async (mensajeOrigen, numero) => {
  if (!mensajeOrigen) return true;

  try {
    await pool.query('INSERT INTO whatsapp_mensajes (mensaje_origen, numero) VALUES (?, ?)', [
      mensajeOrigen,
      numero || null
    ]);

    return true;
  } catch (error) {
    if (error && error.code === 'ER_DUP_ENTRY') return false;
    throw error;
  }
};

export const limpiarConversacionesVencidas = async () => {
  const [resultado] = await pool.query(
    'DELETE FROM whatsapp_conversaciones WHERE updated_at < DATE_SUB(NOW(), INTERVAL ? MINUTE)',
    [minutosVentana()]
  );

  return resultado.affectedRows;
};

export const limpiarMensajesAntiguos = async () => {
  const [resultado] = await pool.query(
    'DELETE FROM whatsapp_mensajes WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
    [diasMensajes()]
  );

  return resultado.affectedRows;
};