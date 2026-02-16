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

// Todas las rutas requieren autenticación
router.use(authMiddleware);

// =====================================================
// RUTAS DE EVIDENCIAS
// =====================================================

// GET /evidencias/reporte/:reporte_uuid - Obtener evidencias de un reporte
router.get('/reporte/:reporte_uuid', getEvidencias);

// POST /evidencias/reporte/:reporte_uuid - Agregar una evidencia
router.post('/reporte/:reporte_uuid', addEvidencia);

// POST /evidencias/reporte/:reporte_uuid/batch - Agregar múltiples evidencias
router.post('/reporte/:reporte_uuid/batch', addEvidenciasBatch);

// PUT /evidencias/:uuid - Actualizar evidencia
router.put('/:uuid', updateEvidencia);

// DELETE /evidencias/:uuid - Eliminar evidencia
router.delete('/:uuid', deleteEvidencia);

// PATCH /evidencias/reporte/:reporte_uuid/reordenar - Reordenar evidencias
router.patch('/reporte/:reporte_uuid/reordenar', reordenarEvidencias);

export default router;