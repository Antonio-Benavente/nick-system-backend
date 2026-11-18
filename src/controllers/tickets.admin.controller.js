import {
  actualizarModalidad,
  aplicarTransicion,
  buscarClienteActivoPorUuid,
  buscarTecnicoActivoPorUuid,
  crearTicket,
  desvincularCliente,
  listarTickets,
  obtenerTicketEstado,
  obtenerTicketParaAsignacion,
  obtenerTicketPorUuid,
  vincularCliente
} from '../services/ticketService.js';
import { leerPaginacion, cabeceraPaginacion } from '../services/paginacion.service.js';
import { bitacora } from '../services/bitacora.service.js';
import { notificarAsignacion, notificarAvisoTecnico } from '../services/push.service.js';
import {
  listarAvisosDeTicket,
  registrarAviso
} from '../services/avisos.service.js';
import { abortar } from '../middlewares/error.middleware.js';
import { config } from '../config/env.js';
import { esquemaNuevoTicket, validarConZod } from '../validators/schemas.js';
import {
  validarAsignacion,
  validarAviso,
  validarFiltros,
  validarModalidad,
  validarNuevoTicket,
  validarVinculo
} from '../validators/ticketValidators.js';
import { responderTransicion } from './tickets.comun.js';

export const listarAdmin = async (req, res) => {
  const filtros = validarFiltros(req.query);
  const paginacion = leerPaginacion(req.query);

  const { filas, total } = await listarTickets({ filtros, paginacion });

  if (paginacion.activa) {
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  res.json(filas);
};

export const detalleAdmin = async (req, res) => {
  const ticket = await obtenerTicketPorUuid(req.params.uuid);

  if (!ticket) throw abortar(404, 'Ticket no encontrado');

  res.json(ticket);
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

  const ticket = await obtenerTicketPorUuid(req.params.uuid);

  if (!ticket) throw abortar(404, 'Ticket no encontrado');

  bitacora(
    'tickets',
    `Ticket ${ticket.codigo} → modalidad ${modalidad} por ${req.user?.email || 'admin'}`
  );

  res.json(ticket);
};

export const asignarAdmin = async (req, res) => {
  const tecnicoUuid = validarAsignacion(req.body);

  const tecnico = await buscarTecnicoActivoPorUuid(tecnicoUuid);

  if (!tecnico) throw abortar(404, 'Técnico no encontrado');

  const previos = await obtenerTicketParaAsignacion(req.params.uuid);

  if (!previos) throw abortar(404, 'Ticket no encontrado');

  const anterior = previos.tecnico_uuid || null;
  const resultado = await aplicarTransicion('asignar', req.params.uuid, { tecnicoUuid });

  await responderTransicion(res, resultado, req.params.uuid, {
    accion: 'asignado',
    actor: req.user?.email || 'admin'
  });

  if (resultado !== 'ok') return;

  if (anterior !== tecnicoUuid) {
    notificarAsignacion({
      ticketUuid: req.params.uuid,
      codigo: previos.codigo,
      tecnicoNuevoUuid: tecnicoUuid,
      tecnicoAnteriorUuid: anterior
    }).catch((error) => {
      bitacora('push', `No se pudo notificar la asignación: ${error.message}`);
    });
  }
};

export const avisarTecnicoAdmin = async (req, res) => {
  const { tecnicoUuid, mensaje } = validarAviso(req.body);

  const tecnico = await buscarTecnicoActivoPorUuid(tecnicoUuid);

  if (!tecnico) throw abortar(404, 'Técnico no encontrado');

  const ticket = await obtenerTicketPorUuid(req.params.uuid);

  if (!ticket) throw abortar(404, 'Ticket no encontrado');

  if (ticket.estado === 'cancelado') {
    throw abortar(409, 'No se puede avisar sobre un ticket cancelado');
  }

  await registrarAviso({
    ticketUuid: ticket.uuid,
    tecnicoUuid,
    mensaje,
    avisadoPor: req.user?.email || 'admin'
  });

  const { enviados, dispositivos, pushActivo } = await notificarAvisoTecnico({
    ticketUuid: ticket.uuid,
    codigo: ticket.codigo,
    asunto: ticket.asunto,
    tecnicoUuid,
    mensaje
  });

  bitacora(
    'push',
    `Aviso del ticket ${ticket.codigo} al técnico ${tecnicoUuid} por ${req.user?.email || 'admin'}: ${dispositivos} dispositivo(s), push ${pushActivo ? 'activo' : 'inactivo'}`
  );

  res.json({
    message: 'Aviso registrado. El técnico podrá ver el ticket y aceptarlo desde su app',
    enviados,
    dispositivos,
    push_activo: pushActivo,
    ticket_uuid: ticket.uuid
  });
};

export const listarAvisosTicketAdmin = async (req, res) => {
  const ticket = await obtenerTicketPorUuid(req.params.uuid);

  if (!ticket) throw abortar(404, 'Ticket no encontrado');

  res.json(await listarAvisosDeTicket(req.params.uuid));
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

  const ticket = await obtenerTicketEstado(req.params.uuid);

  if (!ticket) throw abortar(404, 'Ticket no encontrado');

  if (!['pendiente', 'asignado', 'en_servicio'].includes(ticket.estado)) {
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

  const cliente = await buscarClienteActivoPorUuid(clienteUuid);

  if (!cliente) throw abortar(404, 'Cliente no encontrado o inactivo');

  const vinculado = await vincularCliente(req.params.uuid, clienteUuid, req.user.uuid);

  if (!vinculado) {
    throw abortar(409, 'El ticket no puede vincularse desde su estado actual');
  }

  const filas = await obtenerTicketPorUuid(req.params.uuid);

  bitacora(
    'tickets',
    `Ticket ${filas?.codigo || req.params.uuid} vinculado a ${cliente.empresa} por ${req.user?.email || 'admin'}`
  );

  res.json({ ...filas, cliente });
};
