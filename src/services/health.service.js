import pool from '../config/db.js';

const TIMEOUT_COMPROBACION_MS = 8000;

const conTimeout = (promesa, ms) =>
  Promise.race([
    promesa,
    new Promise((_, reject) => {
      const temporizador = setTimeout(
        () => reject(new Error(`sin respuesta en ${ms} ms`)),
        ms
      );
      if (typeof temporizador.unref === 'function') temporizador.unref();
    })
  ]);

export const comprobarBaseDatos = async () => {
  try {
    await conTimeout(pool.query('SELECT 1'), TIMEOUT_COMPROBACION_MS);
    return { sano: true };
  } catch (error) {
    return { sano: false, motivo: error.message };
  }
};

export const exigirBaseDeDatos = async (canal) => {
  const resultado = await comprobarBaseDatos();

  if (!resultado.sano) {
    console.error(
      `Health previo de ${canal}: MySQL no respondió — ${resultado.motivo}`
    );
  }

  return resultado;
};