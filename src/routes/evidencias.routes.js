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

const router = Router();

router.use(authMiddleware);

router.get('/reporte/:reporte_uuid', getEvidencias);

router.post('/reporte/:reporte_uuid', addEvidencia);

router.post('/reporte/:reporte_uuid/batch', addEvidenciasBatch);

router.put('/:uuid', updateEvidencia);

router.delete('/:uuid', deleteEvidencia);

router.patch('/reporte/:reporte_uuid/reordenar', reordenarEvidencias);

export default router;