import pool from '../config/db.js';
import { COLUMNAS_TICKET } from '../services/ticketService.js';
import { bitacora } from '../services/bitacora.service.js';

export const ERRORES_TRANSICION = {
  no_existe: [404, 'Ticket no encontrado'],
  estado_invalido: [409, 'El ticket no puede cambiar desde su estado actual'],
  ya_confirmado: [
    409,
    'Ya registraste tu respuesta para este ticket y no se puede modificar desde aquí. Escribe a soporte@nicksystem.com o llama al 992741064 para cambiarlo.'
  ]
};

export const responderTransicion = async (res, resultado, uuid, { accion, actor } = {}) => {
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
