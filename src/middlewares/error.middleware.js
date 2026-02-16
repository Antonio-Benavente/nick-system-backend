import { ValidationError } from '../validators/validators.js';

/**
 * Middleware centralizado de manejo de errores
 * Implementa manejo consistente de errores en toda la aplicaciÃ³n
 */
export const errorHandler = (err, req, res, next) => {
  console.error('Error capturado:', err);

  // Error de validación
  if (err instanceof ValidationError) {
    return res.status(err.statusCode || 400).json({
      error: 'ValidationError',
      message: err.message,
      field: err.field
    });
  }

  // Error de base de datos - Duplicate entry
  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: 'DuplicateEntry',
      message: 'El registro ya existe en la base de datos'
    });
  }

  // Error de base de datos - Foreign key constraint
  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({
      error: 'ForeignKeyError',
      message: 'Referencia invÃ¡lida a otro registro'
    });
  }

  // Error de JWT
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      error: 'InvalidToken',
      message: 'Token invÃ¡lido'
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      error: 'TokenExpired',
      message: 'Token expirado'
    });
  }

  // Error genérico del servidor
  res.status(err.statusCode || 500).json({
    error: 'ServerError',
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};

/**
 * Wrapper para funciones async en rutas
 * Captura errores automÃ¡ticamente y los pasa al middleware de errores
 */
export const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
