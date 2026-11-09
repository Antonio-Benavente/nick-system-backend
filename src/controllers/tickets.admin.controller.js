import pool from '../config/db.js';
import {
  COLUMNAS_TICKET,
  actualizarModalidad,
  aplicarTransicion,
  crearTicket,
  vincularCliente,
  desvincularCliente
} from '../services/ticketService.js';
import { leerPaginacion, cabeceraPaginacion, contar } from '../services/paginacion.service.js';
import { bitacora } from '../services/bitacora.service.js';
import { notificarAsignacion } from '../services/push.service.js';
import { abortar } from '../middlewares/error.middleware.js';
import { config } from '../config/env.js';
import { esquemaNuevoTicket, validarConZod } from '../validators/schemas.js';
import {
  validarAsignacion,
  validarFiltros,
  validarModalidad,
  validarNuevoTicket,
  validarVinculo
} from '../validators/ticketValidators.js';
import { responderTransicion } from './tickets.comun.js';

const OFFSET_LIMA = '-05:00';

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
