import { horaLima } from '../utils/fechas.js';

export { horaLima };

const SIN_DATO = '-';

export const enmascararEmail = (valor) => {
  const texto = String(valor || '').trim();
  if (!texto) return SIN_DATO;

  const arroba = texto.lastIndexOf('@');
  if (arroba <= 0) return '***';

  return `${texto.slice(0, 1)}***@${texto.slice(arroba + 1)}`;
};

export const enmascararTelefono = (valor) => {
  const digitos = String(valor || '').replace(/\D/g, '');
  if (!digitos) return SIN_DATO;
  if (digitos.length < 6) return '***';

  return `${digitos.slice(0, 3)}****${digitos.slice(-4)}`;
};

export const bitacora = (canal, mensaje) => {
  console.log(`[${canal}] ${mensaje}`);
};
