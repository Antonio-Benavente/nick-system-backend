import { config } from '../config/env.js';

const zona = () => config.ZONA_HORARIA || 'America/Lima';

const SOLO_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const FECHA_HORA_SIN_ZONA = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2})?)(?:\.\d+)?$/;

const aFecha = (valor) => {
  if (valor === null || valor === undefined || valor === '') return null;

  if (valor instanceof Date) {
    return Number.isNaN(valor.getTime()) ? null : valor;
  }

  if (typeof valor !== 'string') return null;

  const texto = valor.trim();

  if (SOLO_FECHA.test(texto)) return texto;

  const sinZona = texto.match(FECHA_HORA_SIN_ZONA);
  const fecha = new Date(sinZona ? `${sinZona[1]}T${sinZona[2]}Z` : texto);

  return Number.isNaN(fecha.getTime()) ? null : fecha;
};

const formateador = (opciones) =>
  new Intl.DateTimeFormat('es-PE', { timeZone: zona(), hourCycle: 'h23', ...opciones });

const partes = (fecha, opciones) =>
  Object.fromEntries(
    formateador(opciones)
      .formatToParts(fecha)
      .map((parte) => [parte.type, parte.value])
  );

export const formatearFechaLima = (valor) => {
  const fecha = aFecha(valor);

  if (!fecha) return '';

  if (typeof fecha === 'string') {
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio}`;
  }

  const { day, month, year, hour, minute } = partes(fecha, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });

  return `${day}/${month}/${year} ${hour}:${minute}`;
};

export const formatearFechaSoloLima = (valor) => {
  const fecha = aFecha(valor);

  if (!fecha) return '';

  if (typeof fecha === 'string') {
    const [anio, mes, dia] = fecha.split('-');
    return `${dia}/${mes}/${anio}`;
  }

  const { day, month, year } = partes(fecha, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric'
  });

  return `${day}/${month}/${year}`;
};

export const formatearFechaHoraLima = (valor) => {
  const fecha = aFecha(valor);

  if (!fecha) return '';

  if (typeof fecha === 'string') return formatearFechaSoloLima(fecha);

  return formateador({ dateStyle: 'medium', timeStyle: 'short' }).format(fecha);
};

export const horaLima = (fecha = new Date()) => {
  const fechaValida = aFecha(fecha);

  if (!fechaValida || typeof fechaValida === 'string') return '';

  const { day, month, year, hour, minute, second } = partes(fechaValida, {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });

  return `${day}/${month}/${year} - ${hour}:${minute}:${second}`;
};

export const horaDelDiaLima = (fecha = new Date()) => {
  const fechaValida = aFecha(fecha);

  if (!fechaValida || typeof fechaValida === 'string') return null;

  return Number(
    partes(fechaValida, { hour: '2-digit', hour12: false }).hour
  );
};

export const saludoLima = (fecha = new Date()) => {
  const hora = horaDelDiaLima(fecha) ?? 0;

  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

export const zonaHoraria = zona;
