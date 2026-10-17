import { verificarFirmaSvix } from '../services/svix.service.js';
import { obtenerCorreoRecibido } from '../services/resendInbound.service.js';
import { ingestarCorreo, ingestarWhatsapp } from '../services/ticketIngesta.service.js';
import { verificarFirmaMeta } from '../services/whatsapp.service.js';
import { bitacora, enmascararEmail, enmascararTelefono } from '../services/bitacora.service.js';
import { responderError } from '../middlewares/error.middleware.js';

const esProduccion = () => process.env.NODE_ENV === 'production';

const cuerpoCrudo = (req) => (req.rawBody ? req.rawBody.toString('utf8') : '');

const clasificar = (resultado) => {
  if (resultado.creado) return 'ticket_creado';
  if (resultado.duplicado) return 'duplicado';
  if (resultado.ignorado) return 'ignorado';
  if (resultado.esperando_datos) return 'esperando_datos';
  return 'sin_ticket';
};

export const recibirCorreoResend = async (req, res) => {
  const secreto = process.env.RESEND_WEBHOOK_SECRET;

  if (!secreto) {
    if (esProduccion()) {
      bitacora('webhook.correo', 'RECHAZADO', { motivo: 'RESEND_WEBHOOK_SECRET no configurada', estado: 503 });
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
    bitacora('webhook.correo', 'RECHAZADO', {
      motivo: 'firma Svix inválida',
      svixId: req.get('svix-id'),
      estado: 400
    });
    return res.status(400).json({ message: 'Firma inválida' });
  }

  const evento = req.body;
  const tipoEvento = evento?.type || 'desconocido';
  const emailId = evento?.data?.email_id || null;

  bitacora('webhook.correo', 'evento recibido', {
    tipo: tipoEvento,
    emailId,
    svixId: req.get('svix-id')
  });

  if (!evento || evento.type !== 'email.received' || !evento.data || !evento.data.email_id) {
    bitacora('webhook.correo', 'IGNORADO', { motivo: 'evento que no es email.received', tipo: tipoEvento });
    return res.json({ recibido: false });
  }

  try {
    const correo = await obtenerCorreoRecibido(emailId);
    const resultado = await ingestarCorreo({ ...correo, id: emailId });

    bitacora('webhook.correo', 'procesado', {
      emailId,
      remitente: enmascararEmail(correo.from),
      resultado: clasificar(resultado)
    });

    return res.json({ recibido: true });
  } catch (error) {
    console.error('Error procesando correo entrante:', error);
    bitacora('webhook.correo', 'ERROR', { emailId, mensaje: error.message });
    return responderError(error, res, 'Error procesando el correo');
  }
};

export const verificarWhatsapp = (req, res) => {
  const modo = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const reto = req.query['hub.challenge'];
  const esperado = process.env.WHATSAPP_VERIFY_TOKEN;

  if (modo === 'subscribe' && esperado && token === esperado) {
    bitacora('webhook.whatsapp', 'verificación de Meta respondida', { estado: 200 });
    return res.status(200).send(reto);
  }

  bitacora('webhook.whatsapp', 'verificación rechazada', {
    modo: modo || 'sin modo',
    motivo: !esperado ? 'WHATSAPP_VERIFY_TOKEN no configurado' : 'token incorrecto',
    estado: 403
  });

  return res.sendStatus(403);
};

export const recibirWhatsapp = async (req, res) => {
  const secreto = process.env.WHATSAPP_APP_SECRET;
  const firma = req.get('x-hub-signature-256');
  const crudo = cuerpoCrudo(req);

  bitacora('webhook.whatsapp', 'petición recibida', {
    metodo: req.method,
    contentType: req.get('content-type'),
    firmaPresente: Boolean(firma),
    largoFirma: firma ? firma.length : 0,
    largoCuerpo: crudo.length,
    userAgent: req.get('user-agent')
  });

  if (!secreto) {
    if (esProduccion()) {
      bitacora('webhook.whatsapp', 'RECHAZADO', { motivo: 'WHATSAPP_APP_SECRET no configurada', estado: 503 });
      return res.status(503).json({ message: 'Webhook no configurado' });
    }
    console.warn('WHATSAPP_APP_SECRET no configurada: se omite la verificación (solo desarrollo)');
  } else if (!verificarFirmaMeta(crudo, firma, secreto)) {
    bitacora('webhook.whatsapp', 'RECHAZADO', {
      motivo: 'firma x-hub-signature-256 inválida',
      firmaPresente: Boolean(firma),
      largoFirma: firma ? firma.length : 0,
      largoCuerpo: crudo.length,
      estado: 400
    });
    return res.sendStatus(400);
  }

  try {
    const entradas = req.body?.entry || [];
    let procesados = 0;

    for (const entrada of entradas) {
      for (const cambio of entrada.changes || []) {
        const valor = cambio.value || {};
        const contacto = (valor.contacts || [])[0];

        if (valor.statuses?.length) {
          bitacora('webhook.whatsapp', 'estados de entrega', {
            cantidad: valor.statuses.length,
            detalle: valor.statuses.map((s) => `${s.status}/${s.id || 'sin id'}`).join(', ')
          });
        }

        for (const mensaje of valor.messages || []) {
          procesados += 1;
          bitacora('webhook.whatsapp', 'mensaje entrante', {
            id: mensaje.id,
            de: enmascararTelefono(mensaje.from || contacto?.wa_id),
            tipo: mensaje.type
          });

          const resultado = await ingestarWhatsapp(mensaje, contacto);

          bitacora('webhook.whatsapp', 'mensaje procesado', {
            id: mensaje.id,
            resultado: clasificar(resultado),
            codigo: resultado.codigo
          });
        }
      }
    }

    bitacora('webhook.whatsapp', 'payload procesado', { mensajes: procesados });

    return res.json({ recibido: true });
  } catch (error) {
    console.error('Error procesando WhatsApp entrante:', error);
    bitacora('webhook.whatsapp', 'ERROR', { mensaje: error.message });
    return responderError(error, res, 'Error procesando el mensaje');
  }
};
