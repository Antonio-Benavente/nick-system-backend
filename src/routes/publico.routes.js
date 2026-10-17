import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { seguimientoPublico } from '../controllers/ticketsController.js';
import { asyncHandler } from '../middlewares/async.middleware.js';
import { limiteExcedido } from '../middlewares/limite.middleware.js';

const router = Router();

const limitador = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  handler: limiteExcedido('Demasiadas consultas. Intenta de nuevo en unos minutos.')
});

router.get('/tickets/:uuid', limitador, asyncHandler(seguimientoPublico));

export default router;
