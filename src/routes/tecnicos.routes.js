import { Router } from 'express';
import {
  getMiPerfil,
  getMisReportes,
  getMisEstadisticas,
  createReporte,
  updateReporte,
  reenviarReporte
} from '../controllers/tecnico.controller.js';
import {
  atenderTecnico,
  iniciarTecnico,
  misTickets
} from '../controllers/ticketsController.js';
import { getClientes } from '../controllers/clientes.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';
import { asyncHandler } from '../middlewares/async.middleware.js';

const router = Router();

router.use(authMiddleware, roleMiddleware('tecnico'));

router.get('/mi-perfil', asyncHandler(getMiPerfil));

router.get('/mis-reportes', asyncHandler(getMisReportes));

router.post('/reportes', asyncHandler(createReporte));

router.put('/reportes/:reporteUUID', asyncHandler(updateReporte));

router.post('/reportes/:reporteUUID/reenviar', asyncHandler(reenviarReporte));

router.get('/mis-estadisticas', asyncHandler(getMisEstadisticas));

router.get('/clientes', asyncHandler(getClientes));

router.get('/mis-tickets', asyncHandler(misTickets));

router.patch('/tickets/:uuid/iniciar', asyncHandler(iniciarTecnico));

router.patch('/tickets/:uuid/atender', asyncHandler(atenderTecnico));

export default router;
