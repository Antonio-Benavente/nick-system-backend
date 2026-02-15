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

// Leer categorías - todos los autenticados
router.get('/', authMiddleware, getCategorias);

// Crear categoría - solo admin
router.post('/', authMiddleware, roleMiddleware('admin'), createCategoria);

// Actualizar categoría - solo admin
router.put('/:id', authMiddleware, roleMiddleware('admin'), updateCategoria);

// Eliminar categoría (soft delete) - solo admin
router.delete('/:id', authMiddleware, roleMiddleware('admin'), deleteCategoria);

// Restaurar categoría eliminada - solo admin
router.patch('/:id/restaurar', authMiddleware, roleMiddleware('admin'), restaurarCategoria);

export default router;