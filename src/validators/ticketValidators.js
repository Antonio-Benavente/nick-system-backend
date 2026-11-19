import { ValidationError } from './validators.js';

export const ESTADOS_TICKET = [
  'pendiente',
  'asignado',
  'en_servicio',
  'esperando_cliente',
  'atendido',
  'cancelado'
];
export const MODALIDADES_TICKET = ['presencial', 'remoto'];
export const CANALES_TICKET = ['whatsapp', 'correo'];

export const TICKET_LIMITS = {
  empresa: 150,
  nombre: 100,
  asunto: 150,
  descripcion: 2000,
  ubicacion: 150,
  contactoServicio: 100,
  telefono: 30,
  nota: 1000,
  solucion: 5000,
  aprobador: 100,
  motivo: 500,
  concepto: 150,
  detalle: 255,
  aviso: 200
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

export const validarNuevoTicket = (body = {}) => {
  if (body.canal !== undefined && body.canal !== null && !CANALES_TICKET.includes(body.canal)) {
    throw new ValidationError('canal debe ser "whatsapp" o "correo"', 'canal');
  }

  const canal = body.canal || 'correo';
  const contactoOrigen = texto(body.contacto_origen, 'El contacto de origen', TICKET_LIMITS.empresa, false);

  // Un ticket por WhatsApp sin número no se puede rastrear ni responder.
  if (canal === 'whatsapp' && !contactoOrigen) {
    throw new ValidationError('El número de contacto es requerido cuando el canal es WhatsApp');
  }

  return {
    empresa: texto(body.empresa_solicitante, 'La empresa', TICKET_LIMITS.empresa),
    nombre: texto(body.nombre_solicitante, 'El nombre', TICKET_LIMITS.nombre),
    asunto: texto(body.asunto, 'El asunto', TICKET_LIMITS.asunto),
    descripcion: texto(body.descripcion, 'El problema', TICKET_LIMITS.descripcion),
    ubicacion: texto(body.ubicacion, 'La ubicación', TICKET_LIMITS.ubicacion),
    categoriaId: Number.isInteger(body.categoria_id) ? body.categoria_id : null,
    contactoServicioNombre: texto(
      body.contacto_servicio_nombre,
      'El contacto en sitio',
      TICKET_LIMITS.contactoServicio,
      false
    ),
    contactoServicioTelefono: texto(
      body.contacto_servicio_telefono,
      'El teléfono del contacto en sitio',
      TICKET_LIMITS.telefono,
      false
    ),
    canal,
    contactoOrigen,
    modalidad: MODALIDADES_TICKET.includes(body.modalidad) ? body.modalidad : 'presencial'
  };
};

export const validarModalidad = (body = {}) => {
  if (!MODALIDADES_TICKET.includes(body.modalidad)) {
    throw new ValidationError('modalidad debe ser presencial o remoto');
  }
  return { modalidad: body.modalidad };
};

export const validarAsignacion = (body = {}) => validarUUID(body.tecnico_uuid, 'tecnico_uuid');

export const validarAviso = (body = {}) => ({
  tecnicoUuid: validarUUID(body.tecnico_uuid, 'tecnico_uuid'),
  mensaje: texto(body.mensaje, 'El mensaje del aviso', TICKET_LIMITS.aviso, false)
});

export const validarAtencion = (body = {}) => {
  const nota = texto(body.nota, 'La nota del cierre', TICKET_LIMITS.nota, false);

  if (!nota) {
    throw new ValidationError(
      'Describe qué se hizo para poder cerrar el ticket: el cliente lo lee al confirmar el servicio'
    );
  }

  return {
    nota,
    solucion: texto(body.solucion, 'La solución', TICKET_LIMITS.solucion, false)
  };
};

/** El motivo es obligatorio al cancelar (también lo exige un CHECK en la BD). */
export const validarCancelacion = (body = {}) =>
  texto(body.motivo_cancelacion, 'El motivo de cancelación', TICKET_LIMITS.motivo);

/** Edición de datos del ticket desde el drawer del admin. */
export const validarDatosTicket = (body = {}) => {
  const datos = {
    ubicacion: texto(body.ubicacion, 'La ubicación', TICKET_LIMITS.ubicacion),
    contactoServicioNombre: texto(
      body.contacto_servicio_nombre,
      'El contacto en sitio',
      TICKET_LIMITS.contactoServicio,
      false
    ),
    contactoServicioTelefono: texto(
      body.contacto_servicio_telefono,
      'El teléfono del contacto en sitio',
      TICKET_LIMITS.telefono,
      false
    )
  };

  if (body.categoria_id !== undefined) {
    if (body.categoria_id === null || body.categoria_id === '') {
      datos.categoriaId = null;
    } else if (Number.isInteger(body.categoria_id)) {
      datos.categoriaId = body.categoria_id;
    } else {
      throw new ValidationError('categoria_id no es válido');
    }
  }

  return datos;
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
  if (query.modalidad) {
    if (!MODALIDADES_TICKET.includes(query.modalidad)) throw new ValidationError('modalidad no es válida');
    filtros.modalidad = query.modalidad;
  }
  for (const campo of ['fecha_desde', 'fecha_hasta', 'cierre_desde', 'cierre_hasta']) {
    if (query[campo]) {
      if (!FECHA_REGEX.test(query[campo])) {
        throw new ValidationError(`${campo} debe tener formato YYYY-MM-DD`);
      }
      filtros[campo] = query[campo];
    }
  }
  return filtros;
};
