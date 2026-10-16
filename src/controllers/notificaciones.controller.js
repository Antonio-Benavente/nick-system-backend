import { obtenerReporteNotificable, verificarPermisoNotificar, enviarNotificacionAlCliente } from '../services/notificaciones.service.js';
import { abortar } from '../middlewares/error.middleware.js';

export const enviarNotificacionReporte = async (req, res) => {
  const reporte = await obtenerReporteNotificable(req.params.uuid);

  await verificarPermisoNotificar(reporte, req.user);

  const resultado = await enviarNotificacionAlCliente(reporte);

  res.json({
    success: true,
    message: 'Notificación enviada exitosamente',
    email_enviado_a: reporte.cliente_email,
    reporte_uuid: req.params.uuid,
    message_id: resultado.messageId
  });
};

export const verificarConfiguracion = async (req, res) => {
  const config = {
    resend_configured: Boolean(process.env.RESEND_API_KEY),
    email_from: process.env.EMAIL_FROM || 'No configurado',
    frontend_url: process.env.FRONTEND_URL || 'No configurado',
    ticket_notificacion_email: process.env.TICKET_NOTIFICACION_EMAIL || 'Desactivada'
  };

  if (!config.resend_configured) {
    return res.status(503).json({
      success: false,
      message: 'Resend API Key no está configurada',
      config
    });
  }

  res.json({
    success: true,
    message: 'Configuración de email verificada',
    config
  });
};
