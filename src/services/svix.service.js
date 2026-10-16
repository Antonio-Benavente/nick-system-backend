import crypto from 'crypto';

const TOLERANCIA_SEGUNDOS = 5 * 60;

const compararSeguro = (a, b) => {
  const bufferA = Buffer.from(String(a));
  const bufferB = Buffer.from(String(b));
  if (bufferA.length !== bufferB.length) return false;
  return crypto.timingSafeEqual(bufferA, bufferB);
};

export const verificarFirmaSvix = ({ payload, id, timestamp, signature, secret }) => {
  if (!id || !timestamp || !signature || !secret) return false;

  const marcaTiempo = Number(timestamp);
  if (!Number.isFinite(marcaTiempo)) return false;

  const ahora = Math.floor(Date.now() / 1000);
  if (Math.abs(ahora - marcaTiempo) > TOLERANCIA_SEGUNDOS) return false;

  const clave = Buffer.from(secret.startsWith('whsec_') ? secret.slice(6) : secret, 'base64');
  const contenido = `${id}.${timestamp}.${payload}`;
  const esperada = crypto.createHmac('sha256', clave).update(contenido).digest('base64');

  return String(signature)
    .split(' ')
    .map((parte) => parte.split(','))
    .filter(([version]) => version === 'v1')
    .some(([, firma]) => compararSeguro(firma || '', esperada));
};
