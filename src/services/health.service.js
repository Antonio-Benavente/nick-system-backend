import pool from '../config/db.js';
import { config } from '../config/env.js';

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

export const comprobarEventosEntrantes = async () => {
  if (config.FF_INCOMING_EVENTS === 'off') return { omitido: true };

  try {
    const [[resumen]] = await conTimeout(
      pool.query(
        `SELECT
           SUM(estado = 'pending') AS pendientes,
           SUM(estado = 'processing') AS procesando,
           SUM(estado = 'failed') AS fallidos,
           SUM(estado = 'processing' AND actualizado_en < DATE_SUB(NOW(), INTERVAL 10 MINUTE)) AS atascados
         FROM incoming_events`
      ),
      TIMEOUT_COMPROBACION_MS
    );

    return {
      pendientes: Number(resumen?.pendientes || 0),
      procesando: Number(resumen?.procesando || 0),
      fallidos: Number(resumen?.fallidos || 0),
      atascados: Number(resumen?.atascados || 0)
    };
  } catch (error) {
    return { error: error.message };
  }
};

export const estadoReadiness = async () => {
  const baseDeDatos = await comprobarBaseDatos();
  const eventos = baseDeDatos.sano ? await comprobarEventosEntrantes() : { omitido: true };

  return {
    listo: baseDeDatos.sano,
    baseDeDatos,
    eventos,
    configuracion: 'ok'
  };
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
