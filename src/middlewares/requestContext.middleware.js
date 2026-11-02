import { randomUUID } from 'node:crypto';
import { contextoPeticion, logger } from '../config/logs.js';

const ID_VALIDO = /^[A-Za-z0-9._:-]{8,128}$/;
const RUTAS_SILENCIOSAS = new Set(['/health', '/ready']);

const rutaDe = (req) => {
  if (req.route?.path) return `${req.baseUrl || ''}${req.route.path}`;
  return String(req.originalUrl || '').split('?')[0];
};

export default function requestContext(req, res, next) {
  const entrante = String(req.get('x-request-id') || '').trim();
  const requestId = ID_VALIDO.test(entrante) ? entrante : randomUUID();

  req.id = requestId;
  res.setHeader('X-Request-Id', requestId);

  const contexto = {
    requestId,
    ip: req.ip,
    route: null,
    userId: null,
    inicio: process.hrtime.bigint()
  };

  contextoPeticion.run(contexto, () => {
    res.on('finish', () => {
      contexto.route = rutaDe(req);
      contexto.userId = req.user?.id || null;

      if (RUTAS_SILENCIOSAS.has(contexto.route)) return;

      const duracionMs = Number(process.hrtime.bigint() - contexto.inicio) / 1e6;
      const nivel = res.statusCode >= 500 ? 'error' : res.statusCode >= 400 ? 'warn' : 'info';

      logger[nivel](
        {
          http: {
            method: req.method,
            route: contexto.route,
            status: res.statusCode,
            ms: Math.round(duracionMs)
          },
          ip: req.ip
        },
        'Petición HTTP'
      );
    });

    next();
  });
}
