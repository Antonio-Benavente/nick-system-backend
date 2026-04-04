import { Router } from 'express';
import {
  getMiPerfil,
  getMisReportes,
  getMisEstadisticas,
  createReporte,
  updateReporte
} from '../controllers/tecnicos.controller.js';
import {
  getClientes
} from '../controllers/clientes.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';

const router = Router();

// Todas las rutas requieren autenticación y rol técnico
router.use(authMiddleware, roleMiddleware('tecnico'));

// =====================================================
// PERFIL DEL TÉCNICO
// =====================================================
// GET /tecnicos/mi-perfil - Obtener perfil del técnico autenticado
router.get('/mi-perfil', getMiPerfil);

// =====================================================
// REPORTES DEL TÉCNICO
// =====================================================
// GET /tecnicos/mis-reportes - Obtener reportes del técnico autenticado
// Query params: incluir_eliminados
router.get('/mis-reportes', getMisReportes);

// POST /tecnicos/reportes - Crear nuevo reporte
router.post('/reportes', createReporte);

// PUT /tecnicos/reportes/:reporteUUID - Editar reporte existente
router.put('/reportes/:reporteUUID', updateReporte);

// =====================================================
// ESTADÍSTICAS DEL TÉCNICO
// =====================================================
// GET /tecnicos/mis-estadisticas - Obtener estadísticas del técnico
router.get('/mis-estadisticas', getMisEstadisticas);

// GET /admin/clientes - Listar clientes
router.get('/clientes', getClientes);
export default router;