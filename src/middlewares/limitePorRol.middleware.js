import rateLimit from 'express-rate-limit';
import { limiteExcedido } from './limite.middleware.js';

const VENTANA_MS = 15 * 60 * 1000;

const crear = (limit, mensaje) =>
  rateLimit({
    windowMs: VENTANA_MS,
    limit,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: limiteExcedido(mensaje)
  });

const LIMITES = {
  admin: crear(1500, 'Demasiadas peticiones de administración. Intenta de nuevo en unos minutos.'),
  tecnico: crear(600, 'Demasiadas peticiones. Intenta de nuevo en unos minutos.'),
  cliente: crear(300, 'Demasiadas peticiones. Intenta de nuevo en unos minutos.'),
  publico: crear(120, 'Demasiadas peticiones. Intenta de nuevo en unos minutos.')
};

export const limitadorPorRol = (req, res, next) => {
  const limitador = LIMITES[req.user?.role] || LIMITES.publico;
  return limitador(req, res, next);
};

export default limitadorPorRol;
