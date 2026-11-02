import { verificarFirmaSvix } from '../services/svix.service.js';
import { obtenerCorreoRecibido } from '../services/resendInbound.service.js';
import { ingestarCorreo, ingestarWhatsapp } from '../services/ticketIngesta.service.js';
import { verificarFirmaMeta } from '../services/whatsapp.service.js';
import { exigirBaseDeDatos } from '../services/health.service.js';
import { reclamarEvento, marcarFallido, marcarProcesado } from '../services/incomingEvents.service.js';
import { responderError } from '../middlewares/error.middleware.js';
import { esquemaWebhookResend, esquemaWebhookWhatsapp, validarConZod } from '../validators/schemas.js';
import { config } from '../config/env.js';
import { bitacora } from '../services/bitacora.service.js';

const cuerpoCrudo = (req) => (req.rawBody ? req.rawBody.toString('utf8') : '');

const healthPrevio = async (canal, res) => {
  const { sano, motivo } = await exigirBaseDeDatos(canal);

  if (sano) return true;

  res.status(503).json({ message: 'Base de datos no disponible', detalle: motivo });
  return false;
};

export const recibirCorreoResend = async (req, res) => {
  const secreto = config.RESEND_WEBHOOK_SECRET;

  if (!secreto) {
    if (config.ES_PRODUCCION) {
      bitacora('webhooks', 'Correo rechazado: RESEND_WEBHOOK_SECRET no configurada');
      return res.status(503).json({ message: 'Webhook no configurado' });
    }
    bitacora('webhooks', 'RESEND_WEBHOOK_SECRET no configurada: se omite la verificación (desarrollo)');
  } else if (
    !verificarFirmaSvix({
      payload: cuerpoCrudo(req),
      id: req.get('svix-id'),
      timestamp: req.get('svix-timestamp'),
      signature: req.get('svix-signature'),
      secret: secreto
    })
  ) {
    bitacora('webhooks', `Correo rechazado: firma Svix inválida (svix-id ${req.get('svix-id') || '-'})`);
    return res.status(400).json({ message: 'Firma inválida' });
  }

  if (!(await healthPrevio('el webhook de correo', res))) return;

  const evento = validarConZod(esquemaWebhookResend, req.body, {
    modo: config.FF_ZOD_VALIDATION,
    contexto: 'POST /webhooks/resend/email'
  });

  const emailId = evento?.data?.email_id || null;

  if (!evento || evento.type !== 'email.received' || !emailId) {
    return res.json({ recibido: false });
  }

  const eventoId = req.get('svix-id') || emailId;
  const reclamo = await reclamarEvento({
    origen: 'resend',
    eventoId,
    payload: { type: evento.type, email_id: emailId }
  });

  if (!reclamo.procesar) {
    bitacora('webhooks', `Correo ${emailId} omitido: evento ya procesado (${reclamo.motivo})`);
    return res.json({ recibido: true, duplicado: true });
  }

  try {
    const correo = await obtenerCorreoRecibido(emailId);
    await ingestarCorreo({ ...correo, id: emailId });
    await marcarProcesado(reclamo.id);

    return res.json({ recibido: true });
  } catch (error) {
    await marcarFallido(reclamo.id, error);
    console.error('Error procesando correo entrante:', error);
    return responderError(error, res, 'Error procesando el correo');
  }
};

export const verificarWhatsapp = (req, res) => {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const reto = req.query['hub.challenge'];
  const esperado = config.WHATSAPP_VERIFY_TOKEN;

  if (modo === 'subscribe' && esperado && token === esperado) {
    return res.status(200).send(reto);
  }

  bitacora(
    'webhooks',
    `Verificación de Meta rechazada: ${!esperado ? 'WHATSAPP_VERIFY_TOKEN no configurado' : 'token incorrecto'}`
  );

  return res.sendStatus(403);
};

export const recibirWhatsapp = async (req, res) => {
  const secreto = config.WHATSAPP_APP_SECRET;

  if (!secreto) {
    if (config.ES_PRODUCCION) {
      bitacora('webhooks', 'WhatsApp rechazado: WHATSAPP_APP_SECRET no configurada');
      return res.status(503).json({ message: 'Webhook no configurado' });
    }
    bitacora('webhooks', 'WHATSAPP_APP_SECRET no configurada: se omite la verificación (desarrollo)');
  } else if (!verificarFirmaMeta(cuerpoCrudo(req), req.get('x-hub-signature-256'), secreto)) {
    bitacora('webhooks', 'WhatsApp rechazado: firma x-hub-signature-256 inválida');
    return res.sendStatus(400);
  }

  if (!(await healthPrevio('el webhook de WhatsApp', res))) return;

  const cuerpo = validarConZod(esquemaWebhookWhatsapp, req.body, {
    modo: config.FF_ZOD_VALIDATION,
    contexto: 'POST /webhooks/whatsapp'
  });

  try {
    const entradas = cuerpo?.entry || [];

    for (const entrada of entradas) {
      for (const cambio of entrada.changes || []) {
        const valor = cambio.value || {};
        const contacto = (valor.contacts || [])[0];
        const mensajes = valor.messages || [];

        for (const mensaje of mensajes) {
          const eventoId = mensaje.id || null;
          const reclamo = await reclamarEvento({
            origen: 'whatsapp',
            eventoId,
            payload: {
              tipo: mensaje.type || 'desconocido',
              timestamp: mensaje.timestamp || null,
              tiene_texto: Boolean(mensaje.text?.body)
            }
          });

          if (!reclamo.procesar) {
            bitacora(
              'webhooks',
              `Mensaje ${eventoId} omitido: evento ya procesado (${reclamo.motivo})`
            );
            continue;
          }

          try {
            await ingestarWhatsapp(mensaje, contacto);
            await marcarProcesado(reclamo.id);
          } catch (error) {
            await marcarFallido(reclamo.id, error);
            throw error;
          }
        }
      }
    }

    return res.json({ recibido: true });
  } catch (error) {
    console.error('Error procesando WhatsApp entrante:', error);
    return responderError(error, res, 'Error procesando el mensaje');
  }
};
