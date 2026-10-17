import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  enviarNotificacionReporte,
  verificarConfiguracion,
} from '../controllers/notificaciones.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';
import { asyncHandler } from '../middlewares/async.middleware.js';
import { limiteExcedido } from '../middlewares/limite.middleware.js';

const router = Router();

const emailLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: limiteExcedido('Demasiadas notificaciones enviadas. Intenta de nuevo más tarde.'),
});

router.post(
  '/reporte/:uuid/enviar',
  authMiddleware,
  roleMiddleware('tecnico', 'admin'),
  emailLimiter,
  asyncHandler(enviarNotificacionReporte)
);

router.get(
  '/verificar',
  authMiddleware,
  roleMiddleware('admin'),
  asyncHandler(verificarConfiguracion)
);

export default router;
