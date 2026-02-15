import { Router } from 'express';
import { login } from '../controllers/auth.controller.js';

const router = Router();

// POST /auth/login - Iniciar sesiÃ³n
router.post('/login', login);

export default router;
