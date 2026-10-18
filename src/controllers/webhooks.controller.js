import { verificarFirmaSvix } from '../services/svix.service.js';
import { obtenerCorreoRecibido } from '../services/resendInbound.service.js';
import { ingestarCorreo, ingestarWhatsapp } from '../services/ticketIngesta.service.js';
import { verificarFirmaMeta } from '../services/whatsapp.service.js';
import { exigirBaseDeDatos } from '../services/health.service.js';
import { responderError } from '../middlewares/error.middleware.js';

const esProduccion = () => process.env.NODE_ENV === 'production';

const cuerpoCrudo = (req) => (req.rawBody ? req.rawBody.toString('utf8') : '');

const healthPrevio = async (canal, res) => {
  const { sano, motivo } = await exigirBaseDeDatos(canal);

  if (sano) return true;

  res.status(503).json({ message: 'Base de datos no disponible', detalle: motivo });
  return false;
};

export const recibirCorreoResend = async (req, res) => {
  const secreto = process.env.RESEND_WEBHOOK_SECRET;

  if (!secreto) {
    if (esProduccion()) {
      console.error('Webhook de correo rechazado: RESEND_WEBHOOK_SECRET no configurada');
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
    console.error('Webhook de correo rechazado: firma Svix inválida');
    return res.status(400).json({ message: 'Firma inválida' });
  }

  if (!(await healthPrevio('el webhook de correo', res))) return;

  const evento = req.body;
  const emailId = evento?.data?.email_id || null;

  if (!evento || evento.type !== 'email.received' || !emailId) {
    return res.json({ recibido: false });
  }

  try {
    const correo = await obtenerCorreoRecibido(emailId);
    await ingestarCorreo({ ...correo, id: emailId });

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

  console.error(
    `Verificación de Meta rechazada: ${!esperado ? 'WHATSAPP_VERIFY_TOKEN no configurado' : 'token incorrecto'}`
  );

  return res.sendStatus(403);
};

export const recibirWhatsapp = async (req, res) => {
  const secreto = process.env.WHATSAPP_APP_SECRET;

  if (!secreto) {
    if (esProduccion()) {
      console.error('Webhook de WhatsApp rechazado: WHATSAPP_APP_SECRET no configurada');
      return res.status(503).json({ message: 'Webhook no configurado' });
    }
    console.warn('WHATSAPP_APP_SECRET no configurada: se omite la verificación (solo desarrollo)');
  } else if (!verificarFirmaMeta(cuerpoCrudo(req), req.get('x-hub-signature-256'), secreto)) {
    console.error('Webhook de WhatsApp rechazado: firma x-hub-signature-256 inválida');
    return res.sendStatus(400);
  }

  if (!(await healthPrevio('el webhook de WhatsApp', res))) return;

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