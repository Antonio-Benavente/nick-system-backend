import "./config/sentry.js";
import "./config/logs.js";
import cron from 'node-cron';
import app from "./app.js";
import pool from "./config/db.js";
import { config } from "./config/env.js";
import { logger } from "./config/logs.js";
import { capturarExcepcion } from "./config/sentry.js";
import {
  limpiarConversacionesVencidas,
  limpiarMensajesAntiguos
} from "./services/whatsappConversacion.service.js";
import { limpiarEventosAntiguos } from "./services/incomingEvents.service.js";
import { limpiarIdempotenciaAntigua } from "./middlewares/idempotencia.middleware.js";
import { iniciarWarmup } from "./services/warmup.service.js";

const INTERVALO_LIMPIEZA_MINUTOS = 15;
const APAGADO_MAXIMO_MS = 10000;
const INTENTOS_ARRANQUE = 3;
const ESPERA_ARRANQUE_MS = 2000;

const PORT = config.PORT;

let cerrando = false;

const esperar = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const comprobarBaseDeDatosAlArrancar = async () => {
  for (let intento = 1; intento <= INTENTOS_ARRANQUE; intento += 1) {
    try {
      await pool.query('SELECT 1');
      logger.info({ intento }, 'MySQL disponible al arrancar');
      return true;
    } catch (error) {
      logger.warn(
        { intento, intentos: INTENTOS_ARRANQUE, error: error.message },
        'MySQL no disponible al arrancar'
      );

      if (intento < INTENTOS_ARRANQUE) await esperar(ESPERA_ARRANQUE_MS);
    }
  }

  return false;
};

const iniciarLimpieza = () => {
  const tarea = cron.schedule(`*/${INTERVALO_LIMPIEZA_MINUTOS} * * * *`, async () => {
    try {
      const borradas = await limpiarConversacionesVencidas();
      if (borradas > 0) {
        logger.info({ borradas }, 'Conversaciones de WhatsApp vencidas eliminadas');
      }
    } catch (error) {
      logger.warn({ error: error.message }, 'Fallo limpiando conversaciones vencidas');
    }

    try {
      const purgados = await limpiarMensajesAntiguos();
      if (purgados > 0) {
        logger.info({ purgados }, 'Mensajes de WhatsApp purgados');
      }
    } catch (error) {
      logger.warn({ error: error.message }, 'Fallo purgando mensajes de WhatsApp');
    }

    try {
      const eventos = await limpiarEventosAntiguos();
      if (eventos > 0) {
        logger.info({ eventos }, 'Eventos de webhook purgados');
      }
    } catch (error) {
      logger.warn({ error: error.message }, 'Fallo purgando eventos de webhook');
    }

    try {
      const claves = await limpiarIdempotenciaAntigua();
      if (claves > 0) {
        logger.info({ claves }, 'Claves de idempotencia purgadas');
      }
    } catch (error) {
      logger.warn({ error: error.message }, 'Fallo purgando claves de idempotencia');
    }
  }, { timezone: config.ZONA_HORARIA });

  return tarea;
};

async function startServer() {
  const baseDeDatosLista = await comprobarBaseDeDatosAlArrancar();

  if (!baseDeDatosLista && config.ES_PRODUCCION) {
    logger.fatal('MySQL no respondió en el arranque: no se abre el puerto');
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    logger.info(
      { puerto: PORT, entorno: config.NODE_ENV, zonaHoraria: config.ZONA_HORARIA },
      'Servidor iniciado'
    );

    if (!baseDeDatosLista) {
      logger.warn('El servidor arrancó sin MySQL: /ready responderá 503');
    }
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      logger.fatal({ puerto: PORT }, 'El puerto ya está en uso');
    } else {
      logger.fatal({ error }, 'Error del servidor HTTP');
    }
    process.exit(1);
  });

  const tareaLimpieza = iniciarLimpieza();
  const tareasWarmup = iniciarWarmup();

  const shutdown = (senal) => {
    if (cerrando) return;
    cerrando = true;

    logger.info({ senal }, 'Cerrando servidor');
    tareaLimpieza.stop();
    (tareasWarmup || []).forEach((tarea) => tarea.stop());

    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });

    setTimeout(() => process.exit(1), APAGADO_MAXIMO_MS).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (razon) => {
    logger.error({ error: razon }, 'Promesa rechazada sin manejar');
    capturarExcepcion(razon instanceof Error ? razon : new Error(String(razon)), null);
  });

  process.on("uncaughtException", (error) => {
    logger.fatal({ error }, 'Excepción no capturada');
    capturarExcepcion(error, null);
    shutdown("uncaughtException");
  });
}

startServer().catch((error) => {
  logger.fatal({ error }, 'No se pudo iniciar el servidor');
  process.exit(1);
});
