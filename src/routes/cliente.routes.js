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

// Todas las rutas requieren autenticaciÃƒÂ³n y rol cliente
router.use(authMiddleware, roleMiddleware('cliente'));

// =====================================================
// PERFIL DEL CLIENTE
// =====================================================
// GET /clientes/mi-perfil - Obtener perfil del cliente autenticado
router.get('/mi-perfil', getMiPerfil);

// =====================================================
// REPORTES DEL CLIENTE
// =====================================================
// GET /clientes/mis-reportes - Obtener reportes del cliente autenticado
// Query params: incluir_eliminados
router.get('/mis-reportes', getMisReportes);

// GET /clientes/reportes/:uuid - Ver reporte especÃƒÂ­fico
router.get('/reportes/:uuid', getReporteByUuid);

// PATCH /clientes/reportes/:uuid/conformidad - Aprobar o rechazar reporte
// Body: { cliente_conforme: 'conforme' | 'no_conforme', aprobado_por: 'Nombre' }
router.patch('/reportes/:uuid/conformidad', updateConformidad);

export default router;