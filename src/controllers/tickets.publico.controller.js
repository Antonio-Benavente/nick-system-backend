import pool from '../config/db.js';
import { REGEX_CODIGO_TICKET, registrarConformidad } from '../services/ticketService.js';
import { bitacora } from '../services/bitacora.service.js';
import emailService from '../services/email.service.js';
import { urlSeguimiento } from '../services/ticketIngesta.service.js';
import { abortar } from '../middlewares/error.middleware.js';
import { config } from '../config/env.js';
import { formatearFechaHoraLima } from '../utils/fechas.js';
import { esquemaConformidadPublica, validarConZod } from '../validators/schemas.js';
import { esUUID, validarConformidad } from '../validators/ticketValidators.js';
import { ERRORES_TRANSICION } from './tickets.comun.js';

export const seguimientoPublico = async (req, res) => {
  const identificador = String(req.params.uuid || '').trim().toUpperCase();
  const esCodigoTicket = REGEX_CODIGO_TICKET.test(identificador);

  if (!esUUID(identificador) && !esCodigoTicket) {
    throw abortar(404, 'Ticket no encontrado');
  }

  const condicion = esUUID(identificador) ? 'uuid = ?' : 'codigo = ?';

  const [filas] = await pool.query(
    `SELECT uuid, codigo, asunto, estado, cliente_conforme, aprobado_por,
            fecha_conformidad, motivo_no_conforme, created_at, fecha_asignacion,
            fecha_inicio_servicio, fecha_cierre
     FROM tickets WHERE ${condicion}`,
    [identificador]
  );

  if (!filas.length) throw abortar(404, 'Ticket no encontrado');

  const ticket = filas[0];

  res.set('Cache-Control', 'no-store');
  res.json({
    ...ticket,
    created_at_lima: formatearFechaHoraLima(ticket.created_at),
    fecha_asignacion_lima: formatearFechaHoraLima(ticket.fecha_asignacion),
    fecha_inicio_servicio_lima: formatearFechaHoraLima(ticket.fecha_inicio_servicio),
    fecha_cierre_lima: formatearFechaHoraLima(ticket.fecha_cierre),
    fecha_conformidad_lima: formatearFechaHoraLima(ticket.fecha_conformidad)
  });
};

export const registrarConformidadPublico = async (req, res) => {
  if (!esUUID(String(req.params.uuid || '').trim())) {
    throw abortar(404, 'Ticket no encontrado');
  }

  validarConZod(esquemaConformidadPublica, req.body, {
    modo: config.FF_ZOD_VALIDATION,
    contexto: 'conformidad pública'
  });

  const { conforme, aprobadoPor, motivo } = validarConformidad(req.body);

  const resultado = await registrarConformidad(req.params.uuid, { conforme, aprobadoPor, motivo });

  if (resultado !== 'ok') {
    const [codigo, message] = ERRORES_TRANSICION[resultado];
    return res.status(codigo).json({ message });
  }

  const [filas] = await pool.query(
    `SELECT uuid, codigo, empresa_solicitante, nombre_solicitante, asunto,
            cliente_conforme, aprobado_por, motivo_no_conforme, fecha_conformidad
     FROM tickets WHERE uuid = ?`,
    [req.params.uuid]
  );

  const ticket = filas[0];

  bitacora(
    'publico',
    `Ticket ${ticket.codigo} → el cliente lo marcó como ${conforme ? 'conforme' : 'no conforme'}`
  );

  if (!conforme) {
    const aviso = await emailService.enviarAvisoNoConforme({
      codigo: ticket.codigo,
      empresa: ticket.empresa_solicitante,
      nombre: ticket.nombre_solicitante,
      asunto: ticket.asunto,
      motivo,
      url: urlSeguimiento(ticket.uuid)
    });

    if (aviso.omitido) {
      bitacora('publico', `Aviso de no conforme → omitido, TICKET_NOTIFICACION_EMAIL está vacía`);
    } else if (!aviso.success) {
      bitacora('publico', `Aviso de no conforme → no se pudo enviar: ${aviso.error}`);
    }
  }

  res.json(ticket);
};
