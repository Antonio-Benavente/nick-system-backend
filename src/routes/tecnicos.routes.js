import { Router } from 'express';
import {
  getMiPerfil,
  getMisReportes,
  getMisEstadisticas,
  createReporte,
  updateReporte
} from '../controllers/tecnico.controller.js';
import {
  getClientes
} from '../controllers/clientes.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';

const router = Router();

router.use(authMiddleware, roleMiddleware('tecnico'));

router.get('/mi-perfil', getMiPerfil);

router.get('/mis-reportes', getMisReportes);

router.post('/reportes', createReporte);

router.put('/reportes/:reporteUUID', updateReporte);

router.get('/mis-estadisticas', getMisEstadisticas);

router.get('/clientes', getClientes);
export default router;