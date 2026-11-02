import pino from 'pino';
import pretty from 'pino-pretty';
import { format } from 'node:util';
import { AsyncLocalStorage } from 'node:async_hooks';
import { config } from './env.js';

export const contextoPeticion = new AsyncLocalStorage();

const REDACTAR = {
  paths: [
    'password',
    'password_actual',
    'password_nuevo',
    'token',
    'authorization',
    'req.headers.authorization',
    'headers.authorization'
  ],
  censor: '[REDACTADO]'
};

const formatoHoraLima = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hour12: false
});

const crearStreamLegible = () =>
  pretty({
    sync: true,
    colorize: false,
    singleLine: true,
    translateTime: 'SYS:dd/mm/yyyy HH:MM:ss',
    ignore: 'pid,hostname,servicio,entorno,requestId'
  });

const usarFormatoLegible = process.env.LOG_PRETTY === 'true';

export const logger = pino(
  {
    level: config.LOG_LEVEL,
    base: {
      servicio: 'nick-system-backend',
      entorno: config.NODE_ENV
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    redact: REDACTAR,
    mixin() {
      const contexto = contextoPeticion.getStore();
      if (!contexto) return {};

      return {
        requestId: contexto.requestId,
        ...(contexto.userId ? { userId: contexto.userId } : {}),
        ...(contexto.route ? { route: contexto.route } : {})
      };
    }
  },
  usarFormatoLegible ? crearStreamLegible() : undefined
);

const NIVEL_POR_CONSOLA = {
  log: 'info',
  info: 'info',
  warn: 'warn',
  error: 'error',
  debug: 'debug'
};

const originales = {};

for (const [metodo, nivel] of Object.entries(NIVEL_POR_CONSOLA)) {
  originales[metodo] = console[metodo].bind(console);

  console[metodo] = (...argumentos) => {
    const errores = argumentos.filter((argumento) => argumento instanceof Error);
    const resto = argumentos.filter((argumento) => !(argumento instanceof Error));

    const detalle = { consola: true };

    if (errores.length) {
      detalle.err = errores.length === 1 ? errores[0] : errores;
    }

    logger[nivel](detalle, format(...resto));
  };
}

export const registros = originales;

export default logger;