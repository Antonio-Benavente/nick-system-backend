import { Router } from 'express';
import {
  getEvidencias,
  addEvidencia,
  addEvidenciasBatch,
  updateEvidencia,
  deleteEvidencia,
  reordenarEvidencias
} from '../controllers/evidencias.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';
import { asyncHandler } from '../middlewares/async.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/reporte/:reporte_uuid', asyncHandler(getEvidencias));

router.post(
  '/reporte/:reporte_uuid',
  roleMiddleware('tecnico', 'admin'),
  asyncHandler(addEvidencia)
);

router.post(
  '/reporte/:reporte_uuid/batch',
  roleMiddleware('tecnico', 'admin'),
  asyncHandler(addEvidenciasBatch)
);

router.put('/:uuid', roleMiddleware('tecnico', 'admin'), asyncHandler(updateEvidencia));

router.delete('/:uuid', roleMiddleware('tecnico', 'admin'), asyncHandler(deleteEvidencia));

router.patch(
  '/reporte/:reporte_uuid/reordenar',
  roleMiddleware('tecnico', 'admin'),
  asyncHandler(reordenarEvidencias)
);

export default router;
