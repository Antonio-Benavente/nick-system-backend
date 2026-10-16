import { Router } from 'express';
import {
  getCategorias,
  createCategoria,
  updateCategoria,
  deleteCategoria,
  restaurarCategoria
} from '../controllers/categorias.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import roleMiddleware from '../middlewares/role.middleware.js';
import { asyncHandler } from '../middlewares/async.middleware.js';

const router = Router();

router.use(authMiddleware);

router.get('/', asyncHandler(getCategorias));

router.post('/', roleMiddleware('admin'), asyncHandler(createCategoria));

router.put('/:id', roleMiddleware('admin'), asyncHandler(updateCategoria));

router.delete('/:id', roleMiddleware('admin'), asyncHandler(deleteCategoria));

router.patch('/:id/restaurar', roleMiddleware('admin'), asyncHandler(restaurarCategoria));

export default router;
