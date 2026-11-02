import { config } from '../config/env.js';
import { ValidationError } from '../validators/validators.js';

const TIMEOUT_MS = 6000;
const CONCURRENCIA = 5;

const TIPOS_PERMITIDOS = {
  imagen: [/^image\//i],
  video: [/^video\//i],
  documento: [
    /^application\/pdf$/i,
    /^application\/msword$/i,
    /^application\/vnd\.openxmlformats-officedocument\./i,
    /^application\/vnd\.ms-/i,
    /^application\/rtf$/i,
    /^text\/plain$/i,
    /^image\//i
  ]
};

const contenidoPermitido = (tipo, contentType) => {
  const patrones = TIPOS_PERMITIDOS[tipo] || TIPOS_PERMITIDOS.documento;
  return patrones.some((patron) => patron.test(contentType));
};

const validarUrl = (url, campo) => {
  let destino;

  try {
    destino = new URL(url);
  } catch {
    throw new ValidationError('La URL de la evidencia no es válida', campo);
  }

  if (!['http:', 'https:'].includes(destino.protocol)) {
    throw new ValidationError('La URL de la evidencia debe usar http o https', campo);
  }

  const hosts = config.EVIDENCIAS_HOSTS_LISTA;

  if (hosts.length && !hosts.includes(destino.hostname.toLowerCase())) {
    throw new ValidationError(
      `El host de la evidencia no está permitido (${destino.hostname})`,
      campo
    );
  }

  return destino;
};

const comprobarRemota = async (evidencia, indice) => {
  const campo = `evidencias[${indice}].url`;
  const destino = validarUrl(evidencia.url, campo);
  const tipo = evidencia.tipo || 'imagen';

  let respuesta;

  try {
    respuesta = await fetch(destino, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS)
    });
  } catch (error) {
    console.warn(
      `No se pudo comprobar la evidencia ${evidencia.url}: ${error.message}`
    );
    return;
  }

  if (!respuesta.ok) {
    console.warn(
      `La evidencia ${evidencia.url} respondió ${respuesta.status}; se guarda sin comprobar el contenido`
    );
    return;
  }

  const contentType = String(respuesta.headers.get('content-type') || '').split(';')[0].trim();
  const largo = Number(respuesta.headers.get('content-length'));

  if (contentType && !contenidoPermitido(tipo, contentType)) {
    throw new ValidationError(
      `El archivo no corresponde al tipo ${tipo} (${contentType})`,
      campo
    );
  }

  if (Number.isFinite(largo) && largo > config.EVIDENCIAS_MAX_MB * 1024 * 1024) {
    throw new ValidationError(
      `La evidencia supera el máximo de ${config.EVIDENCIAS_MAX_MB} MB`,
      campo
    );
  }
};

export const validarEvidenciasRemotas = async (evidencias = []) => {
  if (!Array.isArray(evidencias) || evidencias.length === 0) return;

  const pendientes = evidencias
    .map((evidencia, indice) => ({ evidencia, indice }))
    .filter(({ evidencia }) => evidencia?.url);

  for (let inicio = 0; inicio < pendientes.length; inicio += CONCURRENCIA) {
    const lote = pendientes.slice(inicio, inicio + CONCURRENCIA);
    await Promise.all(lote.map(({ evidencia, indice }) => comprobarRemota(evidencia, indice)));
  }
};

export default validarEvidenciasRemotas;
