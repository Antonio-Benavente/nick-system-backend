import crypto from 'node:crypto';
import { config } from '../config/env.js';

const PREFIJO = 'enc:v1:';
const ALGORITMO = 'aes-256-gcm';
const LARGO_IV = 12;
const LARGO_TAG = 16;

export const CAMPOS_CIFRADOS = ['password', 'pc_password', 'anydesk_password'];

let llaveCache;

const parsearLlave = (valor) => {
  if (/^[0-9a-fA-F]{64}$/.test(valor)) return Buffer.from(valor, 'hex');
  if (/^[A-Za-z0-9+/]{43}=$/.test(valor)) return Buffer.from(valor, 'base64');
  return Buffer.from(valor, 'utf8');
};

const llave = () => {
  if (llaveCache) return llaveCache;

  const valor = config.CLAVES_ENCRYPTION_KEY;

  if (!valor) return null;

  const buffer = parsearLlave(valor);

  if (buffer.length !== 32) {
    throw new Error('CLAVES_ENCRYPTION_KEY debe representar exactamente 32 bytes');
  }

  llaveCache = buffer;
  return llaveCache;
};

export const esCifrado = (valor) =>
  typeof valor === 'string' && valor.startsWith(PREFIJO);

export const cifrarClave = (valor) => {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string' || valor.length === 0) return valor;
  if (esCifrado(valor)) return valor;

  const clave = llave();

  if (!clave) {
    if (config.ES_PRODUCCION) {
      throw new Error('CLAVES_ENCRYPTION_KEY no está configurada');
    }

    return valor;
  }

  const iv = crypto.randomBytes(LARGO_IV);
  const cipher = crypto.createCipheriv(ALGORITMO, clave, iv);
  const datos = Buffer.concat([cipher.update(valor, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${PREFIJO}${iv.toString('base64')}:${tag.toString('base64')}:${datos.toString('base64')}`;
};

export const descifrarClave = (valor) => {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string' || !esCifrado(valor)) return valor;

  const clave = llave();

  if (!clave) {
    throw new Error('CLAVES_ENCRYPTION_KEY no está configurada y hay credenciales cifradas');
  }

  const partes = valor.slice(PREFIJO.length).split(':');

  if (partes.length !== 3) {
    throw new Error('Credencial cifrada con formato inválido');
  }

  const [ivBase64, tagBase64, datosBase64] = partes;
  const iv = Buffer.from(ivBase64, 'base64');
  const tag = Buffer.from(tagBase64, 'base64');
  const datos = Buffer.from(datosBase64, 'base64');

  if (iv.length !== LARGO_IV || tag.length !== LARGO_TAG) {
    throw new Error('Credencial cifrada con formato inválido');
  }

  const decipher = crypto.createDecipheriv(ALGORITMO, clave, iv);
  decipher.setAuthTag(tag);

  return Buffer.concat([decipher.update(datos), decipher.final()]).toString('utf8');
};

export const cifrarCamposClave = (datos) => {
  if (!datos) return datos;

  const salida = { ...datos };

  for (const campo of CAMPOS_CIFRADOS) {
    if (salida[campo] !== undefined) salida[campo] = cifrarClave(salida[campo]);
  }

  return salida;
};

export const descifrarFilaClave = (fila) => {
  if (!fila) return fila;

  const salida = { ...fila };

  for (const campo of CAMPOS_CIFRADOS) {
    if (salida[campo] !== undefined) salida[campo] = descifrarClave(salida[campo]);
  }

  return salida;
};
