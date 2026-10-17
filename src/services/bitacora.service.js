const SIN_DATO = '-';

const FORMATO_LIMA = new Intl.DateTimeFormat('es-PE', {
  timeZone: 'America/Lima',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23'
});

export const horaLima = (fecha = new Date()) => {
  const partes = Object.fromEntries(
    FORMATO_LIMA.formatToParts(fecha).map((parte) => [parte.type, parte.value])
  );

  return `${partes.day}/${partes.month}/${partes.year} - ${partes.hour}:${partes.minute}:${partes.second}`;
};

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