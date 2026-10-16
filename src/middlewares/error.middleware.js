import { ValidationError } from '../validators/validators.js';

export class HttpError extends Error {
  constructor(statusCode, message, body = null) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.body = body;
  }
}

export const abortar = (statusCode, message, body = null) =>
  new HttpError(statusCode, message, body);

const ERRORES_BD = {
  ER_DUP_ENTRY: {
    status: 409,
    error: 'DuplicateEntry',
    message: 'El registro ya existe en la base de datos'
  },
  ER_NO_REFERENCED_ROW_2: {
    status: 400,
    error: 'ForeignKeyError',
    message: 'Referencia inválida a otro registro'
  },
  ER_ROW_IS_REFERENCED_2: {
    status: 409,
    error: 'ReferencedRow',
    message: 'El registro está siendo usado por otro y no se puede modificar'
  },
  ER_DATA_TOO_LONG: {
    status: 400,
    error: 'ValueTooLong',
    message: 'Alguno de los valores enviados excede el tamaño permitido'
  },
  ER_BAD_NULL_ERROR: {
    status: 400,
    error: 'MissingValue',
    message: 'Faltan campos obligatorios para completar la operación'
  },
  ER_TRUNCATED_WRONG_VALUE: {
    status: 400,
    error: 'InvalidValue',
    message: 'Alguno de los valores enviados no es válido para su campo'
  },
  ER_NO_REFERENCED_ROW: {
    status: 400,
    error: 'ForeignKeyError',
    message: 'Referencia inválida a otro registro'
  },
  ER_CHECK_CONSTRAINT_VIOLATED: {
    status: 400,
    error: 'ConstraintError',
    message: 'El valor enviado no cumple las reglas del sistema'
  },
  ER_LOCK_DEADLOCK: {
    status: 409,
    error: 'Conflict',
    message: 'La operación chocó con otra en curso. Intenta de nuevo.'
  }
};

const esDesarrollo = () => process.env.NODE_ENV === 'development';

export const mapearError = (err) => ERRORES_BD[err?.code] || null;

export const responderError = (err, res, mensajePorDefecto) => {
  if (err instanceof HttpError) {
    return res.status(err.statusCode).json(err.body || { message: err.message });
  }

  const mapeado = mapearError(err);

  if (mapeado) {
    return res.status(mapeado.status).json({
      error: mapeado.error,
      message: mapeado.message
    });
  }

  if (err?.type === 'entity.parse.failed') {
    return res.status(400).json({
      error: 'InvalidJSON',
      message: 'El cuerpo de la petición no es JSON válido'
    });
  }

  const status = err?.statusCode || 500;

  if (status >= 500) {
    return res.status(status).json({
      error: 'ServerError',
      message: mensajePorDefecto || 'Error interno del servidor',
      ...(esDesarrollo() && { detail: err?.message, stack: err?.stack })
    });
  }

  return res.status(status).json({
    error: 'ClientError',
    message: err?.message || mensajePorDefecto || 'Error en la solicitud',
    ...(esDesarrollo() && { stack: err?.stack })
  });
};

export const errorHandler = (err, req, res, next) => {
  if (res.headersSent) {
    return next(err);
  }

  const status = err instanceof HttpError ? err.statusCode : (err?.statusCode || 500);

  if (status >= 500) {
    console.error('Error capturado:', err);
  } else if (esDesarrollo()) {
    console.warn(`Error ${status} en ${req.method} ${req.originalUrl}: ${err?.message}`);
  }

  if (err instanceof ValidationError) {
    return res.status(err.statusCode || 400).json({
      error: 'ValidationError',
      message: err.message,
      field: err.field
    });
  }

  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'InvalidToken',
      message: 'Token inválido'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'TokenExpired',
      message: 'Token expirado'
    });
  }

  return responderError(err, res);
};
