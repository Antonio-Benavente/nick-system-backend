import { obtenerReporteNotificable, verificarPermisoNotificar, enviarNotificacionAlCliente } from '../services/notificaciones.service.js';
import { abortar } from '../middlewares/error.middleware.js';
import { config as entorno } from '../config/env.js';

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
  const configuracion = {
    resend_configured: Boolean(entorno.RESEND_API_KEY),
    email_from: entorno.EMAIL_FROM || 'No configurado',
    frontend_url: entorno.FRONTEND_URL || 'No configurado',
    ticket_notificacion_email: entorno.TICKET_NOTIFICACION_EMAIL || 'Desactivada'
  };

  if (!configuracion.resend_configured) {
    console.error('Se consultó la configuración de email pero RESEND_API_KEY no está definida');
    return res.status(503).json({
      success: false,
      message: 'Resend API Key no está configurada',
      config: configuracion
    });
  }

  res.json({
    success: true,
    message: 'Configuración de email verificada',
    config: configuracion
  });
};
