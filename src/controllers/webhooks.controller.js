import { verificarFirmaSvix } from '../services/svix.service.js';
import { obtenerCorreoRecibido } from '../services/resendInbound.service.js';
import { ingestarCorreo, ingestarWhatsapp } from '../services/ticketIngesta.service.js';
import { verificarFirmaMeta } from '../services/whatsapp.service.js';
import { responderError } from '../middlewares/error.middleware.js';

const esProduccion = () => process.env.NODE_ENV === 'production';

const cuerpoCrudo = (req) => (req.rawBody ? req.rawBody.toString('utf8') : '');

export const recibirCorreoResend = async (req, res) => {
  const secreto = process.env.RESEND_WEBHOOK_SECRET;

  if (!secreto) {
    if (esProduccion()) {
      return res.status(503).json({ message: 'Webhook no configurado' });
    }
    console.warn('RESEND_WEBHOOK_SECRET no configurada: se omite la verificación (solo desarrollo)');
  } else if (
    !verificarFirmaSvix({
      payload: cuerpoCrudo(req),
      id: req.get('svix-id'),
      timestamp: req.get('svix-timestamp'),
      signature: req.get('svix-signature'),
      secret: secreto
    })
  ) {
    return res.status(400).json({ message: 'Firma inválida' });
  }

  const evento = req.body;
  if (!evento || evento.type !== 'email.received' || !evento.data || !evento.data.email_id) {
    return res.json({ recibido: false });
  }

  try {
    const correo = await obtenerCorreoRecibido(evento.data.email_id);
    await ingestarCorreo({ ...correo, id: evento.data.email_id });
    return res.json({ recibido: true });
  } catch (error) {
    console.error('Error procesando correo entrante:', error);
    return responderError(error, res, 'Error procesando el correo');
  }
};

export const verificarWhatsapp = (req, res) => {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const reto = req.query['hub.challenge'];
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;

  if (modo === 'subscribe' && esperado && token === esperado) {
    return res.status(200).send(reto);
  }

  return res.sendStatus(403);
};

export const recibirWhatsapp = async (req, res) => {
  const secreto = process.env.WHATSAPP_APP_SECRET;

  if (!secreto) {
    if (esProduccion()) {
      return res.status(503).json({ message: 'Webhook no configurado' });
    }
    console.warn('WHATSAPP_APP_SECRET no configurada: se omite la verificación (solo desarrollo)');
  } else if (!verificarFirmaMeta(cuerpoCrudo(req), req.get('x-hub-signature-256'), secreto)) {
    return res.sendStatus(400);
  }

  try {
    const entradas = req.body?.entry || [];

    for (const entrada of entradas) {
      for (const cambio of entrada.changes || []) {
        const valor = cambio.value || {};
        const contacto = (valor.contacts || [])[0];

        for (const mensaje of valor.messages || []) {
          await ingestarWhatsapp(mensaje, contacto);
        }
      }
    }

    return res.json({ recibido: true });
  } catch (error) {
    console.error('Error procesando WhatsApp entrante:', error);
    return responderError(error, res, 'Error procesando el mensaje');
  }
};
