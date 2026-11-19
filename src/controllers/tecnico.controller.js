import { randomUUID } from 'node:crypto';
import pool from "../config/db.js";
import {
  validateReporte,
  validateReporteUpdate,
  validarEvidencias,
  validarRangoFechas,
  validarEnumFiltro,
  sanear,
  REPORTE_CONFORMIDAD,
  REPORTE_LIMITES
} from "../validators/validators.js";
import { abortar, HttpError } from "../middlewares/error.middleware.js";
import { conTransaccion } from "../services/transaccion.service.js";
import {
  obtenerReporteNotificable,
  verificarPermisoNotificar,
  enviarNotificacionAlCliente
} from "../services/notificaciones.service.js";
import { attachEvidencias } from "../services/evidencias.service.js";
import { obtenerOCrearCategoria } from "../services/categorias.service.js";
import { leerPaginacion, cabeceraPaginacion, contar } from "../services/paginacion.service.js";
import { validarUUID } from "../validators/ticketValidators.js";

const CONFORMIDAD_INICIAL = 'por_confirmar';

export const getMiPerfil = async (req, res) => {
  const [rows] = await pool.query(
    `
    SELECT
      t.id,
      t.uuid,
      t.nombre,
      t.email,
      t.telefono,
      t.especialidad,
      t.estado,
      t.fecha_ingreso,
      u.id AS user_id,
      u.email AS user_email,
      u.role
    FROM tecnicos t
    INNER JOIN users u ON u.id = t.user_id
    WHERE t.user_id = ?
  `,
    [req.user.id]
  );

  if (rows.length === 0) {
    throw abortar(404, "Perfil de técnico no encontrado");
  }

  res.json(rows[0]);
};

const consultarReportes = async ({ condiciones, params, paginacion }) => {
  const [reportes] = await pool.query(
    `
    SELECT
      r.id,
      r.uuid,
      r.categoria,
      r.descripcion,
      r.fecha,
      r.modalidad,
      r.cliente_conforme,
      r.aprobado_por,
      r.estado,
      r.created_at,
      c.uuid AS cliente_uuid,
      c.nombre AS cliente_nombre,
      c.empresa AS cliente_empresa
    FROM reportes r
    INNER JOIN clientes c ON c.id = r.cliente_id
    WHERE ${condiciones.join(" AND ")}
    ORDER BY r.fecha DESC, r.created_at DESC
    LIMIT ? OFFSET ?
  `,
    [...params, paginacion.limite, paginacion.offset]
  );

  return attachEvidencias(reportes);
};

