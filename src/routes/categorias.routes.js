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

const router = Router();

router.use(authMiddleware);

router.get('/', getCategorias);

router.post('/', roleMiddleware('admin'), createCategoria);

router.put('/:id', roleMiddleware('admin'), updateCategoria);

router.delete('/:id', roleMiddleware('admin'), deleteCategoria);

router.patch('/:id/restaurar', roleMiddleware('admin'), restaurarCategoria);

export default router;