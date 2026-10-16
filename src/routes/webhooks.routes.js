import { Router } from 'express';
import {
  recibirCorreoResend,
  recibirWhatsapp,
  verificarWhatsapp
} from '../controllers/webhooks.controller.js';
import { asyncHandler } from '../middlewares/async.middleware.js';

const router = Router();

router.post('/resend/email', asyncHandler(recibirCorreoResend));

router.get('/whatsapp', verificarWhatsapp);

router.post('/whatsapp', asyncHandler(recibirWhatsapp));

export default router;
