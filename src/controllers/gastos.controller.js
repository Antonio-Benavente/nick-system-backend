import { abortar } from '../middlewares/error.middleware.js';
import { validarGasto } from '../validators/ticketValidators.js';
import { gastoAccesible, ticketAccesible } from '../services/acceso.service.js';
import {
  actualizarGasto,
  crearGasto,
  eliminarGasto,
  listarGastos
} from '../services/gastos.service.js';

const soloTecnico = (user, accion) => {
  if (user.role === 'tecnico') return;
  throw abortar(403, `Solo el técnico asignado puede ${accion} gastos`);
};

const exigirTicketAbierto = (estado) => {
  if (estado !== 'atendido' && estado !== 'cancelado') return;
  throw abortar(
    409,
    'El ticket está cerrado: los gastos ya no se pueden agregar, editar ni borrar'
  );
};

export const verGastos = async (req, res) => {
  const ticket = await ticketAccesible(req.params.uuid, req.user);
  if (!ticket) throw abortar(404, 'Ticket no encontrado');

  res.json(await listarGastos(ticket.id));
};

export const agregarGasto = async (req, res) => {
  soloTecnico(req.user, 'registrar');

  const ticket = await ticketAccesible(req.params.uuid, req.user);
  if (!ticket) throw abortar(404, 'Ticket no encontrado');

  exigirTicketAbierto(ticket.estado);

  const gasto = await crearGasto(ticket.id, validarGasto(req.body));

  res.status(201).json(gasto);
};

export const editarGasto = async (req, res) => {
  soloTecnico(req.user, 'editar');

  const gasto = await gastoAccesible(req.params.gasto_uuid, req.user);
  if (!gasto) throw abortar(404, 'Gasto no encontrado');

  exigirTicketAbierto(gasto.estado);

  const actualizado = await actualizarGasto(gasto.uuid, validarGasto(req.body));
  if (!actualizado) throw abortar(404, 'Gasto no encontrado');

  res.json(actualizado);
};

export const borrarGasto = async (req, res) => {
  soloTecnico(req.user, 'borrar');

  const gasto = await gastoAccesible(req.params.gasto_uuid, req.user);
  if (!gasto) throw abortar(404, 'Gasto no encontrado');

  exigirTicketAbierto(gasto.estado);

  await eliminarGasto(gasto.uuid);

  res.json({ message: 'Gasto eliminado correctamente' });
};