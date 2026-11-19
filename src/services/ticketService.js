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
  asunto, descripcion, categoria_id, ubicacion, contacto_servicio_nombre, contacto_servicio_telefono,
  estado, cliente_conforme, aprobado_por, fecha_conformidad, motivo_no_conforme,
  tecnico_uuid, cliente_uuid, canal, modalidad, contacto_origen, mensaje_externo_id,
  nota_cierre, solucion, motivo_cancelacion,
  fecha_asignacion, fecha_inicio_servicio, fecha_primera_respuesta, fecha_cierre,
  reporte_id, created_at, updated_at`;

const COLUMNAS_TICKET_T = COLUMNAS_TICKET.split(',')
  .map((columna) => `t.${columna.trim()}`)
  .join(', ');

const TIPOS_EVENTO = {
  asignar: 'asignado',
  iniciar_servicio: 'en_servicio',
  esperar_cliente: 'esperando_cliente',
  reanudar: 'reanudado',
  atender: 'atendido',
  cancelar: 'cancelado'
};

/**
 * Cronología visible en el drawer del admin. No bloquea la operación principal:
 * si falla el insert se avisa por consola, igual que la bitácora.
 */
export const registrarEvento = async (ticketUuid, tipo, detalle = null, usuarioUuid = null) => {
  try {
    await pool.query(
      'INSERT INTO ticket_eventos (ticket_uuid, usuario_uuid, tipo, detalle) VALUES (?, ?, ?, ?)',
      [ticketUuid, usuarioUuid || null, tipo, detalle || null]
    );
  } catch (error) {
    console.warn(`[ticket_eventos] No se pudo registrar "${tipo}" en ${ticketUuid}: ${error.message}`);
  }
};

export const listarEventos = async (ticketUuid) => {
  const [filas] = await pool.query(
    `SELECT id, usuario_uuid, tipo, detalle, fecha
     FROM ticket_eventos WHERE ticket_uuid = ? ORDER BY fecha ASC, id ASC`,
    [ticketUuid]
  );

  return filas;
};

export const listarAdjuntos = async (ticketUuid) => {
  const [filas] = await pool.query(
    `SELECT uuid, url, tipo, created_at
     FROM ticket_adjuntos WHERE ticket_uuid = ? ORDER BY created_at ASC, id ASC`,
    [ticketUuid]
  );

  return filas;
};

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
  esperar_cliente: { desde: ['asignado', 'en_servicio'], hasta: 'esperando_cliente' },
  reanudar: { desde: ['esperando_cliente'], hasta: 'en_servicio' },
  atender: { desde: ['en_servicio'], hasta: 'atendido' },
  cancelar: { desde: ['pendiente', 'asignado', 'en_servicio', 'esperando_cliente'], hasta: 'cancelado' }
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
  // Los tickets entrantes (WhatsApp/correo) no traen dirección: el admin la
  // completa después desde el drawer. Nunca se guarda NULL (la columna es NOT NULL).
  ubicacion = 'Sin ubicación',
  categoriaId = null,
  contactoServicioNombre = null,
  contactoServicioTelefono = null,
  canal = 'correo',
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
          (uuid, codigo, empresa_solicitante, nombre_solicitante, asunto, descripcion,
           categoria_id, ubicacion, contacto_servicio_nombre, contacto_servicio_telefono,
           canal, modalidad, contacto_origen, mensaje_externo_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          uuid, codigo, empresa, nombre, asunto, descripcion,
          categoriaId, ubicacion, contactoServicioNombre, contactoServicioTelefono,
          canal, modalidad, contactoOrigen, mensajeExternoId
        ]
      );
      await registrarEvento(uuid, 'creado', `Ticket ${codigo} creado desde ${canal}`);
      return { uuid, codigo, ubicacion };
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
  {
    tecnicoUuid = null,
    propietarioUuid = null,
    nota = null,
    solucion = null,
    motivoCancelacion = null,
    detalle = null,
    usuarioUuid = null
  } = {}
) => {
  const { desde, hasta } = TRANSICIONES[accion];

  const asignaciones = ['estado = ?'];
  const valores = [hasta];
  if (accion === 'asignar') {
    asignaciones.push('tecnico_uuid = ?', 'fecha_asignacion = NOW()');
    valores.push(tecnicoUuid);
  }
  if (accion === 'iniciar_servicio' || accion === 'reanudar') {
    asignaciones.push('fecha_inicio_servicio = COALESCE(fecha_inicio_servicio, NOW())');
  }
  if (['iniciar_servicio', 'esperar_cliente', 'reanudar'].includes(accion)) {
    asignaciones.push('fecha_primera_respuesta = COALESCE(fecha_primera_respuesta, NOW())');
  }
  if (accion === 'atender') {
    asignaciones.push('nota_cierre = ?');
    valores.push(nota);
    if (solucion) {
      asignaciones.push('solucion = ?');
      valores.push(solucion);
    }
  }
  if (accion === 'cancelar') {
    asignaciones.push('motivo_cancelacion = ?');
    valores.push(motivoCancelacion);
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
  if (resultado.affectedRows === 1) {
    await registrarEvento(
      uuid,
      TIPOS_EVENTO[accion] || accion,
      detalle || solucion || nota || motivoCancelacion,
      usuarioUuid
    );
    return 'ok';
  }

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

/** Edición de los datos del ticket desde el drawer del admin. */
export const actualizarDatosTicket = async (uuid, datos = {}) => {
  const asignaciones = [];
  const valores = [];

  const campos = [
    ['ubicacion', datos.ubicacion],
    ['categoria_id', datos.categoriaId],
    ['contacto_servicio_nombre', datos.contactoServicioNombre],
    ['contacto_servicio_telefono', datos.contactoServicioTelefono],
    ['solucion', datos.solucion]
  ];

  for (const [campo, valor] of campos) {
    if (valor !== undefined) {
      asignaciones.push(`${campo} = ?`);
      valores.push(valor);
    }
  }

  if (!asignaciones.length) return false;

  const [resultado] = await pool.query(
    `UPDATE tickets SET ${asignaciones.join(', ')} WHERE uuid = ?`,
    [...valores, uuid]
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

  if (resultado.affectedRows === 1) {
    // Si ya se generó el reporte, mantiene copiada la conformidad del ticket.
    await pool.query(
      `UPDATE reportes
       SET cliente_conforme = ?, aprobado_por = ?, fecha_conformidad = NOW(), motivo_no_conforme = ?
       WHERE uuid = (SELECT reporte_id FROM tickets WHERE uuid = ?)`,
      [conforme ? 'conforme' : 'no_conforme', aprobadoPor, conforme ? null : motivo, uuid]
    );
    await registrarEvento(
      uuid,
      'conformidad',
      conforme ? `Conforme registrado por ${aprobadoPor}` : `No conforme: ${motivo}`
    );
    return 'ok';
  }

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
     WHERE uuid = ? AND estado IN ('pendiente', 'asignado', 'en_servicio', 'esperando_cliente')`,
    [clienteUuid, adminUuid, ticketUuid]
  );

  if (resultado.affectedRows === 1) {
    await registrarEvento(ticketUuid, 'cliente_vinculado', `Cliente ${clienteUuid} vinculado`, adminUuid);
  }

  return resultado.affectedRows === 1;
};

export const desvincularCliente = async (ticketUuid) => {
  const [resultado] = await pool.query(
    `UPDATE tickets
     SET cliente_uuid = NULL, vinculado_por = NULL, vinculado_at = NULL
     WHERE uuid = ? AND cliente_uuid IS NOT NULL`,
    [ticketUuid]
  );

  if (resultado.affectedRows === 1) {
    await registrarEvento(ticketUuid, 'cliente_desvinculado', 'Cliente desvinculado');
  }

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
     ORDER BY FIELD(estado, 'en_servicio', 'esperando_cliente', 'asignado', 'pendiente', 'atendido', 'cancelado'), created_at DESC
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
