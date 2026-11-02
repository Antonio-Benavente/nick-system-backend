import { Router } from 'express';
import {
  getMiPerfil,
  getMisReportes,
  getReporteByUuid,
  updateConformidad
} from '../controllers/cliente.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';
import { asyncHandler } from '../middlewares/async.middleware.js';
import { limitadorPorRol } from '../middlewares/limitePorRol.middleware.js';

const router = Router();

router.use(authMiddleware, roleMiddleware('cliente'), limitadorPorRol);

router.get('/mi-perfil', asyncHandler(getMiPerfil));

router.get('/mis-reportes', asyncHandler(getMisReportes));

router.get('/reportes/:uuid', asyncHandler(getReporteByUuid));

router.patch('/reportes/:uuid/conformidad', asyncHandler(updateConformidad));

export default router;
