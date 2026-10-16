import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import {
  login,
  miPerfil,
  logout,
  cambiarPassword
} from '../controllers/auth.controller.js';
import authMiddleware from '../middlewares/auth.middleware.js';
import { asyncHandler } from '../middlewares/async.middleware.js';

const router = Router();

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 15,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: {
    message: 'Demasiados intentos de inicio de sesión. Intenta de nuevo más tarde.',
  },
});

const passwordLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: {
    message: 'Demasiados intentos de cambio de contraseña. Intenta de nuevo más tarde.',
  },
});

router.post('/login', loginLimiter, asyncHandler(login));

router.get('/me', authMiddleware, asyncHandler(miPerfil));

router.post('/logout', authMiddleware, asyncHandler(logout));

router.patch('/password', authMiddleware, passwordLimiter, asyncHandler(cambiarPassword));

export default router;
