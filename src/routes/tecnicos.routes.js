import { Router } from 'express';
import {
  getMiPerfil,
  getMisReportes,
  getMisEstadisticas,
  createReporte
} from '../controllers/tecnicos.controller.js';
import {
  getClientes
} from '../controllers/clientes.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';

const router = Router();

// Todas las rutas requieren autenticaciÃ³n y rol tÃ©cnico
router.use(authMiddleware, roleMiddleware('tecnico'));

// =====================================================
// PERFIL DEL TÃ‰CNICO
// =====================================================
// GET /tecnicos/mi-perfil - Obtener perfil del tÃ©cnico autenticado
router.get('/mi-perfil', getMiPerfil);

// =====================================================
// REPORTES DEL TÃ‰CNICO
// =====================================================
// GET /tecnicos/mis-reportes - Obtener reportes del tÃ©cnico autenticado
// Query params: incluir_eliminados
router.get('/mis-reportes', getMisReportes);

// POST /tecnicos/reportes - Crear nuevo reporte
router.post('/reportes', createReporte);

// =====================================================
// ESTADÃSTICAS DEL TÃ‰CNICO
// =====================================================
// GET /tecnicos/mis-estadisticas - Obtener estadÃ­sticas del tÃ©cnico
router.get('/mis-estadisticas', getMisEstadisticas);

// GET /admin/clientes - Listar clientes
router.get('/clientes', getClientes);
export default router;