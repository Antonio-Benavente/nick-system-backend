import pool from '../config/db.js';
import {
  COLUMNAS_TICKET,
  REGEX_CODIGO_TICKET,
  actualizarModalidad,
  aplicarTransicion,
  crearTicket,
  registrarConformidad,
  vincularCliente,
  desvincularCliente
} from '../services/ticketService.js';
import { leerPaginacion, cabeceraPaginacion, contar } from '../services/paginacion.service.js';
import { bitacora } from '../services/bitacora.service.js';
import { notificarAsignacion } from '../services/push.service.js';
import emailService from '../services/email.service.js';
import { urlSeguimiento } from '../services/ticketIngesta.service.js';
import { abortar } from '../middlewares/error.middleware.js';
import { config } from '../config/env.js';
import { formatearFechaHoraLima } from '../utils/fechas.js';
import { esquemaConformidadPublica, esquemaNuevoTicket, validarConZod } from '../validators/schemas.js';
import {
  esUUID,
  validarAsignacion,
  validarAtencion,
  validarConformidad,
  validarFiltros,
  validarModalidad,
  validarNuevoTicket,
  validarVinculo
} from '../validators/ticketValidators.js';

const OFFSET_LIMA = '-05:00';


const ERRORES_TRANSICION = {
  no_existe: [404, 'Ticket no encontrado'],
  estado_invalido: [409, 'El ticket no puede cambiar desde su estado actual'],
  ya_confirmado: [
    409,
    'Ya registraste tu respuesta para este ticket y no se puede modificar desde aquí. Escribe a soporte@nicksystem.com o llama al 992741064 para cambiarlo.'
  ]
};

const responderTransicion = async (res, resultado, uuid, { accion, actor } = {}) => {
  if (resultado !== 'ok') {
    const [codigo, message] = ERRORES_TRANSICION[resultado];
    return res.status(codigo).json({ message });
  }

  const [filas] = await pool.query(
    `SELECT ${COLUMNAS_TICKET} FROM tickets WHERE uuid = ?`,
    [uuid]
  );

  if (accion) {
    const ticket = filas[0];
    bitacora(
      'tickets',
      `Ticket ${ticket?.codigo || uuid} → ${accion}${actor ? ` por ${actor}` : ''}`
    );
  }

  return res.json(filas[0]);
};

