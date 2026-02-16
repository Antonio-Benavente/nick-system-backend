import { Router } from 'express';
import { login } from '../controllers/auth.controller.js';

const router = Router();

// POST /auth/login - Iniciar sesión
router.post('/login', login);

export default router;
