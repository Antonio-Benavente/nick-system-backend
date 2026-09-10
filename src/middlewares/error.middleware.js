import { ValidationError } from '../validators/validators.js';

export const errorHandler = (err, req, res, next) => {
  console.error('Error capturado:', err);

  if (err instanceof ValidationError) {
    return res.status(err.statusCode || 400).json({
      error: 'ValidationError',
      message: err.message,
      field: err.field
    });
  }

  if (err.code === 'ER_DUP_ENTRY') {
    return res.status(409).json({
      error: 'DuplicateEntry',
      message: 'El registro ya existe en la base de datos'
    });
  }

  if (err.code === 'ER_NO_REFERENCED_ROW_2') {
    return res.status(400).json({
      error: 'ForeignKeyError',
      message: 'Referencia inválida a otro registro'
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

  res.status(err.statusCode || 500).json({
    error: 'ServerError',
    message: err.message || 'Error interno del servidor',
    ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
  });
};
