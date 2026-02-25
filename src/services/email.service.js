import { Resend } from 'resend';

class EmailService {
  constructor() {
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY no configurada. El servicio de email no funcionará.');
      this.resend = null;
    } else {
      this.resend = new Resend(process.env.RESEND_API_KEY);
      console.log('✅ Resend configurado correctamente');
    }
  }

  async enviarNotificacionReporte(reporte, clienteEmail, clienteNombre, clienteEmpresa) {
    try {
      if (!this.resend) {
        throw new Error('RESEND_API_KEY no configurada en variables de entorno');
      }

      if (!clienteEmail) {
        throw new Error('Email del cliente no proporcionado');
      }

      if (!reporte) {
        throw new Error('Datos del reporte no proporcionados');
      }

      console.log('📧 Enviando email a:', clienteEmail);

      const html = this.generarHTMLCorreo(reporte, clienteNombre, clienteEmpresa);

      const { data, error } = await this.resend.emails.send({
        from: process.env.EMAIL_FROM || 'Nick System <pruebas@nicksystem.com>',
        to: [clienteEmail],
        subject: `📋 Reporte de Servicio - ${reporte.categoria}`,
        html: html,
      });

      if (error) {
        console.error('❌ Error de Resend:', error);
        throw new Error(error.message || 'Error al enviar email');
      }

      console.log('✅ Email enviado exitosamente. ID:', data.id);
      
      return {
        success: true,
        messageId: data.id
      };
    } catch (error) {
      console.error('❌ Error enviando email:', error);
      return {
        success: false,
        error: error.message || 'Error desconocido'
      };
    }
  }

  generarHTMLCorreo(reporte, clienteNombre, clienteEmpresa) {
    const portalUrl = `${process.env.FRONTEND_URL}/login`;
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Reporte de Servicio Técnico</title>
        <style>
          body {
            font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
            line-height: 1.6;
            color: #333;
            margin: 0;
            padding: 0;
            background-color: #f9fafb;
          }
          .container {
            max-width: 600px;
            margin: 0 auto;
            background: white;
            border-radius: 12px;
            overflow: hidden;
            box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);
          }
          .header {
            background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%);
            color: white;
            padding: 40px 30px;
            text-align: center;
          }
          .header h1 {
            margin: 0;
            font-size: 28px;
            font-weight: 700;
          }
          .header p {
            margin: 10px 0 0;
            opacity: 0.9;
            font-size: 16px;
          }
          .content {
            padding: 40px 30px;
          }
          .greeting {
            font-size: 18px;
            color: #1e3a8a;
            margin-bottom: 20px;
            font-weight: 600;
          }
          .message {
            font-size: 16px;
            line-height: 1.7;
            color: #4b5563;
            margin-bottom: 30px;
          }
          .info-card {
            background: #f8fafc;
            border: 1px solid #e2e8f0;
            border-radius: 8px;
            padding: 24px;
            margin-bottom: 30px;
          }
          .info-item {
            display: flex;
            margin-bottom: 12px;
            padding-bottom: 12px;
            border-bottom: 1px solid #e2e8f0;
          }
          .info-item:last-child {
            border-bottom: none;
            margin-bottom: 0;
            padding-bottom: 0;
          }
          .info-label {
            min-width: 140px;
            font-weight: 600;
            color: #475569;
          }
          .info-value {
            color: #1e293b;
            flex: 1;
          }
          .portal-button {
            display: inline-block;
            background: #1e3a8a;
            color: white !important;
            padding: 16px 40px;
            font-size: 18px;
            font-weight: 600;
            text-decoration: none;
            border-radius: 8px;
            text-align: center;
            margin: 20px 0;
          }
          .warning {
            background: #fffbeb;
            border: 2px solid #fbbf24;
            border-radius: 8px;
            padding: 20px;
            margin: 30px 0;
            color: #92400e;
          }
          .footer {
            background: #1e293b;
            color: #cbd5e1;
            padding: 30px;
            text-align: center;
            font-size: 14px;
          }
          .footer a {
            color: #60a5fa;
            text-decoration: none;
          }
          .button-container {
            text-align: center;
            margin: 40px 0;
          }
          @media (max-width: 600px) {
            .content { padding: 25px 20px; }
            .info-item { flex-direction: column; }
            .info-label { min-width: 100%; margin-bottom: 5px; }
            .portal-button { display: block; width: 100%; padding: 18px 20px; }
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔧 Nick System</h1>
            <p>Sistema de Gestión de Servicios Técnicos</p>
          </div>

          <div class="content">
            <div class="greeting">
              Estimado/a ${clienteNombre || "Cliente"} ${clienteEmpresa ? `(${clienteEmpresa})` : ""}
            </div>

            <div class="message">
              Se ha completado un servicio técnico que requiere su revisión y conformidad. 
              El reporte está disponible en nuestro portal con todas las evidencias y detalles del trabajo realizado.
            </div>

            <div class="info-card">
              <div class="info-item">
                <div class="info-label">📋 Categoría:</div>
                <div class="info-value">${reporte.categoria || "No especificado"}</div>
              </div>
              <div class="info-item">
                <div class="info-label">📅 Fecha:</div>
                <div class="info-value">${this.formatearFecha(reporte.fecha)}</div>
              </div>
              <div class="info-item">
                <div class="info-label">👨‍🔧 Técnico:</div>
                <div class="info-value">${reporte.tecnico_nombre || "No especificado"}</div>
              </div>
              <div class="info-item">
                <div class="info-label">📱 Modalidad:</div>
                <div class="info-value">${reporte.modalidad === "presencial" ? "Presencial 👤" : "Remoto 💻"}</div>
              </div>
              <div class="info-item">
                <div class="info-label">📋 Descripción:</div>
                <div class="info-value">${reporte.descripcion || "No especificado"}</div>
              </div>
            </div>

            <div class="warning">
              <strong>⚠️ Acción requerida:</strong> 
              <p>Su conformidad es necesaria para completar el proceso. 
              Por favor ingrese al portal para revisar y confirmar en las próximas 48 horas.</p>
            </div>

            <div class="button-container">
              <a href="${portalUrl}" class="portal-button">
                🔐 Acceder al Portal del Cliente
              </a>
            </div>

            <div style="text-align: center; margin: 30px 0; color: #64748b; font-size: 14px;">
              <p>¿Problemas? <a href="mailto:pruebas@nicksystem.com" style="color: #3b82f6;">Contacte a soporte</a></p>
            </div>
          </div>

          <div class="footer">
            <p><strong>Nick System</strong> - Sistema de Gestión de Servicios Técnicos</p>
            <p>Lima, Perú | 📞 +51 932 473 318 | 📧 pruebas@nicksystem.com</p>
            <p>© ${new Date().getFullYear()} Nick System. Todos los derechos reservados.</p>
            <p style="font-size: 12px; margin-top: 20px; color: #94a3b8;">
              Este es un mensaje automático. No responda a este correo.
            </p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  formatearFecha(fecha) {
    try {
      if (!fecha) return "Fecha no especificada";
      const date = new Date(fecha);
      if (isNaN(date.getTime())) return fecha;
      return date.toLocaleDateString("es-PE", {
        weekday: "long",
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return fecha || "Fecha no especificada";
    }
  }
}

export default new EmailService();