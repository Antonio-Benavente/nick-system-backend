import { ValidationError } from './validators.js';

export const ESTADOS_TICKET = ['pendiente', 'asignado', 'en_servicio', 'atendido', 'cancelado'];

export const TICKET_LIMITS = {
  empresa: 150,
  nombre: 100,
  asunto: 150,
  descripcion: 2000,
  nota: 1000,
  aprobador: 100,
  motivo: 500,
  concepto: 150,
  detalle: 255
};

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const esUUID = (valor) => typeof valor === 'string' && UUID_REGEX.test(valor);

export const validarUUID = (valor, campo = 'uuid') => {
  if (!esUUID(valor)) throw new ValidationError(`${campo} no es válido`);
  return valor;
};

const texto = (valor, campo, max, requerido = true) => {
  const limpio = typeof valor === 'string' ? valor.trim() : '';
  if (!limpio) {
    if (requerido) throw new ValidationError(`${campo} es requerido`);
    return null;
  }
  if (limpio.length > max) {
    throw new ValidationError(`${campo} no puede superar ${max} caracteres`);
  }
  return limpio;
};

export const validarNuevoTicket = (body = {}) => ({
  empresa: texto(body.empresa_solicitante, 'La empresa', TICKET_LIMITS.empresa),
  nombre: texto(body.nombre_solicitante, 'El nombre', TICKET_LIMITS.nombre),
  asunto: texto(body.asunto, 'El asunto', TICKET_LIMITS.asunto),
  descripcion: texto(body.descripcion, 'El problema', TICKET_LIMITS.descripcion)
});

export const validarAsignacion = (body = {}) => validarUUID(body.tecnico_uuid, 'tecnico_uuid');

export const validarAtencion = (body = {}) => {
  const nota = texto(body.nota, 'La nota del cierre', TICKET_LIMITS.nota, false);

  if (!nota) {
    throw new ValidationError(
      'Describe qué se hizo para poder cerrar el ticket: el cliente lo lee al confirmar el servicio'
    );
  }

  return nota;
};

export const validarConformidad = (body = {}) => {
  if (typeof body.conforme !== 'boolean') {
    throw new ValidationError('Debes indicar si el servicio fue conforme o no');
  }

  const motivo = texto(body.motivo, 'El motivo', TICKET_LIMITS.motivo, false);

  if (!body.conforme && !motivo) {
    throw new ValidationError('Cuéntanos qué pasó para que el técnico pueda revisarlo');
  }

  return {
    conforme: body.conforme,
    aprobadoPor: texto(body.aprobado_por, 'Tu nombre', TICKET_LIMITS.aprobador),
    motivo: body.conforme ? null : motivo
  };
};

export const validarGasto = (body = {}) => {
  if (typeof body.monto !== 'number' || !Number.isFinite(body.monto)) {
    throw new ValidationError('El monto no es válido', 'monto');
  }

  if (body.monto < 0 || body.monto > 99999999.99) {
    throw new ValidationError('El monto no es válido', 'monto');
  }

  return {
    concepto: texto(body.concepto, 'El concepto', TICKET_LIMITS.concepto),
    detalle: texto(body.detalle, 'El detalle', TICKET_LIMITS.detalle, false),
    monto: Math.round(body.monto * 100) / 100
  };
};

export const validarVinculo = (body = {}) => {
  const clienteUuid = body.cliente_uuid === null
    ? null
    : validarUUID(body.cliente_uuid, 'cliente_uuid');

  return { cliente_uuid: clienteUuid };
};

export const validarFiltros = (query = {}) => {
  const filtros = {};
  if (query.estado) {
    if (!ESTADOS_TICKET.includes(query.estado)) throw new ValidationError('estado no es válido');
    filtros.estado = query.estado;
  }
  if (query.tecnico_uuid) filtros.tecnico_uuid = validarUUID(query.tecnico_uuid, 'tecnico_uuid');
  if (query.cliente_uuid) filtros.cliente_uuid = validarUUID(query.cliente_uuid, 'cliente_uuid');
  if (query.sin_cliente !== undefined) {
    filtros.sin_cliente = query.sin_cliente === 'true' ? 'true' : 'false';
  }
  if (query.empresa) filtros.empresa = String(query.empresa).trim().slice(0, TICKET_LIMITS.empresa);
  for (const campo of ['fecha_desde', 'fecha_hasta']) {
    if (query[campo]) {
      if (!FECHA_REGEX.test(query[campo])) {
        throw new ValidationError(`${campo} debe tener formato YYYY-MM-DD`);
      }
      filtros[campo] = query[campo];
    }
  }
  return filtros;
};
