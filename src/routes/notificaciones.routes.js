import { Router } from 'express';
import {
  enviarNotificacionReporte,
  verificarConfiguracion,
  enviarEmailPrueba
} from '../controllers/notificaciones.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';

const router = Router();

// =====================================================
// RUTAS DE NOTIFICACIONES
// =====================================================

// POST /notificaciones/reporte/:uuid/enviar
// Enviar notificaciÃƒÂ³n de reporte al cliente
// Ã¢ÂÅ’ PDF eliminado (ya no se usa)
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

// POST /notificaciones/prueba
router.post(
  '/prueba',
  authMiddleware,
  roleMiddleware('admin'),
  enviarEmailPrueba
);

export default router;
