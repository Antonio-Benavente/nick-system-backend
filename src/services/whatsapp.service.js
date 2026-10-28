import crypto from 'node:crypto';
import { enmascararTelefono } from './bitacora.service.js';

const GRAPH = 'https://graph.facebook.com';

// v26.0+ soporta enviar mensajes a BSUIDs (usuarios con username) vía `recipient`.
const version = () => process.env.WHATSAPP_GRAPH_VERSION || 'v26.0';

export const estaConfigurado = () =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

// Los Business-scoped User IDs de Meta (usuarios que adoptaron username) viajan
// con el formato PAIS.lo-que-sea (por ejemplo PE.16899...). En la Messages API
// se envían como `recipient`; el teléfono se sigue mandando como `to`.
const esBSUID = (destino) =>
  /^[A-Z]{2}(\.ENT)?\.[A-Za-z0-9]+$/.test(String(destino || '').trim());

export const enviarMensajeTexto = async (destino, cuerpo) => {
  if (!estaConfigurado()) {
    const motivo = 'WhatsApp no configurado (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)';
    console.error(`No se pudo enviar un mensaje a ${enmascararTelefono(destino)}: ${motivo}`);
    return { success: false, error: motivo };
  }

  try {
    const respuesta = await fetch(
      `${GRAPH}/${version()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          ...(esBSUID(destino) ? { recipient: destino } : { to: destino }),
          type: 'text',
          text: { body: cuerpo, preview_url: false }
        })
      }
    );

    const datos = await respuesta.json().catch(() => null);

    if (!respuesta.ok) {
      const motivo = datos?.error?.message || `HTTP ${respuesta.status}`;
      console.error(`Meta rechazó el mensaje a ${enmascararTelefono(destino)} (HTTP ${respuesta.status}): ${motivo}`);
      return {
        success: false,
        error: motivo
      };
    }

    return { success: true, messageId: datos?.messages?.[0]?.id };
  } catch (error) {
    console.error(`No se pudo enviar el mensaje a ${enmascararTelefono(destino)}:`, error.message);
    return { success: false, error: error.message || 'Error desconocido' };
  }
};

/**
 * Botón oficial REQUEST_CONTACT_INFO de Meta: en un chat sin teléfono (BSUID)
 * pide al usuario compartir su número. Cuando toca el botón, Meta entrega un
 * webhook `contacts` con el teléfono de quien escribió.
 */
export const enviarSolicitudContacto = async (destino, texto) => {
  if (!estaConfigurado()) {
    const motivo = 'WhatsApp no configurado (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)';
    console.error(`No se pudo pedir el número a ${enmascararTelefono(destino)}: ${motivo}`);
    return { success: false, error: motivo };
  }

  try {
    const respuesta = await fetch(
      `${GRAPH}/${version()}/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          recipient_type: 'individual',
          recipient: destino,
          type: 'interactive',
          interactive: {
            type: 'request_contact_info',
            body: { text: texto }
          }
        })
      }
    );

    const datos = await respuesta.json().catch(() => null);

    if (!respuesta.ok) {
      const motivo = datos?.error?.message || `HTTP ${respuesta.status}`;
      console.error(`Meta rechazó la solicitud de número a ${enmascararTelefono(destino)} (HTTP ${respuesta.status}): ${motivo}`);
      return { success: false, error: motivo };
    }

    return { success: true, messageId: datos?.messages?.[0]?.id };
  } catch (error) {
    console.error(`No se pudo pedir el número a ${enmascararTelefono(destino)}:`, error.message);
    return { success: false, error: error.message || 'Error desconocido' };
  }
};

export const verificarFirmaMeta = (payload, firma, secret) => {
  if (!secret || typeof firma !== 'string' || !firma.startsWith('sha256=')) return false;

  const esperada = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  const recibida = firma.slice('sha256='.length);

  const bufferEsperada = Buffer.from(esperada, 'utf8');
  const bufferRecibida = Buffer.from(recibida, 'utf8');
  if (bufferEsperada.length !== bufferRecibida.length) return false;

  return crypto.timingSafeEqual(bufferEsperada, bufferRecibida);
};