export const listarAdmin = async (req, res) => {
  const filtros = validarFiltros(req.query);
  const paginacion = leerPaginacion(req.query);
  const condiciones = [];
  const parametros = [];

  if (filtros.estado) {
    condiciones.push('estado = ?');
    parametros.push(filtros.estado);
  }
  if (filtros.tecnico_uuid) {
    condiciones.push('tecnico_uuid = ?');
    parametros.push(filtros.tecnico_uuid);
  }
  if (filtros.empresa) {
    condiciones.push('empresa_solicitante LIKE ?');
    parametros.push(`%${filtros.empresa}%`);
  }
  if (filtros.modalidad) {
    condiciones.push('modalidad = ?');
    parametros.push(filtros.modalidad);
  }
  if (filtros.cliente_uuid) {
    condiciones.push('cliente_uuid = ?');
    parametros.push(filtros.cliente_uuid);
  }
  if (filtros.sin_cliente === 'true') {
    condiciones.push('cliente_uuid IS NULL');
  }
  if (filtros.fecha_desde) {
    condiciones.push("DATE(CONVERT_TZ(created_at, '+00:00', ?)) >= ?");
    parametros.push(OFFSET_LIMA, filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    condiciones.push("DATE(CONVERT_TZ(created_at, '+00:00', ?)) <= ?");
    parametros.push(OFFSET_LIMA, filtros.fecha_hasta);
  }
  if (filtros.cierre_desde) {
    condiciones.push("fecha_cierre IS NOT NULL AND DATE(CONVERT_TZ(fecha_cierre, '+00:00', ?)) >= ?");
    parametros.push(OFFSET_LIMA, filtros.cierre_desde);
  }
  if (filtros.cierre_hasta) {
    condiciones.push("fecha_cierre IS NOT NULL AND DATE(CONVERT_TZ(fecha_cierre, '+00:00', ?)) <= ?");
    parametros.push(OFFSET_LIMA, filtros.cierre_hasta);
  }

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  if (paginacion.activa) {
    const total = await contar(pool, `SELECT COUNT(*) AS total FROM tickets ${donde}`, parametros);
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  const [filas] = await pool.query(
    `SELECT ${COLUMNAS_TICKET} FROM tickets ${donde} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...parametros, paginacion.limite, paginacion.offset]
  );

  res.json(filas);
};

export const detalleAdmin = async (req, res) => {
  const [filas] = await pool.query(
    `SELECT ${COLUMNAS_TICKET} FROM tickets WHERE uuid = ?`,
    [req.params.uuid]
  );

  if (!filas.length) throw abortar(404, 'Ticket no encontrado');

  res.json(filas[0]);
};

export const crearAdmin = async (req, res) => {
  validarConZod(esquemaNuevoTicket, req.body, {
    modo: config.FF_ZOD_VALIDATION,
    contexto: 'crear ticket admin'
  });

  const datos = validarNuevoTicket(req.body);
  const ticket = await crearTicket({ ...datos, canal: 'manual' });

  bitacora('tickets', `Ticket ${ticket.codigo} creado manualmente por ${req.user?.email || 'admin'}`);

  res.status(201).json(ticket);
};

export const modalidadAdmin = async (req, res) => {
  const { modalidad } = validarModalidad(req.body);

  await actualizarModalidad(req.params.uuid, modalidad);

  const [filas] = await pool.query(
    `SELECT ${COLUMNAS_TICKET} FROM tickets WHERE uuid = ?`,
    [req.params.uuid]
  );

  if (!filas.length) throw abortar(404, 'Ticket no encontrado');

  bitacora(
    'tickets',
    `Ticket ${filas[0].codigo} → modalidad ${modalidad} por ${req.user?.email || 'admin'}`
  );

  res.json(filas[0]);
};

export const asignarAdmin = async (req, res) => {
  const tecnicoUuid = validarAsignacion(req.body);

  const [tecnicos] = await pool.query(
    "SELECT uuid FROM tecnicos WHERE uuid = ? AND estado = 'activo'",
    [tecnicoUuid]
  );

  if (!tecnicos.length) throw abortar(404, 'Técnico no encontrado');

  const [previos] = await pool.query(
    'SELECT codigo, tecnico_uuid FROM tickets WHERE uuid = ?',
    [req.params.uuid]
  );

  if (!previos.length) throw abortar(404, 'Ticket no encontrado');

  const anterior = previos[0].tecnico_uuid || null;
  const resultado = await aplicarTransicion('asignar', req.params.uuid, { tecnicoUuid });

  await responderTransicion(res, resultado, req.params.uuid, {
    accion: 'asignado',
    actor: req.user?.email || 'admin'
  });

  if (resultado !== 'ok') return;

  if (anterior !== tecnicoUuid) {
    notificarAsignacion({
      ticketUuid: req.params.uuid,
      codigo: previos[0].codigo,
      tecnicoNuevoUuid: tecnicoUuid,
      tecnicoAnteriorUuid: anterior
    }).catch((error) => {
      bitacora('push', `No se pudo notificar la asignación: ${error.message}`);
    });
  }
};

export const cancelarAdmin = async (req, res) => {
  await responderTransicion(
    res,
    await aplicarTransicion('cancelar', req.params.uuid),
    req.params.uuid,
    { accion: 'cancelado', actor: req.user?.email || 'admin' }
  );
};

export const vincularClienteAdmin = async (req, res) => {
  const { cliente_uuid: clienteUuid } = validarVinculo(req.body);

  const [ticket] = await pool.query('SELECT uuid, estado FROM tickets WHERE uuid = ?', [
    req.params.uuid
  ]);

  if (!ticket.length) throw abortar(404, 'Ticket no encontrado');

  if (!['pendiente', 'asignado', 'en_servicio'].includes(ticket[0].estado)) {
    throw abortar(409, 'No se puede vincular un ticket cerrado o cancelado');
  }

  if (clienteUuid === null) {
    const desvinculado = await desvincularCliente(req.params.uuid);

    if (!desvinculado) {
      throw abortar(409, 'El ticket no estaba vinculado a ningún cliente');
    }

    bitacora('tickets', `Ticket ${req.params.uuid} desvinculado de su cliente por ${req.user?.email || 'admin'}`);

    return res.json({ message: 'Ticket desvinculado correctamente', cliente_uuid: null });
  }

  const [cliente] = await pool.query(
    "SELECT uuid, nombre, empresa FROM clientes WHERE uuid = ? AND estado = 'activo'",
    [clienteUuid]
  );

  if (!cliente.length) throw abortar(404, 'Cliente no encontrado o inactivo');

  const vinculado = await vincularCliente(req.params.uuid, clienteUuid, req.user.uuid);

  if (!vinculado) {
    throw abortar(409, 'El ticket no puede vincularse desde su estado actual');
  }

  const [filas] = await pool.query(
    `SELECT ${COLUMNAS_TICKET} FROM tickets WHERE uuid = ?`,
    [req.params.uuid]
  );

  bitacora(
    'tickets',
    `Ticket ${filas[0]?.codigo || req.params.uuid} vinculado a ${cliente[0].empresa} por ${req.user?.email || 'admin'}`
  );

  res.json({ ...filas[0], cliente: cliente[0] });
};

export const misTickets = async (req, res) => {
  const tecnico = req.user.tecnico;

  if (!tecnico) throw abortar(404, 'Técnico no encontrado');

  const paginacion = leerPaginacion(req.query);

  if (paginacion.activa) {
    const total = await contar(
      pool,
      'SELECT COUNT(*) AS total FROM tickets WHERE tecnico_uuid = ?',
      [tecnico.uuid]
    );
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  const [filas] = await pool.query(
    `SELECT ${COLUMNAS_TICKET} FROM tickets
     WHERE tecnico_uuid = ?
     ORDER BY FIELD(estado, 'en_servicio', 'asignado', 'pendiente', 'atendido', 'cancelado'), created_at DESC
     LIMIT ? OFFSET ?`,
    [tecnico.uuid, paginacion.limite, paginacion.offset]
  );

  res.json(filas);
};

export const detalleTecnico = async (req, res) => {
  const tecnico = req.user.tecnico;

  if (!tecnico) throw abortar(404, 'Técnico no encontrado');

  const [filas] = await pool.query(
    `SELECT ${COLUMNAS_TICKET} FROM tickets
     WHERE uuid = ? AND tecnico_uuid = ?`,
    [req.params.uuid, tecnico.uuid]
  );

  if (!filas.length) throw abortar(404, 'Ticket no encontrado');

  res.json(filas[0]);
};

export const iniciarServicioTecnico = async (req, res) => {
  const tecnico = req.user.tecnico;

  if (!tecnico) throw abortar(404, 'Técnico no encontrado');

  await responderTransicion(
    res,
    await aplicarTransicion('iniciar_servicio', req.params.uuid, { propietarioUuid: tecnico.uuid }),
    req.params.uuid,
    { accion: 'en servicio', actor: req.user?.email || tecnico.nombre }
  );
};

export const atenderTecnico = async (req, res) => {
  const tecnico = req.user.tecnico;

  if (!tecnico) throw abortar(404, 'Técnico no encontrado');

  const nota = validarAtencion(req.body);

  await responderTransicion(
    res,
    await aplicarTransicion('atender', req.params.uuid, {
      propietarioUuid: tecnico.uuid,
      nota
    }),
    req.params.uuid,
    { accion: 'atendido', actor: req.user?.email || tecnico.nombre }
  );
};

export const seguimientoPublico = async (req, res) => {
  const identificador = String(req.params.uuid || '').trim().toUpperCase();
  const esCodigoTicket = REGEX_CODIGO_TICKET.test(identificador);

  if (!esUUID(identificador) && !esCodigoTicket) {
    throw abortar(404, 'Ticket no encontrado');
  }

  const condicion = esUUID(identificador) ? 'uuid = ?' : 'codigo = ?';

  const [filas] = await pool.query(
    `SELECT uuid, codigo, asunto, estado, cliente_conforme, aprobado_por,
            fecha_conformidad, motivo_no_conforme, created_at, fecha_asignacion,
            fecha_inicio_servicio, fecha_cierre
     FROM tickets WHERE ${condicion}`,
    [identificador]
  );

  if (!filas.length) throw abortar(404, 'Ticket no encontrado');

  const ticket = filas[0];

  res.set('Cache-Control', 'no-store');
  res.json({
    ...ticket,
    created_at_lima: formatearFechaHoraLima(ticket.created_at),
    fecha_asignacion_lima: formatearFechaHoraLima(ticket.fecha_asignacion),
    fecha_inicio_servicio_lima: formatearFechaHoraLima(ticket.fecha_inicio_servicio),
    fecha_cierre_lima: formatearFechaHoraLima(ticket.fecha_cierre),
    fecha_conformidad_lima: formatearFechaHoraLima(ticket.fecha_conformidad)
  });
};

export const registrarConformidadPublico = async (req, res) => {
  if (!esUUID(String(req.params.uuid || '').trim())) {
    throw abortar(404, 'Ticket no encontrado');
  }

  validarConZod(esquemaConformidadPublica, req.body, {
    modo: config.FF_ZOD_VALIDATION,
    contexto: 'conformidad pública'
  });

  const { conforme, aprobadoPor, motivo } = validarConformidad(req.body);

  const resultado = await registrarConformidad(req.params.uuid, { conforme, aprobadoPor, motivo });

  if (resultado !== 'ok') {
    const [codigo, message] = ERRORES_TRANSICION[resultado];
    return res.status(codigo).json({ message });
  }

  const [filas] = await pool.query(
    `SELECT uuid, codigo, empresa_solicitante, nombre_solicitante, asunto,
            cliente_conforme, aprobado_por, motivo_no_conforme, fecha_conformidad
     FROM tickets WHERE uuid = ?`,
    [req.params.uuid]
  );

  const ticket = filas[0];

  bitacora(
    'publico',
    `Ticket ${ticket.codigo} → el cliente lo marcó como ${conforme ? 'conforme' : 'no conforme'}`
  );

  if (!conforme) {
    const aviso = await emailService.enviarAvisoNoConforme({
      codigo: ticket.codigo,
      empresa: ticket.empresa_solicitante,
      nombre: ticket.nombre_solicitante,
      asunto: ticket.asunto,
      motivo,
      url: urlSeguimiento(ticket.uuid)
    });

    if (aviso.omitido) {
      bitacora('publico', `Aviso de no conforme → omitido, TICKET_NOTIFICACION_EMAIL está vacía`);
    } else if (!aviso.success) {
      bitacora('publico', `Aviso de no conforme → no se pudo enviar: ${aviso.error}`);
    }
  }

  res.json(ticket);
};
