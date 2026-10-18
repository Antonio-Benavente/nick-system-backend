import pool from '../config/db.js';
import { getClienteByUserId, getTecnicoByUserId } from './entidades.service.js';

const esPropietario = async (user, entidad, client) => {
  if (user.role === 'admin') return true;

  if (user.role === 'tecnico') {
    const tecnico = user.tecnico || (await getTecnicoByUserId(user.id, client));
    return Boolean(tecnico) && tecnico.id === entidad.tecnico_id;
  }

  if (user.role === 'cliente') {
    const cliente = user.cliente || (await getClienteByUserId(user.id, client));
    return Boolean(cliente) && cliente.id === entidad.cliente_id;
  }

  return false;
};

export const reporteAccesible = async (reporteUuid, user, client = pool) => {
  const [rows] = await client.query(
    'SELECT id, cliente_id, tecnico_id FROM reportes WHERE uuid = ?',
    [reporteUuid]
  );

  const reporte = rows[0];
  if (!reporte) return null;

  return (await esPropietario(user, reporte, client)) ? reporte : null;
};

export const evidenciaAccesible = async (evidenciaUuid, user, client = pool) => {
  const [rows] = await client.query(
    `SELECT e.id, e.reporte_id, r.cliente_id, r.tecnico_id
     FROM reporte_evidencias e
     INNER JOIN reportes r ON r.id = e.reporte_id
     WHERE e.uuid = ?`,
    [evidenciaUuid]
  );

  const evidencia = rows[0];
  if (!evidencia) return null;

  return (await esPropietario(user, evidencia, client)) ? evidencia : null;
};

export const ticketAccesible = async (ticketUuid, user, client = pool) => {
  const [rows] = await client.query(
    'SELECT id, uuid, estado, tecnico_uuid, cliente_uuid FROM tickets WHERE uuid = ?',
    [ticketUuid]
  );

  const ticket = rows[0];
  if (!ticket) return null;

  if (user.role === 'admin') return ticket;

  if (user.role === 'tecnico') {
    const tecnico = user.tecnico || (await getTecnicoByUserId(user.id, client));
    return tecnico && tecnico.uuid === ticket.tecnico_uuid ? ticket : null;
  }

  return null;
};

export const gastoAccesible = async (gastoUuid, user, client = pool) => {
  const [rows] = await client.query(
    `SELECT g.id, g.uuid, g.ticket_id, t.tecnico_uuid, t.estado
     FROM ticket_gastos g
     INNER JOIN tickets t ON t.id = g.ticket_id
     WHERE g.uuid = ?`,
    [gastoUuid]
  );

  const gasto = rows[0];
  if (!gasto) return null;

  if (user.role === 'admin') return gasto;

  if (user.role === 'tecnico') {
    const tecnico = user.tecnico || (await getTecnicoByUserId(user.id, client));
    return tecnico && tecnico.uuid === gasto.tecnico_uuid ? gasto : null;
  }

  return null;
};
