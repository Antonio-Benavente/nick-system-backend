import pool from '../config/db.js';
import emailService from '../services/email.service.js';

/**
 * Controlador de Notificaciones
 * Maneja el envío de emails a clientes
 */

// =====================================================
// ENVIAR NOTIFICACIÓN DE REPORTE AL CLIENTE
// =====================================================
export const enviarNotificacionReporte = async (req, res) => {
  try {
    const { uuid } = req.params;

    console.log('Iniciando envío de notificación para reporte:', uuid);

    if (!uuid) {
      return res.status(400).json({
        success: false,
        message: 'UUID de reporte no proporcionado',
      });
    }

    // 1. Obtener el reporte completo
    const [reportes] = await pool.query(
      `SELECT
        r.*,
        c.uuid AS cliente_uuid,
        c.nombre AS cliente_nombre,
        c.empresa AS cliente_empresa,
        c.email AS cliente_email,
        t.uuid AS tecnico_uuid,
        t.nombre AS tecnico_nombre,
        t.email AS tecnico_email
      FROM reportes r
      INNER JOIN clientes c ON c.id = r.cliente_id
      INNER JOIN tecnicos t ON t.id = r.tecnico_id
      WHERE r.uuid = ? AND r.estado = 'activo'`,
      [uuid]
    );

    if (reportes.length === 0) {
      return res.status(404).json({
        success: false,
        message: 'Reporte no encontrado o inactivo',
      });
    }

    const reporte = reportes[0];

    // 2. Obtener evidencias del reporte
    const [evidencias] = await pool.query(
      `SELECT uuid, url, tipo, descripcion, orden
       FROM reporte_evidencias
       WHERE reporte_id = ?
       ORDER BY orden ASC`,
      [reporte.id]
    );

    reporte.evidencias = evidencias;

    // 3. Validar email del cliente
    if (!reporte.cliente_email) {
      return res.status(400).json({
        success: false,
        message: 'El cliente no tiene un email registrado',
      });
    }

    console.log('📧 Enviando email a:', reporte.cliente_email);

    // 4. Enviar email
    const emailResult = await emailService.enviarNotificacionReporte(
      reporte,
      reporte.cliente_email,
      reporte.cliente_nombre,
      reporte.cliente_empresa
    );

    if (!emailResult.success) {
      return res.status(500).json({
        success: false,
        message: 'Error al enviar el email',
        error: emailResult.error,
      });
    }

    console.log('✅ Notificación enviada exitosamente');

    return res.status(200).json({
      success: true,
      message: 'Notificación enviada exitosamente',
      email_enviado_a: reporte.cliente_email,
      reporte_uuid: uuid,
      message_id: emailResult.messageId,
    });

  } catch (error) {
    console.error('❌ Error enviando notificación:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al enviar la notificación',
      error: error.message,
    });
  }
};

// =====================================================
// VERIFICAR CONFIGURACIÓN DE EMAIL
// =====================================================
export const verificarConfiguracion = async (req, res) => {
  try {
    const config = {
      resend_configured: !!process.env.RESEND_API_KEY,
      email_from: process.env.EMAIL_FROM || 'No configurado',
      frontend_url: process.env.FRONTEND_URL || 'No configurado',
    };

    // Verificar si la API key está configurada
    if (!config.resend_configured) {
      return res.status(500).json({
        success: false,
        message: 'Resend API Key no está configurada',
        config,
      });
    }

    return res.json({
      success: true,
      message: 'Configuración de email verificada',
      config,
    });

  } catch (error) {
    console.error('Error verificando configuración:', error);
    return res.status(500).json({
      success: false,
      message: 'Error al verificar configuración',
      error: error.message,
    });
  }
};

