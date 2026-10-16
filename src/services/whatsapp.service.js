import crypto from 'node:crypto';

const GRAPH = 'https://graph.facebook.com';

const version = () => process.env.WHATSAPP_GRAPH_VERSION || 'v25.0';

export const estaConfigurado = () =>
  Boolean(process.env.WHATSAPP_TOKEN && process.env.WHATSAPP_PHONE_NUMBER_ID);

export const enviarMensajeTexto = async (destino, cuerpo) => {
  if (!estaConfigurado()) {
    return { success: false, error: 'WhatsApp no configurado (WHATSAPP_TOKEN / WHATSAPP_PHONE_NUMBER_ID)' };
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
          to: destino,
          type: 'text',
          text: { body: cuerpo, preview_url: false }
        })
      }
    );

    const datos = await respuesta.json().catch(() => null);

    if (!respuesta.ok) {
      return {
        success: false,
        error: datos?.error?.message || `HTTP ${respuesta.status}`
      };
    }

    return { success: true, messageId: datos?.messages?.[0]?.id };
  } catch (error) {
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
