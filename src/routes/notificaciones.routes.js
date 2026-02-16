import { Router } from 'express';
import {
  enviarNotificacionReporte,
  verificarConfiguracion,
} from '../controllers/notificaciones.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';

const router = Router();

// =====================================================
// RUTAS DE NOTIFICACIONES
// =====================================================

// POST /notificaciones/reporte/:uuid/enviar
// Enviar notificación de reporte al cliente
router.post(
  '/reporte/:uuid/enviar',
  authMiddleware,
  roleMiddleware('tecnico', 'admin'),
  enviarNotificacionReporte
);

// GET /notificaciones/verificar
router.get(
  '/verificar',
  authMiddleware,
  roleMiddleware('admin'),
  verificarConfiguracion
);

export default router;
