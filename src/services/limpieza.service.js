import cron from 'node-cron';
import { config } from '../config/env.js';
import { logger } from '../config/logs.js';
import {
  limpiarConversacionesVencidas,
  limpiarMensajesAntiguos
} from './whatsappConversacion.service.js';
import { limpiarEventosAntiguos } from './incomingEvents.service.js';
import { limpiarIdempotenciaAntigua } from '../middlewares/idempotencia.middleware.js';
import { purgarDispositivosRevocados } from './dispositivos.service.js';

const INTERVALO_LIMPIEZA_MINUTOS = 15;

/**
 * Cada tarea declara cómo ejecutarse y cómo reportarse. Agregar una limpieza
 * nueva es añadir un elemento a esta lista, sin tocar el bucle ni el scheduler.
 */
const TAREAS = [
  {
    ejecutar: limpiarConversacionesVencidas,
    clave: 'borradas',
    exito: 'Conversaciones de WhatsApp vencidas eliminadas',
    error: 'Fallo limpiando conversaciones vencidas'
  },
  {
    ejecutar: limpiarMensajesAntiguos,
    clave: 'purgados',
    exito: 'Mensajes de WhatsApp purgados',
    error: 'Fallo purgando mensajes de WhatsApp'
  },
  {
    ejecutar: limpiarEventosAntiguos,
    clave: 'eventos',
    exito: 'Eventos de webhook purgados',
    error: 'Fallo purgando eventos de webhook'
  },
  {
    ejecutar: limpiarIdempotenciaAntigua,
    clave: 'claves',
    exito: 'Claves de idempotencia purgadas',
    error: 'Fallo purgando claves de idempotencia'
  },
  {
    ejecutar: purgarDispositivosRevocados,
    clave: 'dispositivos',
    exito: 'Dispositivos revocados purgados',
    error: 'Fallo purgando dispositivos revocados'
  }
];

export const ejecutarLimpieza = async () => {
  for (const tarea of TAREAS) {
    try {
      const cantidad = await tarea.ejecutar();

      if (cantidad > 0) {
        logger.info({ [tarea.clave]: cantidad }, tarea.exito);
      }
    } catch (error) {
      logger.warn({ error: error.message }, tarea.error);
    }
  }
};

export const iniciarLimpieza = () =>
  cron.schedule(
    `*/${INTERVALO_LIMPIEZA_MINUTOS} * * * *`,
    ejecutarLimpieza,
    { timezone: config.ZONA_HORARIA }
  );

export default iniciarLimpieza;
