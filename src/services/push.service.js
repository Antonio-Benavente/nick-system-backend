import { config } from '../config/env.js';
import { bitacora } from './bitacora.service.js';
import {
  marcarTokenInvalido,
  tokensDeTecnico
} from './dispositivos.service.js';

const URL_EXPO = 'https://exp.host/--/api/v2/push/send';
const MAXIMO_POR_LOTE = 100;
const TIMEOUT_MS = 8000;

export const construirPayloadAsignacion = ({ token, codigo, ticketUuid }) => ({
  to: token,
  title: 'Nuevo ticket asignado',
  body: `Código ${codigo}`,
  channelId: 'tickets',
  priority: 'high',
  sound: 'default',
  data: { tipo: 'ticket_asignado', ticket_uuid: ticketUuid }
});

export const construirPayloadReasignacion = ({ token, codigo, ticketUuid }) => ({
  to: token,
  title: 'Ticket reasignado',
  body: `Código ${codigo} ya no está a tu cargo`,
  channelId: 'tickets',
  priority: 'high',
  sound: 'default',
  data: { tipo: 'ticket_reasignado', ticket_uuid: ticketUuid }
});

const cabeceras = () => {
  const resultado = {
    'Content-Type': 'application/json',
    Accept: 'application/json'
  };

  if (config.EXPO_ACCESS_TOKEN) {
    resultado.Authorization = `Bearer ${config.EXPO_ACCESS_TOKEN}`;
  }

  return resultado;
};

const revisarTickets = (lote, cuerpo) => {
  if (!Array.isArray(cuerpo?.data)) return;

  cuerpo.data.forEach((ticket, indice) => {
    if (ticket?.status !== 'error') return;

    if (ticket?.details?.error === 'DeviceNotRegistered') {
      const token = lote[indice]?.to;
      if (!token) return;

      marcarTokenInvalido(token)
        .then((filas) => {
          if (filas > 0) {
            bitacora('push', 'Token de push eliminado (DeviceNotRegistered)');
          }
        })
        .catch((error) => {
          bitacora('push', `No se pudo limpiar el token: ${error.message}`);
        });
      return;
    }

    bitacora('push', `Expo rechazó un mensaje: ${ticket?.message || 'sin detalle'}`);
  });
};

export const enviarPush = async (mensajes) => {
  if (config.FF_PUSH !== 'enforce' || !mensajes.length) return 0;

  let enviados = 0;

  for (let inicio = 0; inicio < mensajes.length; inicio += MAXIMO_POR_LOTE) {
    const lote = mensajes.slice(inicio, inicio + MAXIMO_POR_LOTE);

    try {
      const respuesta = await fetch(URL_EXPO, {
        method: 'POST',
        headers: cabeceras(),
        body: JSON.stringify(lote),
        signal: AbortSignal.timeout(TIMEOUT_MS)
      });

      const cuerpo = await respuesta.json().catch(() => null);

      if (!respuesta.ok) {
        bitacora('push', `Envío rechazado por Expo (HTTP ${respuesta.status})`);
        continue;
      }

      revisarTickets(lote, cuerpo);
      enviados += lote.length;
    } catch (error) {
      bitacora('push', `Envío fallido: ${error.message}`);
    }
  }

  return enviados;
};

export const notificarAsignacion = async ({
  ticketUuid,
  codigo,
  tecnicoNuevoUuid,
  tecnicoAnteriorUuid = null
}) => {
  if (config.FF_PUSH !== 'enforce') return { enviados: 0 };

  const reasignado =
    tecnicoAnteriorUuid && tecnicoAnteriorUuid !== tecnicoNuevoUuid
      ? tecnicoAnteriorUuid
      : null;

  let enviados = 0;

  try {
    const tokens = tecnicoNuevoUuid ? await tokensDeTecnico(tecnicoNuevoUuid) : [];
    const mensajes = tokens.map((token) =>
      construirPayloadAsignacion({ token, codigo, ticketUuid })
    );

    enviados += await enviarPush(mensajes);
    bitacora(
      'push',
      `Ticket ${codigo} → técnico ${tecnicoNuevoUuid || '-'}: ${tokens.length} dispositivo(s) notificados.`
    );
  } catch (error) {
    bitacora('push', `No se pudo notificar al técnico nuevo (${codigo}): ${error.message}`);
  }

  if (!reasignado) return { enviados };

  try {
    const tokens = await tokensDeTecnico(reasignado);
    const mensajes = tokens.map((token) =>
      construirPayloadReasignacion({ token, codigo, ticketUuid })
    );

    enviados += await enviarPush(mensajes);
    bitacora(
      'push',
      `Ticket ${codigo} → técnico anterior ${reasignado}: ${tokens.length} dispositivo(s) notificados.`
    );
  } catch (error) {
    bitacora('push', `No se pudo notificar al técnico anterior (${codigo}): ${error.message}`);
  }

  return { enviados };
};
