import { Router } from 'express';
import {
  getMisReportes,
  getReporteByUuid,
  updateConformidad,
  getMiPerfil
} from '../controllers/cliente.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';

const router = Router();

router.use(authMiddleware, roleMiddleware('cliente'));

router.get('/mi-perfil', getMiPerfil);

router.get('/mis-reportes', getMisReportes);

router.get('/reportes/:uuid', getReporteByUuid);

router.patch('/reportes/:uuid/conformidad', updateConformidad);

export default router;