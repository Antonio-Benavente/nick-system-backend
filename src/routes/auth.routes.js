import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { login } from '../controllers/auth.controller.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: 'Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.',
  },
});

router.post('/login', loginLimiter, login);

export default router;
