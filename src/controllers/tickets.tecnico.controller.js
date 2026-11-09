import pool from '../config/db.js';
import { COLUMNAS_TICKET, aplicarTransicion } from '../services/ticketService.js';
import { leerPaginacion, cabeceraPaginacion, contar } from '../services/paginacion.service.js';
import { abortar } from '../middlewares/error.middleware.js';
import { validarAtencion } from '../validators/ticketValidators.js';
import { responderTransicion } from './tickets.comun.js';

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
