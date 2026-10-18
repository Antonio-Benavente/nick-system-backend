import pool from '../config/db.js';
import {
  COLUMNAS_TICKET,
  REGEX_CODIGO_TICKET,
  aplicarTransicion,
  crearTicket,
  registrarConformidad,
  vincularCliente,
  desvincularCliente
} from '../services/ticketService.js';
import { leerPaginacion, cabeceraPaginacion, contar } from '../services/paginacion.service.js';
import { bitacora } from '../services/bitacora.service.js';
import emailService from '../services/email.service.js';
import { urlSeguimiento } from '../services/ticketIngesta.service.js';
import { abortar } from '../middlewares/error.middleware.js';
import {
  esUUID,
  validarAsignacion,
  validarAtencion,
  validarConformidad,
  validarFiltros,
  validarNuevoTicket,
  validarVinculo
} from '../validators/ticketValidators.js';

const ERRORES_TRANSICION = {
  no_existe: [404, 'Ticket no encontrado'],
  estado_invalido: [409, 'El ticket no puede cambiar desde su estado actual'],
  ya_confirmado: [
    409,
    'Ya registraste tu respuesta para este ticket y no se puede modificar desde aquí. Escribe a soporte@nicksystem.com o llama al 992741064 para cambiarlo.'
  ]
};

const responderTransicion = async (res, resultado, uuid) => {
  if (resultado !== 'ok') {
    const [codigo, message] = ERRORES_TRANSICION[resultado];
    return res.status(codigo).json({ message });
  }

  const [filas] = await pool.query(
    `SELECT ${COLUMNAS_TICKET} FROM tickets WHERE uuid = ?`,
    [uuid]
  );

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
  if (filtros.cliente_uuid) {
    condiciones.push('cliente_uuid = ?');
    parametros.push(filtros.cliente_uuid);
  }
  if (filtros.sin_cliente === 'true') {
    condiciones.push('cliente_uuid IS NULL');
  }
  if (filtros.fecha_desde) {
    condiciones.push('DATE(created_at) >= ?');
    parametros.push(filtros.fecha_desde);
  }
  if (filtros.fecha_hasta) {
    condiciones.push('DATE(created_at) <= ?');
    parametros.push(filtros.fecha_hasta);
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
  const datos = validarNuevoTicket(req.body);

  res.status(201).json(await crearTicket({ ...datos, canal: 'manual' }));
};

export const asignarAdmin = async (req, res) => {
  const tecnicoUuid = validarAsignacion(req.body);

  const [tecnicos] = await pool.query(
    "SELECT uuid FROM tecnicos WHERE uuid = ? AND estado = 'activo'",
    [tecnicoUuid]
  );

  if (!tecnicos.length) throw abortar(404, 'Técnico no encontrado');

  await responderTransicion(
    res,
    await aplicarTransicion('asignar', req.params.uuid, { tecnicoUuid }),
    req.params.uuid
  );
};

export const cancelarAdmin = async (req, res) => {
  await responderTransicion(
    res,
    await aplicarTransicion('cancelar', req.params.uuid),
    req.params.uuid
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

export const iniciarServicioTecnico = async (req, res) => {
  const tecnico = req.user.tecnico;

  if (!tecnico) throw abortar(404, 'Técnico no encontrado');

  await responderTransicion(
    res,
    await aplicarTransicion('iniciar_servicio', req.params.uuid, { propietarioUuid: tecnico.uuid }),
    req.params.uuid
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
    req.params.uuid
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

  res.set('Cache-Control', 'no-store');
  res.json(filas[0]);
};

export const registrarConformidadPublico = async (req, res) => {
  if (!esUUID(String(req.params.uuid || '').trim())) {
    throw abortar(404, 'Ticket no encontrado');
  }

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
