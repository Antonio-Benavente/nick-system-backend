import { Router } from 'express';
import {
  getDashboardStats,
  getReportesMesActual,
  getReportesPorCategoria,
  getReportes,
  getReporteByUuid,
  updateReporte
} from '../controllers/admin.controller.js';
import {
  getClaves,
  createClave,
  updateClave,
  deleteClave,
  restaurarClave
} from '../controllers/claves.controller.js';
import { listarAuditoriaClaves } from '../controllers/auditoria.controller.js';
import {
  getTecnicos,
  getTecnicoByUuid,
  createTecnico,
  updateTecnico,
  deleteTecnico,
  restaurarTecnico
} from '../controllers/tecnicos.controller.js';
import {
  asignarAdmin,
  cancelarAdmin,
  crearAdmin,
  detalleAdmin,
  listarAdmin,
  vincularClienteAdmin
} from '../controllers/ticketsController.js';
import { verGastos } from '../controllers/gastos.controller.js';
import {
  getClientes,
  getClienteByUuid,
  createCliente,
  updateCliente,
  deleteCliente,
  restaurarCliente
} from '../controllers/clientes.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';
import { asyncHandler } from '../middlewares/async.middleware.js';

const router = Router();

router.use(authMiddleware, roleMiddleware('admin'));

router.get('/dashboard', asyncHandler(getDashboardStats));

router.get('/reportes/mes-actual', asyncHandler(getReportesMesActual));

router.get('/reportes/por-categoria', asyncHandler(getReportesPorCategoria));

router.get('/claves', asyncHandler(getClaves));

router.post('/claves', asyncHandler(createClave));

router.put('/claves/:id', asyncHandler(updateClave));

router.delete('/claves/:id', asyncHandler(deleteClave));

router.patch('/claves/:id/restaurar', asyncHandler(restaurarClave));

router.get('/claves/auditoria', asyncHandler(listarAuditoriaClaves));

router.get('/reportes', asyncHandler(getReportes));

router.get('/reportes/:uuid', asyncHandler(getReporteByUuid));

router.put('/reportes/:uuid', asyncHandler(updateReporte));

router.get('/tecnicos', asyncHandler(getTecnicos));

router.get('/tecnicos/:uuid', asyncHandler(getTecnicoByUuid));

router.post('/tecnicos', asyncHandler(createTecnico));

router.put('/tecnicos/:uuid', asyncHandler(updateTecnico));

router.delete('/tecnicos/:uuid', asyncHandler(deleteTecnico));

router.patch('/tecnicos/:uuid/restaurar', asyncHandler(restaurarTecnico));

router.get('/clientes', asyncHandler(getClientes));

router.get('/clientes/:uuid', asyncHandler(getClienteByUuid));

router.post('/clientes', asyncHandler(createCliente));

router.put('/clientes/:uuid', asyncHandler(updateCliente));

router.delete('/clientes/:uuid', asyncHandler(deleteCliente));

router.patch('/clientes/:uuid/restaurar', asyncHandler(restaurarCliente));

router.get('/tickets', asyncHandler(listarAdmin));

router.post('/tickets', asyncHandler(crearAdmin));

router.get('/tickets/:uuid', asyncHandler(detalleAdmin));

router.patch('/tickets/:uuid/asignar', asyncHandler(asignarAdmin));

router.patch('/tickets/:uuid/cancelar', asyncHandler(cancelarAdmin));

router.patch('/tickets/:uuid/vincular-cliente', asyncHandler(vincularClienteAdmin));

router.get('/tickets/:uuid/gastos', asyncHandler(verGastos));

export default router;
