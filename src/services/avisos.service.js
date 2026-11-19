import pool from '../config/db.js';
import { COLUMNAS_TICKET } from './ticketService.js';
import { conTransaccion } from './transaccion.service.js';

const columnasDeTicket = (alias) =>
  COLUMNAS_TICKET.split(',')
    .map((columna) => `${alias}.${columna.trim()}`)
    .join(', ');

const marcarAviso = (client, avisoId, estado) =>
  client.query(
    'UPDATE ticket_avisos SET estado = ?, respondida_at = NOW() WHERE id = ? AND estado = ?',
    [estado, avisoId, 'pendiente']
  );

export const registrarAviso = async ({ ticketUuid, tecnicoUuid, mensaje, avisadoPor }) => {
  await pool.query(
    `INSERT INTO ticket_avisos
       (ticket_uuid, tecnico_uuid, mensaje, estado, avisado_por, created_at, respondida_at)
     VALUES (?, ?, ?, 'pendiente', ?, NOW(), NULL)
     ON DUPLICATE KEY UPDATE
       mensaje = VALUES(mensaje),
       estado = 'pendiente',
       avisado_por = VALUES(avisado_por),
       created_at = NOW(),
       respondida_at = NULL`,
    [ticketUuid, tecnicoUuid, mensaje, avisadoPor]
  );
};

export const listarAvisosDeTecnico = async (tecnicoUuid) => {
  const [filas] = await pool.query(
    `SELECT a.id AS aviso_id, a.mensaje AS aviso_mensaje,
            a.created_at AS aviso_created_at,
            ${columnasDeTicket('t')}
     FROM ticket_avisos a
     INNER JOIN tickets t ON t.uuid = a.ticket_uuid
     WHERE a.tecnico_uuid = ?
       AND a.estado = 'pendiente'
       AND t.estado IN ('pendiente', 'asignado', 'en_servicio', 'esperando_cliente')
     ORDER BY a.created_at DESC`,
    [tecnicoUuid]
  );

  return filas;
};

export const listarAvisosDeTicket = async (ticketUuid) => {
  const [filas] = await pool.query(
    `SELECT a.id, a.tecnico_uuid, te.nombre AS tecnico_nombre, a.estado,
            a.mensaje, a.created_at, a.respondida_at
     FROM ticket_avisos a
     INNER JOIN tecnicos te ON te.uuid = a.tecnico_uuid
     WHERE a.ticket_uuid = ?
     ORDER BY a.created_at DESC`,
    [ticketUuid]
  );

  return filas;
};

export const aceptarAvisoTecnico = async (ticketUuid, tecnicoUuid) =>
  conTransaccion(async (client) => {
    const [tickets] = await client.query(
      'SELECT estado, tecnico_uuid FROM tickets WHERE uuid = ? FOR UPDATE',
      [ticketUuid]
    );

    const ticket = tickets[0];
    if (!ticket) return 'no_existe';

    const [avisos] = await client.query(
      'SELECT id, estado FROM ticket_avisos WHERE ticket_uuid = ? AND tecnico_uuid = ? FOR UPDATE',
      [ticketUuid, tecnicoUuid]
    );

    const aviso = avisos[0];
    if (!aviso || aviso.estado !== 'pendiente') return 'aviso_no_pendiente';

    if (ticket.estado === 'cancelado' || ticket.estado === 'atendido') {
      await marcarAviso(client, aviso.id, 'cerrada');
      return 'ticket_cerrado';
    }

    let resultado;

    if (ticket.tecnico_uuid === tecnicoUuid) {
      resultado = 'ya_asignado';
    } else if (ticket.tecnico_uuid) {
      resultado = 'ya_asignado_otro';
    } else if (ticket.estado !== 'pendiente') {
      resultado = 'estado_invalido';
    } else {
      const [asignacion] = await client.query(
        `UPDATE tickets
         SET estado = 'asignado', tecnico_uuid = ?, fecha_asignacion = NOW()
         WHERE uuid = ? AND tecnico_uuid IS NULL AND estado = 'pendiente'`,
        [tecnicoUuid, ticketUuid]
      );
      resultado = asignacion.affectedRows === 1 ? 'asignado' : 'ya_asignado_otro';
    }

    if (resultado === 'estado_invalido') {
      await marcarAviso(client, aviso.id, 'cerrada');
      return resultado;
    }

    await marcarAviso(client, aviso.id, 'aceptada');
    await client.query(
      `UPDATE ticket_avisos
       SET estado = 'cerrada', respondida_at = NOW()
       WHERE ticket_uuid = ? AND id <> ? AND estado = 'pendiente'`,
      [ticketUuid, aviso.id]
    );

    return resultado;
  });