export const getMisReportes = async (req, res) => {
  const { incluir_eliminados } = req.query;
  const paginacion = leerPaginacion(req.query);
  const rango = validarRangoFechas(req.query);

  const tecnico = req.user.tecnico;

  if (!tecnico) {
    throw abortar(404, "Técnico no encontrado");
  }

  const condiciones = ["r.tecnico_id = ?"];
  const params = [tecnico.id];

  if (incluir_eliminados !== "true") {
    condiciones.push("r.estado = 'activo'");
  }

  const categoria = sanear(req.query.categoria, REPORTE_LIMITES.categoria);
  if (categoria) {
    condiciones.push("r.categoria = ?");
    params.push(categoria);
  }

  const conformidad = validarEnumFiltro(
    req.query.cliente_conforme,
    REPORTE_CONFORMIDAD,
    "cliente_conforme"
  );
  if (conformidad) {
    condiciones.push("r.cliente_conforme = ?");
    params.push(conformidad);
  }

  if (rango.fecha_desde) {
    condiciones.push("r.fecha >= ?");
    params.push(rango.fecha_desde);
  }

  if (rango.fecha_hasta) {
    condiciones.push("r.fecha <= ?");
    params.push(rango.fecha_hasta);
  }

  const donde = `WHERE ${condiciones.join(" AND ")}`;

  if (paginacion.activa) {
    const total = await contar(
      pool,
      `SELECT COUNT(*) AS total FROM reportes r ${donde}`,
      params
    );
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  const reportes = await consultarReportes({
    condiciones,
    params,
    paginacion
  });

  res.json(reportes);
};

export const getReporteByUuid = async (req, res) => {
  const tecnico = req.user.tecnico;

  if (!tecnico) {
    throw abortar(404, "Técnico no encontrado");
  }

  const [reporte] = await consultarReportes({
    condiciones: ["r.uuid = ?", "r.tecnico_id = ?", "r.estado = 'activo'"],
    params: [req.params.uuid, tecnico.id],
    paginacion: { activa: false, limite: 1, offset: 0 }
  });

  if (!reporte) {
    throw abortar(404, "Reporte no encontrado");
  }

  res.json(reporte);
};

export const getMisEstadisticas = async (req, res) => {
  const tecnico = req.user.tecnico;

  if (!tecnico) {
    throw abortar(404, "Técnico no encontrado");
  }

  const [stats] = await pool.query(
    `
    SELECT
      COUNT(*) AS total_reportes,
      CAST(COALESCE(SUM(CASE WHEN cliente_conforme = 'conforme' THEN 1 ELSE 0 END), 0) AS SIGNED) AS reportes_conformes,
      CAST(COALESCE(SUM(CASE WHEN cliente_conforme = 'no_conforme' THEN 1 ELSE 0 END), 0) AS SIGNED) AS reportes_no_conformes,
      CAST(COALESCE(SUM(CASE WHEN cliente_conforme = 'por_confirmar' THEN 1 ELSE 0 END), 0) AS SIGNED) AS reportes_pendientes,
      CAST(COALESCE(SUM(CASE WHEN modalidad = 'presencial' THEN 1 ELSE 0 END), 0) AS SIGNED) AS reportes_presenciales,
      CAST(COALESCE(SUM(CASE WHEN modalidad = 'remoto' THEN 1 ELSE 0 END), 0) AS SIGNED) AS reportes_remotos
    FROM reportes
    WHERE tecnico_id = ? AND estado = 'activo'
  `,
    [tecnico.id]
  );

  const [reportesPorMes] = await pool.query(
    `
    SELECT
      DATE_FORMAT(fecha, '%Y-%m') AS mes,
      COUNT(*) AS cantidad
    FROM reportes
    WHERE tecnico_id = ?
      AND estado = 'activo'
      AND fecha >= DATE_SUB(CURDATE(), INTERVAL 6 MONTH)
    GROUP BY DATE_FORMAT(fecha, '%Y-%m')
    ORDER BY mes DESC
  `,
    [tecnico.id]
  );

  res.json({
    estadisticas: stats[0],
    reportes_por_mes: reportesPorMes,
  });
};

export const createReporte = async (req, res) => {
  const body = { ...req.body };
  const ticketUuid = body.ticket_uuid ? validarUUID(body.ticket_uuid, 'ticket_uuid') : null;
  const listaEvidencias = validarEvidencias(body.evidencias);

  const resultado = await conTransaccion(async (connection) => {
    const tecnico = req.user.tecnico;

    if (!tecnico) {
      throw abortar(404, 'Técnico no encontrado');
    }

    let ticket = null;

    if (ticketUuid) {
      const [filas] = await connection.query(
        `SELECT uuid, codigo, estado, tecnico_uuid, cliente_uuid, categoria_id,
                modalidad, solucion, nota_cierre, cliente_conforme, aprobado_por,
                fecha_conformidad, motivo_no_conforme, reporte_id
         FROM tickets WHERE uuid = ? FOR UPDATE`,
        [ticketUuid]
      );
      ticket = filas[0] || null;

      if (!ticket) throw abortar(404, 'Ticket no encontrado');
      if (ticket.estado !== 'atendido') {
        throw abortar(409, 'El ticket debe estar atendido antes de crear su reporte');
      }
      if (!ticket.cliente_uuid) {
        throw abortar(409, 'El admin debe vincular el ticket a un cliente antes de crear el reporte');
      }
      if (ticket.reporte_id) {
        throw abortar(409, 'Este ticket ya tiene un reporte asociado');
      }
      if (ticket.tecnico_uuid && ticket.tecnico_uuid !== tecnico.uuid) {
        throw abortar(403, 'El ticket está asignado a otro técnico');
      }

      // El cliente y la modalidad del ticket son los definitivos; el reporte no
      // debe describir la queja original sino la solución aplicada.
      body.cliente_uuid = ticket.cliente_uuid;
      if (!body.modalidad) body.modalidad = ticket.modalidad;
      if (!body.descripcion) body.descripcion = ticket.solucion || ticket.nota_cierre || null;
      if (!body.categoria && ticket.categoria_id) {
        const [cat] = await connection.query(
          'SELECT nombre FROM categorias WHERE id = ?',
          [ticket.categoria_id]
        );
        if (cat.length) body.categoria = cat[0].nombre;
      }
    }

    validateReporte(body);

    const {
      cliente_uuid,
      categoria,
      descripcion,
      fecha,
      modalidad
    } = body;

    const [cliente] = await connection.query(
      "SELECT id FROM clientes WHERE uuid = ? AND estado = 'activo'",
      [cliente_uuid]
    );

    if (cliente.length === 0) {
      throw abortar(404, 'Cliente no encontrado o inactivo');
    }

    const categoriaResuelta = await obtenerOCrearCategoria(connection, categoria);
    const reporteUUID = randomUUID();
    const conformidad = ticket?.cliente_conforme || CONFORMIDAD_INICIAL;
    const yaConfirmado = conformidad !== 'por_confirmar';

    const [reporteResult] = await connection.query(
      `INSERT INTO reportes
       (uuid, cliente_id, tecnico_id, categoria, descripcion, fecha, modalidad,
        cliente_conforme, aprobado_por, fecha_conformidad, motivo_no_conforme,
        ticket_id, estado)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'activo')`,
      [
        reporteUUID,
        cliente[0].id,
        tecnico.id,
        categoriaResuelta.nombre,
        descripcion,
        fecha,
        modalidad,
        conformidad,
        yaConfirmado ? ticket.aprobado_por : null,
        yaConfirmado ? ticket.fecha_conformidad : null,
        yaConfirmado ? ticket.motivo_no_conforme : null,
        ticketUuid
      ]
    );

    const reporteId = reporteResult.insertId;

    for (let i = 0; i < listaEvidencias.length; i++) {
      const evidencia = listaEvidencias[i];

      if (!evidencia.url) continue;

      await connection.query(
        `INSERT INTO reporte_evidencias
         (uuid, reporte_id, url, tipo, descripcion, orden)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          randomUUID(),
          reporteId,
          evidencia.url,
          evidencia.tipo || 'imagen',
          evidencia.descripcion || null,
          i + 1
        ]
      );
    }

    if (ticketUuid) {
      await connection.query(
        'UPDATE tickets SET reporte_id = ? WHERE uuid = ?',
        [reporteUUID, ticketUuid]
      );
      await connection.query(
        `INSERT INTO ticket_eventos (ticket_uuid, usuario_uuid, tipo, detalle)
         VALUES (?, ?, 'reporte_creado', ?)`,
        [ticketUuid, req.user?.uuid || null, `Reporte ${reporteUUID} generado desde el ticket`]
      );
    }

    return {
      uuid: reporteUUID,
      ticket_uuid: ticketUuid,
      evidencias_agregadas: listaEvidencias.length,
      categoria_creada: categoriaResuelta.creada === true,
      conformidad_copiada: yaConfirmado
    };
  });

  res.status(201).json({
    message: 'Reporte creado correctamente',
    ...resultado
  });
};

export const updateReporte = async (req, res) => {
  const { reporteUUID } = req.params;

  const datos = { ...req.body };
  delete datos.cliente_conforme;
  delete datos.aprobado_por;

  validateReporteUpdate(datos);

  const listaEvidencias = validarEvidencias(datos.evidencias);

  const resultado = await conTransaccion(async (connection) => {
    const tecnico = req.user.tecnico;

    if (!tecnico) {
      throw abortar(404, 'Técnico no encontrado');
    }

    const [reporte] = await connection.query(
      'SELECT id FROM reportes WHERE uuid = ? AND tecnico_id = ?',
      [reporteUUID, tecnico.id]
    );

    if (reporte.length === 0) {
      throw abortar(
        403,
        'No tiene permiso para editar este reporte o el reporte no existe'
      );
    }

    const reporteId = reporte[0].id;
    const { categoria, descripcion, fecha, modalidad } = datos;

    let categoriaCreada = false;

    if (categoria !== undefined) {
      const categoriaResuelta = await obtenerOCrearCategoria(connection, categoria);

      await connection.query(
        'UPDATE reportes SET categoria = ? WHERE id = ?',
        [categoriaResuelta.nombre, reporteId]
      );

      categoriaCreada = categoriaResuelta.creada === true;
    }

    const campos = [];
    const valores = [];

    if (descripcion !== undefined) {
      campos.push('descripcion = ?');
      valores.push(descripcion);
    }
    if (fecha !== undefined) {
      campos.push('fecha = ?');
      valores.push(fecha);
    }
    if (modalidad !== undefined) {
      campos.push('modalidad = ?');
      valores.push(modalidad);
    }

    if (campos.length > 0) {
      await connection.query(
        `UPDATE reportes SET ${campos.join(', ')} WHERE id = ?`,
        [...valores, reporteId]
      );
    }

    let evidenciasAgregadas = 0;
    let evidenciasActualizadas = 0;

    if (listaEvidencias.length > 0) {
      const [existentes] = await connection.query(
        'SELECT uuid FROM reporte_evidencias WHERE reporte_id = ?',
        [reporteId]
      );

      const existentesUUIDs = new Set(existentes.map((e) => e.uuid));

      const [[maxOrden]] = await connection.query(
        'SELECT COALESCE(MAX(orden), 0) AS max_orden FROM reporte_evidencias WHERE reporte_id = ?',
        [reporteId]
      );

      let ordenActual = Number(maxOrden.max_orden) + 1;

      for (const evidencia of listaEvidencias) {
        if (!evidencia.url) continue;

        if (evidencia.uuid && existentesUUIDs.has(evidencia.uuid)) {
          await connection.query(
            `UPDATE reporte_evidencias
             SET url = ?, tipo = ?, descripcion = ?
             WHERE uuid = ? AND reporte_id = ?`,
            [
              evidencia.url,
              evidencia.tipo || 'imagen',
              evidencia.descripcion || null,
              evidencia.uuid,
              reporteId
            ]
          );
          evidenciasActualizadas++;
        } else {
          await connection.query(
            `INSERT INTO reporte_evidencias
             (uuid, reporte_id, url, tipo, descripcion, orden)
             VALUES (?, ?, ?, ?, ?, ?)`,
            [
              randomUUID(),
              reporteId,
              evidencia.url,
              evidencia.tipo || 'imagen',
              evidencia.descripcion || null,
              ordenActual++
            ]
          );
          evidenciasAgregadas++;
        }
      }
    }

    return {
      uuid: reporteUUID,
      evidencias_agregadas: evidenciasAgregadas,
      evidencias_actualizadas: evidenciasActualizadas,
      categoria_creada: categoriaCreada
    };
  });

  res.json({
    message: 'Reporte actualizado correctamente',
    ...resultado
  });
};

export const reenviarReporte = async (req, res) => {
  const { reporteUUID } = req.params;

  const reporte = await obtenerReporteNotificable(reporteUUID);
  await verificarPermisoNotificar(reporte, req.user);

  const reabierto = reporte.cliente_conforme === 'no_conforme';

  if (reabierto) {
    await pool.query(
      `UPDATE reportes
       SET cliente_conforme = 'por_confirmar', aprobado_por = NULL
       WHERE uuid = ? AND cliente_conforme = 'no_conforme'`,
      [reporteUUID]
    );

    reporte.cliente_conforme = 'por_confirmar';
    reporte.aprobado_por = null;
  }

  let notificacion;

  try {
    const resultado = await enviarNotificacionAlCliente(reporte);
    notificacion = { success: true, message_id: resultado.messageId };
  } catch (error) {
    if (!(error instanceof HttpError) || error.statusCode !== 502) throw error;
    console.error(`No se pudo notificar al cliente del reporte ${reporteUUID}:`, error.message);
    notificacion = { success: false, error: error.message };
  }

  res.json({
    message: reabierto
      ? 'Reporte reabierto y notificación enviada al cliente'
      : 'Notificación enviada al cliente',
    uuid: reporteUUID,
    conformidad_reabierta: reabierto,
    cliente_conforme: reporte.cliente_conforme,
    notificacion
  });
};
