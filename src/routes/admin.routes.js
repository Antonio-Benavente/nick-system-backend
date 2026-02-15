import { Router } from 'express';
import {
  // Dashboard y EstadÃƒÂ­sticas
  getDashboardStats,
  getReportesMesActual,
  getReportesPorCategoria,
  
  // Reportes
  getReportes,
  getReporteByUuid,
  
  // TÃƒÂ©cnicos
  getTecnicos,
  getTecnicoByUuid,
  createTecnico,
  updateTecnico,
  deleteTecnico,
  restaurarTecnico
} from '../controllers/admin.controller.js';
import {
  // Clientes
  getClientes,
  getClienteByUuid,
  createCliente,
  updateCliente,
  deleteCliente,
  restaurarCliente
} from '../controllers/clientes.controller.js';

import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';

const router = Router();

// Todas las rutas requieren autenticaciÃƒÂ³n y rol admin
router.use(authMiddleware, roleMiddleware('admin'));

// =====================================================
// DASHBOARD Y ESTADÃƒÂSTICAS
// =====================================================
// GET /admin/dashboard - EstadÃƒÂ­sticas generales
router.get('/dashboard', getDashboardStats);

// GET /admin/reportes/mes-actual - Reportes del mes actual
router.get('/reportes/mes-actual', getReportesMesActual);

// GET /admin/reportes/por-categoria - Reportes agrupados por categorÃƒÂ­a
router.get('/reportes/por-categoria', getReportesPorCategoria);

// =====================================================
// GESTIÃƒâ€œN DE REPORTES
// =====================================================
// GET /admin/reportes - Listar todos los reportes con filtros
// Query params: incluir_eliminados, tecnico_nombre, tecnico_uuid, cliente_nombre, 
//               cliente_uuid, categoria, modalidad, cliente_conforme, fecha_desde, fecha_hasta
router.get('/reportes', getReportes);

// GET /admin/reportes/:uuid - Ver reporte especÃƒÂ­fico
router.get('/reportes/:uuid', getReporteByUuid);

// =====================================================
// CRUD TÃƒâ€°CNICOS
// =====================================================
// GET /admin/tecnicos - Listar tÃƒÂ©cnicos
router.get('/tecnicos', getTecnicos);

// GET /admin/tecnicos/:uuid - Ver tÃƒÂ©cnico especÃƒÂ­fico
router.get('/tecnicos/:uuid', getTecnicoByUuid);

// POST /admin/tecnicos - Crear nuevo tÃƒÂ©cnico (con usuario)
router.post('/tecnicos', createTecnico);

// PUT /admin/tecnicos/:uuid - Actualizar tÃƒÂ©cnico
router.put('/tecnicos/:uuid', updateTecnico);

// DELETE /admin/tecnicos/:uuid - Inactivar tÃƒÂ©cnico (soft delete)
router.delete('/tecnicos/:uuid', deleteTecnico);

// PATCH /admin/tecnicos/:uuid/restaurar - Restaurar tÃƒÂ©cnico inactivo
router.patch('/tecnicos/:uuid/restaurar', restaurarTecnico);


// =====================================================
// CRUD CLIENTES
// =====================================================
// GET /admin/clientes - Listar clientes
router.get('/clientes', getClientes);

// GET /admin/clientes/:uuid - Ver cliente especÃƒÂ­fico
router.get('/clientes/:uuid', getClienteByUuid);

// POST /admin/clientes - Crear nuevo cliente
router.post('/clientes', createCliente );

// PUT /admin/clientes/:uuid - Actualizar cliente
router.put('/clientes/:uuid', updateCliente);

// DELETE /admin/clientes/:uuid - Inactivar cliente (soft delete)
router.delete('/clientes/:uuid', deleteCliente);

// PATCH /admin/clientes/:uuid/restaurar - Restaurar cliente inactivo
router.patch('/clientes/:uuid/restaurar', restaurarCliente);

export default router;