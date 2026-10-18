import { createHmac, randomUUID } from 'node:crypto';
import pool from '../config/db.js';

const inicial = (valor) => String(valor || '').trim().charAt(0).toUpperCase();

const ALFABETO_CODIGO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LARGO_SUFIJO = 5;
const INTENTOS_MAXIMOS = 5;

const sufijoCodigo = (material) => {
  const secreto = process.env.TICKET_CODIGO_SECRET || process.env.JWT_SECRET || 'nick-system';

  const digesto = createHmac('sha256', secreto).update(material).digest();
  const bits = digesto.readUInt32BE(0);

  let salida = '';
  for (let posicion = 0; posicion < LARGO_SUFIJO; posicion += 1) {
    salida += ALFABETO_CODIGO[(bits >>> (posicion * 5)) & 31];
  }

  return salida;
};

const construirCodigo = (uuid, empresa, nombre, intento = 0) =>
  `TK-${inicial(empresa)}${inicial(nombre)}${sufijoCodigo(intento ? `${uuid}#${intento}` : uuid)}`;

export const REGEX_CODIGO_TICKET =
  /^TK-[A-Z0-9]{2}(?:[0-9A-HJKMNP-TV-Z]{5}|[0-9]{4})$/i;

export const COLUMNAS_TICKET = `uuid, codigo, empresa_solicitante, nombre_solicitante,
  asunto, descripcion, estado, cliente_conforme, aprobado_por, fecha_conformidad, motivo_no_conforme,
  tecnico_uuid, cliente_uuid, canal, contacto_origen, nota_cierre,
  fecha_asignacion, fecha_inicio_servicio, fecha_cierre, created_at, updated_at`;

export const ticketPorMensajeExterno = async (mensajeExternoId) => {
  if (!mensajeExternoId) return null;

  const [filas] = await pool.query('SELECT uuid, codigo, asunto, estado FROM tickets WHERE mensaje_externo_id = ?', [
    mensajeExternoId
  ]);

  return filas[0] || null;
};

/**
 * Últimos tickets de un contacto (teléfono o correo). `dias` acota la ventana para
 * que una consulta de estado no devuelva un caso de hace meses.
 */
export const ultimosTicketsPorContacto = async (contacto, { limite = 1, dias = 90 } = {}) => {
  if (!contacto) return [];

  const [filas] = await pool.query(
    `SELECT uuid, codigo, estado, asunto, created_at
     FROM tickets
     WHERE contacto_origen = ?
       AND created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)
     ORDER BY created_at DESC
     LIMIT ?`,
    [contacto, dias, limite]
  );

  return filas;
};

const TRANSICIONES = {
  asignar: { desde: ['pendiente', 'asignado'], hasta: 'asignado' },
  iniciar_servicio: { desde: ['asignado'], hasta: 'en_servicio' },
  atender: { desde: ['en_servicio'], hasta: 'atendido' },
  cancelar: { desde: ['pendiente', 'asignado', 'en_servicio'], hasta: 'cancelado' }
};

const existeMensajeExterno = async (mensajeExternoId) => {
  if (!mensajeExternoId) return false;

  const [filas] = await pool.query('SELECT 1 FROM tickets WHERE mensaje_externo_id = ?', [
    mensajeExternoId
  ]);

  return filas.length > 0;
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

  for (let intento = 0; ; intento += 1) {
    const codigo = construirCodigo(uuid, empresa, nombre, intento);

    try {
      await pool.query(
        `INSERT INTO tickets
          (uuid, codigo, empresa_solicitante, nombre_solicitante, asunto, descripcion, canal, contacto_origen, mensaje_externo_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid, codigo, empresa, nombre, asunto, descripcion, canal, contactoOrigen, mensajeExternoId]
      );
      return { uuid, codigo };
    } catch (error) {
      const colisionDeCodigo =
        error?.code === 'ER_DUP_ENTRY' && !(await existeMensajeExterno(mensajeExternoId));

      if (!colisionDeCodigo || intento >= INTENTOS_MAXIMOS - 1) throw error;
    }
  }
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
  if (accion === 'iniciar_servicio') {
    asignaciones.push('fecha_inicio_servicio = NOW()');
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

export const registrarConformidad = async (uuid, { conforme, aprobadoPor, motivo }) => {
  const [resultado] = await pool.query(
    `UPDATE tickets
     SET cliente_conforme = ?, aprobado_por = ?, motivo_no_conforme = ?, fecha_conformidad = NOW()
     WHERE uuid = ?
       AND estado = 'atendido'
       AND cliente_conforme = 'por_confirmar'`,
    [conforme ? 'conforme' : 'no_conforme', aprobadoPor, conforme ? null : motivo, uuid]
  );

  if (resultado.affectedRows === 1) return 'ok';

  const [existentes] = await pool.query(
    'SELECT estado, cliente_conforme FROM tickets WHERE uuid = ?',
    [uuid]
  );

  if (!existentes.length) return 'no_existe';
  if (existentes[0].estado !== 'atendido') return 'estado_invalido';

  return 'ya_confirmado';
};

export const vincularCliente = async (ticketUuid, clienteUuid, adminUuid) => {
  const [resultado] = await pool.query(
    `UPDATE tickets
     SET cliente_uuid = ?, vinculado_por = ?, vinculado_at = NOW()
     WHERE uuid = ? AND estado IN ('pendiente', 'asignado', 'en_servicio')`,
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
