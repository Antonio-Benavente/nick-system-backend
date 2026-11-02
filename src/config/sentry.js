import * as Sentry from '@sentry/node';
import { config } from './env.js';

let activo = false;

if (config.SENTRY_DSN) {
  Sentry.init({
    dsn: config.SENTRY_DSN,
    environment: config.NODE_ENV,
    release: config.RENDER_GIT_COMMIT || undefined,
    tracesSampleRate: config.SENTRY_TRACES_SAMPLE_RATE,
    sendDefaultPii: false
  });

  activo = true;
}

export const sentryActivo = () => activo;

export const capturarExcepcion = (error, req) => {
  if (!activo) return;

  Sentry.withScope((scope) => {
    if (req?.id) scope.setTag('requestId', req.id);
    if (req?.user) {
      scope.setUser({ id: String(req.user.id), email: req.user.email, role: req.user.role });
    }
    if (req) {
      scope.setContext('peticion', {
        method: req.method,
        ruta: req.originalUrl,
        ip: req.ip
      });
    }

    Sentry.captureException(error);
  });
};

export default Sentry;
