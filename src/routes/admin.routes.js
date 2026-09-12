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
import {
  getTecnicos,
  getTecnicoByUuid,
  createTecnico,
  updateTecnico,
  deleteTecnico,
  restaurarTecnico
} from '../controllers/tecnicos.controller.js';
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

const router = Router();

router.use(authMiddleware, roleMiddleware('admin'));

router.get('/dashboard', getDashboardStats);

router.get('/reportes/mes-actual', getReportesMesActual);

router.get('/reportes/por-categoria', getReportesPorCategoria);

router.get('/claves', getClaves);

router.post('/claves', createClave);

router.put('/claves/:id', updateClave);

router.delete('/claves/:id', deleteClave);

router.patch('/claves/:id/restaurar', restaurarClave);

router.get('/reportes', getReportes);

router.get('/reportes/:uuid', getReporteByUuid);

router.put('/reportes/:uuid', updateReporte);

router.get('/tecnicos', getTecnicos);

router.get('/tecnicos/:uuid', getTecnicoByUuid);

router.post('/tecnicos', createTecnico);

router.put('/tecnicos/:uuid', updateTecnico);

router.delete('/tecnicos/:uuid', deleteTecnico);

router.patch('/tecnicos/:uuid/restaurar', restaurarTecnico);

router.get('/clientes', getClientes);

router.get('/clientes/:uuid', getClienteByUuid);

router.post('/clientes', createCliente );

router.put('/clientes/:uuid', updateCliente);

router.delete('/clientes/:uuid', deleteCliente);

router.patch('/clientes/:uuid/restaurar', restaurarCliente);

export default router;