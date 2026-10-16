import { randomUUID } from 'node:crypto';
import pool from '../config/db.js';

const inicial = (valor) => String(valor || '').trim().charAt(0).toUpperCase();

export const SQL_CODIGO_TICKET =
  "CONCAT('TK-', UPPER(LEFT(empresa_solicitante, 1)), UPPER(LEFT(nombre_solicitante, 1)), LPAD(id, 4, '0'))";

export const COLUMNAS_TICKET = `uuid, ${SQL_CODIGO_TICKET} AS codigo, empresa_solicitante, nombre_solicitante,
  asunto, descripcion, estado, tecnico_uuid, cliente_uuid, canal, contacto_origen, nota_cierre,
  fecha_asignacion, fecha_cierre, created_at, updated_at`;

const TRANSICIONES = {
  asignar: { desde: ['pendiente', 'asignado'], hasta: 'asignado' },
  iniciar: { desde: ['asignado'], hasta: 'en_proceso' },
  atender: { desde: ['en_proceso'], hasta: 'atendido' },
  cancelar: { desde: ['pendiente', 'asignado', 'en_proceso'], hasta: 'cancelado' }
};

export const crearTicket = async ({
  empresa,
  nombre,
  asunto,
  descripcion,
  canal = 'manual',
  contactoOrigen = null,
  mensajeExternoId = null
}) => {
  const uuid = randomUUID();
  const [resultado] = await pool.query(
    `INSERT INTO tickets
      (uuid, empresa_solicitante, nombre_solicitante, asunto, descripcion, canal, contacto_origen, mensaje_externo_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [uuid, empresa, nombre, asunto, descripcion, canal, contactoOrigen, mensajeExternoId]
  );
  return {
    uuid,
    codigo: `TK-${inicial(empresa)}${inicial(nombre)}${String(resultado.insertId).padStart(4, '0')}`
  };
};

export const aplicarTransicion = async (
  accion,
  uuid,
  { tecnicoUuid = null, propietarioUuid = null, nota = null } = {}
) => {
  const { desde, hasta } = TRANSICIONES[accion];

  const asignaciones = ['estado = ?'];
  const valores = [hasta];
  if (accion === 'asignar') {
    asignaciones.push('tecnico_uuid = ?', 'fecha_asignacion = NOW()');
    valores.push(tecnicoUuid);
  }
  if (accion === 'atender') {
    asignaciones.push('nota_cierre = ?');
    valores.push(nota);
  }
  if (accion === 'atender' || accion === 'cancelar') {
    asignaciones.push('fecha_cierre = NOW()');
  }

  const condiciones = ['uuid = ?', `estado IN (${desde.map(() => '?').join(', ')})`];
  const parametros = [uuid, ...desde];
  if (propietarioUuid) {
    condiciones.push('tecnico_uuid = ?');
    parametros.push(propietarioUuid);
  }

  const [resultado] = await pool.query(
    `UPDATE tickets SET ${asignaciones.join(', ')} WHERE ${condiciones.join(' AND ')}`,
    [...valores, ...parametros]
  );
  if (resultado.affectedRows === 1) return 'ok';

  const [existentes] = await pool.query(
    propietarioUuid
      ? 'SELECT 1 FROM tickets WHERE uuid = ? AND tecnico_uuid = ?'
      : 'SELECT 1 FROM tickets WHERE uuid = ?',
    propietarioUuid ? [uuid, propietarioUuid] : [uuid]
  );
  return existentes.length ? 'estado_invalido' : 'no_existe';
};

export const vincularCliente = async (ticketUuid, clienteUuid, adminUuid) => {
  const [resultado] = await pool.query(
    `UPDATE tickets
     SET cliente_uuid = ?, vinculado_por = ?, vinculado_at = NOW()
     WHERE uuid = ? AND estado IN ('pendiente', 'asignado', 'en_proceso')`,
    [clienteUuid, adminUuid, ticketUuid]
  );

  return resultado.affectedRows === 1;
};

export const desvincularCliente = async (ticketUuid) => {
  const [resultado] = await pool.query(
    `UPDATE tickets
     SET cliente_uuid = NULL, vinculado_por = NULL, vinculado_at = NULL
     WHERE uuid = ? AND cliente_uuid IS NOT NULL`,
    [ticketUuid]
  );

  return resultado.affectedRows === 1;
};
