import {
  aplicarTransicion,
  listarTicketsDeTecnico,
  obtenerTicketDeTecnico
} from '../services/ticketService.js';
import { leerPaginacion, cabeceraPaginacion } from '../services/paginacion.service.js';
import { abortar } from '../middlewares/error.middleware.js';
import { validarAtencion } from '../validators/ticketValidators.js';
import { responderTransicion } from './tickets.comun.js';
import {
  aceptarAvisoTecnico,
  listarAvisosDeTecnico
} from '../services/avisos.service.js';
import { bitacora } from '../services/bitacora.service.js';

export const misTickets = async (req, res) => {
  const tecnico = req.user.tecnico;

  if (!tecnico) throw abortar(404, 'Técnico no encontrado');

  const paginacion = leerPaginacion(req.query);

  const { filas, total } = await listarTicketsDeTecnico(tecnico.uuid, paginacion);

  if (paginacion.activa) {
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  res.json(filas);
};

export const detalleTecnico = async (req, res) => {
  const tecnico = req.user.tecnico;

  if (!tecnico) throw abortar(404, 'Técnico no encontrado');

  const ticket = await obtenerTicketDeTecnico(req.params.uuid, tecnico.uuid);

  if (!ticket) throw abortar(404, 'Ticket no encontrado');

  res.json(ticket);
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

export const listarAvisosTecnico = async (req, res) => {
  const tecnico = req.user.tecnico;

  if (!tecnico) throw abortar(404, 'Técnico no encontrado');

  res.json(await listarAvisosDeTecnico(tecnico.uuid));
};

export const aceptarAvisoTecnicoController = async (req, res) => {
  const tecnico = req.user.tecnico;

  if (!tecnico) throw abortar(404, 'Técnico no encontrado');

  const resultado = await aceptarAvisoTecnico(req.params.uuid, tecnico.uuid);

  const respuestas = {
    asignado: [200, { message: 'Ticket aceptado y asignado a ti', asignado: true }],
    ya_asignado: [
      200,
      { message: 'Ya tenías este ticket asignado', asignado: true, ya_asignado: true }
    ],
    ya_asignado_otro: [
      200,
      {
        message: 'El ticket ya está asignado a otro técnico. No se reasignó.',
        asignado: false,
        motivo: 'ya_asignado_otro'
      }
    ],
    aviso_no_pendiente: [409, { message: 'Ya respondiste este aviso o ya no está disponible' }],
    ticket_cerrado: [409, { message: 'El ticket ya está cerrado y no se puede aceptar' }],
    estado_invalido: [409, { message: 'El ticket cambió de estado. Actualiza la pantalla' }],
    no_existe: [404, { message: 'Ticket no encontrado' }]
  };

  const [estatus, cuerpo] = respuestas[resultado];

  bitacora(
    'tickets',
    `Aviso ${resultado} del ticket ${req.params.uuid} por ${req.user?.email || tecnico.nombre}`
  );

  res.status(estatus).json(cuerpo);
};
