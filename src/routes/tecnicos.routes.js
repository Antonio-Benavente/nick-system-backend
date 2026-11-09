import { Router } from 'express';
import {
  getMiPerfil,
  getMisReportes,
  getMisEstadisticas,
  createReporte,
  updateReporte,
  reenviarReporte
} from '../controllers/tecnico.controller.js';
import {
  atenderTecnico,
  detalleTecnico,
  iniciarServicioTecnico,
  misTickets
} from '../controllers/tickets.tecnico.controller.js';
import {
  eliminarPush,
  registrarPush
} from '../controllers/dispositivos.controller.js';
import {
  agregarGasto,
  borrarGasto,
  editarGasto,
  verGastos
} from '../controllers/gastos.controller.js';
import { getClientes } from '../controllers/clientes.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';
import { asyncHandler } from '../middlewares/async.middleware.js';
import { idempotencia } from '../middlewares/idempotencia.middleware.js';
import { limitadorPorRol } from '../middlewares/limitePorRol.middleware.js';

const router = Router();

router.use(authMiddleware, roleMiddleware('tecnico'), limitadorPorRol);

router.get('/mi-perfil', asyncHandler(getMiPerfil));

router.get('/mis-reportes', asyncHandler(getMisReportes));

router.post('/reportes', idempotencia, asyncHandler(createReporte));

router.put('/reportes/:reporteUUID', asyncHandler(updateReporte));

router.post('/reportes/:reporteUUID/reenviar', asyncHandler(reenviarReporte));

router.get('/mis-estadisticas', asyncHandler(getMisEstadisticas));

router.get('/clientes', asyncHandler(getClientes));

router.get('/mis-tickets', asyncHandler(misTickets));

router.get('/tickets/:uuid', asyncHandler(detalleTecnico));

router.patch('/tickets/:uuid/iniciar-servicio', idempotencia, asyncHandler(iniciarServicioTecnico));

router.patch('/tickets/:uuid/atender', idempotencia, asyncHandler(atenderTecnico));

router.post('/dispositivos/push', asyncHandler(registrarPush));

router.delete('/dispositivos/push', asyncHandler(eliminarPush));

router.get('/tickets/:uuid/gastos', asyncHandler(verGastos));

router.post('/tickets/:uuid/gastos', idempotencia, asyncHandler(agregarGasto));

router.put('/tickets/:uuid/gastos/:gasto_uuid', asyncHandler(editarGasto));

router.delete('/tickets/:uuid/gastos/:gasto_uuid', asyncHandler(borrarGasto));

export default router;
