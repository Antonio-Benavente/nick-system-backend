import { createHmac, randomUUID } from 'node:crypto';
import pool from '../config/db.js';
import { config } from '../config/env.js';

const inicial = (valor) => String(valor || '').trim().charAt(0).toUpperCase();

const ALFABETO_CODIGO = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const LARGO_SUFIJO = 5;
const INTENTOS_MAXIMOS = 5;

const sufijoCodigo = (material) => {
  const secreto = config.TICKET_CODIGO_SECRET || config.JWT_SECRET;

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
  tecnico_uuid, cliente_uuid, canal, modalidad, contacto_origen, nota_cierre,
  fecha_asignacion, fecha_inicio_servicio, fecha_cierre, created_at, updated_at`;

const COLUMNAS_TICKET_T = COLUMNAS_TICKET.split(',')
  .map((columna) => `t.${columna.trim()}`)
  .join(', ');

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
  modalidad = 'presencial',
  contactoOrigen = null,
  mensajeExternoId = null
}) => {
  const uuid = randomUUID();

  for (let intento = 0; ; intento += 1) {
    const codigo = construirCodigo(uuid, empresa, nombre, intento);

    try {
      await pool.query(
        `INSERT INTO tickets
          (uuid, codigo, empresa_solicitante, nombre_solicitante, asunto, descripcion, canal, modalidad, contacto_origen, mensaje_externo_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [uuid, codigo, empresa, nombre, asunto, descripcion, canal, modalidad, contactoOrigen, mensajeExternoId]
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

export const actualizarModalidad = async (uuid, modalidad) => {
  const [resultado] = await pool.query(
    'UPDATE tickets SET modalidad = ? WHERE uuid = ?',
    [modalidad, uuid]
  );

  return resultado.affectedRows === 1;
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

const OFFSET_LIMA = '-05:00';

const construirFiltrosListado = (filtros = {}) => {
  const condiciones = [];
  const parametros = [];

  const filtrosSimples = [
    ['estado', 'estado = ?'],
    ['tecnico_uuid', 'tecnico_uuid = ?'],
    ['modalidad', 'modalidad = ?'],
    ['cliente_uuid', 'cliente_uuid = ?']
  ];

  for (const [campo, condicion] of filtrosSimples) {
    if (filtros[campo]) {
      condiciones.push(condicion);
      parametros.push(filtros[campo]);
    }
  }

  if (filtros.empresa) {
    condiciones.push('empresa_solicitante LIKE ?');
    parametros.push(`%${filtros.empresa}%`);
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

  return {
    donde: condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '',
    parametros
  };
};

export const listarTickets = async ({ filtros, paginacion }) => {
  const { donde, parametros } = construirFiltrosListado(filtros);

  let total = null;

  if (paginacion.activa) {
    const [filas] = await pool.query(
      `SELECT COUNT(*) AS total FROM tickets ${donde}`,
      parametros
    );
    total = Number(filas[0]?.total || 0);
  }

  const [tickets] = await pool.query(
    `SELECT ${COLUMNAS_TICKET} FROM tickets ${donde} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
    [...parametros, paginacion.limite, paginacion.offset]
  );

  return { filas: tickets, total };
};

export const obtenerTicketPorUuid = async (uuid) => {
  const [filas] = await pool.query(
    `SELECT ${COLUMNAS_TICKET} FROM tickets WHERE uuid = ?`,
    [uuid]
  );

  return filas[0] || null;
};

export const listarTicketsDeTecnico = async (tecnicoUuid, paginacion) => {
  let total = null;

  if (paginacion.activa) {
    const [filas] = await pool.query(
      'SELECT COUNT(*) AS total FROM tickets WHERE tecnico_uuid = ?',
      [tecnicoUuid]
    );
    total = Number(filas[0]?.total || 0);
  }

  const [tickets] = await pool.query(
    `SELECT ${COLUMNAS_TICKET} FROM tickets
     WHERE tecnico_uuid = ?
     ORDER BY FIELD(estado, 'en_servicio', 'asignado', 'pendiente', 'atendido', 'cancelado'), created_at DESC
     LIMIT ? OFFSET ?`,
    [tecnicoUuid, paginacion.limite, paginacion.offset]
  );

  return { filas: tickets, total };
};

export const obtenerTicketDeTecnico = async (uuid, tecnicoUuid) => {
  const [filas] = await pool.query(
    `SELECT ${COLUMNAS_TICKET_T},
            t.tecnico_uuid = ? AS es_tuyo,
            aviso.estado AS aviso_estado,
            aviso.mensaje AS aviso_mensaje
     FROM tickets t
     LEFT JOIN ticket_avisos aviso
       ON aviso.ticket_uuid = t.uuid
      AND aviso.tecnico_uuid = ?
      AND aviso.estado IN ('pendiente', 'aceptada')
     WHERE t.uuid = ?
       AND (t.tecnico_uuid = ? OR aviso.id IS NOT NULL)`,
    [tecnicoUuid, tecnicoUuid, uuid, tecnicoUuid]
  );

  if (!filas[0]) return null;

  return { ...filas[0], es_tuyo: Boolean(filas[0].es_tuyo) };
};

export const obtenerSeguimientoPublico = async (identificador, esUuid) => {
  const condicion = esUuid ? 'uuid = ?' : 'codigo = ?';

  const [filas] = await pool.query(
    `SELECT uuid, codigo, asunto, estado, cliente_conforme, aprobado_por,
            fecha_conformidad, motivo_no_conforme, created_at, fecha_asignacion,
            fecha_inicio_servicio, fecha_cierre
     FROM tickets WHERE ${condicion}`,
    [identificador]
  );

  return filas[0] || null;
};

export const obtenerTicketParaConformidad = async (uuid) => {
  const [filas] = await pool.query(
    `SELECT uuid, codigo, empresa_solicitante, nombre_solicitante, asunto,
            cliente_conforme, aprobado_por, motivo_no_conforme, fecha_conformidad
     FROM tickets WHERE uuid = ?`,
    [uuid]
  );

  return filas[0] || null;
};

export const buscarTecnicoActivoPorUuid = async (uuid) => {
  const [filas] = await pool.query(
    "SELECT uuid FROM tecnicos WHERE uuid = ? AND estado = 'activo'",
    [uuid]
  );

  return filas[0] || null;
};

export const obtenerTicketParaAsignacion = async (uuid) => {
  const [filas] = await pool.query(
    'SELECT codigo, tecnico_uuid FROM tickets WHERE uuid = ?',
    [uuid]
  );

  return filas[0] || null;
};

export const obtenerTicketEstado = async (uuid) => {
  const [filas] = await pool.query(
    'SELECT uuid, estado FROM tickets WHERE uuid = ?',
    [uuid]
  );

  return filas[0] || null;
};

export const buscarClienteActivoPorUuid = async (uuid) => {
  const [filas] = await pool.query(
    "SELECT uuid, nombre, empresa FROM clientes WHERE uuid = ? AND estado = 'activo'",
    [uuid]
  );

  return filas[0] || null;
};
