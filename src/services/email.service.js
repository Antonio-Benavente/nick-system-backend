import { Resend } from 'resend';

class EmailService {
  constructor() {
    if (!process.env.RESEND_API_KEY) {
      console.warn('⚠️ RESEND_API_KEY no configurada. El servicio de email no funcionará.');
      this.resend = null;
    } else {
      this.resend = new Resend(process.env.RESEND_API_KEY);
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

      const html = this.generarHTMLCorreo(reporte, clienteNombre, clienteEmpresa);

      const { data, error } = await this.resend.emails.send({
        from: process.env.EMAIL_FROM || 'Nick System <soporte@nicksystem.com>',
        to: [clienteEmail],
        subject: `📋 Reporte de Servicio - ${reporte.categoria}`,
        html: html,
      });

      if (error) {
        console.error('❌ Error de Resend:', error);
        throw new Error(error.message || 'Error al enviar email');
      }

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

  async enviarAcuseTicket({ to, nombre, codigo, url }) {
    try {
      if (!this.resend) {
        throw new Error('RESEND_API_KEY no configurada en variables de entorno');
      }

      if (!to) {
        throw new Error('Destinatario no proporcionado');
      }

      const html = this.generarHTMLAcuse(nombre, codigo, url);

      const { data, error } = await this.resend.emails.send({
        from: process.env.EMAIL_FROM || 'Nick System <soporte@nicksystem.com>',
        to: [to],
        subject: `Recibimos tu solicitud - Ticket ${codigo}`,
        html: html,
      });

      if (error) {
        console.error('❌ Error de Resend:', error);
        throw new Error(error.message || 'Error al enviar email');
      }

      return {
        success: true,
        messageId: data.id
      };
    } catch (error) {
      console.error('❌ Error enviando acuse:', error);
      return {
        success: false,
        error: error.message || 'Error desconocido'
      };
    }
  }

  destinatariosTicketInterno() {
    return String(process.env.TICKET_NOTIFICACION_EMAIL || '')
      .split(',')
      .map((correo) => correo.trim())
      .filter(Boolean);
  }

  async enviarNotificacionTicketInterna({
    empresa,
    nombre,
    asunto,
    descripcion,
    canal = 'correo',
    contactoOrigen,
    codigo,
    url
  }) {
    const destinatarios = this.destinatariosTicketInterno();

    if (!destinatarios.length) {
      return { success: true, omitido: true, messageId: null };
    }

    try {
      if (!this.resend) {
        throw new Error('RESEND_API_KEY no configurada en variables de entorno');
      }

      const html = this.generarHTMLNotificacionTicket({
        empresa,
        nombre,
        asunto,
        descripcion,
        canal,
        contactoOrigen,
        codigo,
        url
      });

      const { data, error } = await this.resend.emails.send({
        from: process.env.EMAIL_FROM || 'Nick System <soporte@nicksystem.com>',
        to: destinatarios,
        subject: `Nuevo ticket por ${canal} - ${codigo}`,
        html: html,
      });

      if (error) {
        console.error('❌ Error de Resend:', error);
        throw new Error(error.message || 'Error al enviar email');
      }

      return {
        success: true,
        messageId: data.id
      };
    } catch (error) {
      console.error('❌ Error enviando notificación interna del ticket:', error);
      return {
        success: false,
        error: error.message || 'Error desconocido'
      };
    }
  }

  async enviarAvisoNoConforme({ codigo, empresa, nombre, asunto, motivo, url }) {
    const destinatarios = this.destinatariosTicketInterno();

    if (!destinatarios.length) {
      return { success: true, omitido: true, messageId: null };
    }

    try {
      if (!this.resend) {
        throw new Error('RESEND_API_KEY no configurada en variables de entorno');
      }

      const html = this.generarHTMLNoConforme({ codigo, empresa, nombre, asunto, motivo, url });

      const { data, error } = await this.resend.emails.send({
        from: process.env.EMAIL_FROM || 'Nick System <soporte@nicksystem.com>',
        to: destinatarios,
        subject: `Ticket ${codigo} marcado como NO CONFORME`,
        html: html,
      });

      if (error) {
        console.error('❌ Error de Resend:', error);
        throw new Error(error.message || 'Error al enviar email');
      }

      return {
        success: true,
        messageId: data.id
      };
    } catch (error) {
      console.error('❌ Error enviando el aviso de ticket no conforme:', error);
      return {
        success: false,
        error: error.message || 'Error desconocido'
      };
    }
  }

  escapeHtml(valor) {
    if (valor === null || valor === undefined) return '';
    return String(valor)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  generarHTMLAcuse(nombre, codigo, url) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Solicitud recibida</title>
      </head>
      <body style="font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #333; background-color: #f9fafb; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 32px 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 24px;">🔧 Nick System</h1>
            <p style="margin: 8px 0 0; opacity: 0.9;">Recibimos tu solicitud</p>
          </div>
          <div style="padding: 32px 24px;">
            <p style="font-size: 16px; color: #1e3a8a; font-weight: 600; margin-top: 0;">
              Hola ${this.escapeHtml(nombre) || 'Cliente'}
            </p>
            <p style="font-size: 16px; line-height: 1.7; color: #4b5563;">
              Gracias por escribirnos. Registramos tu solicitud y un miembro del equipo la atenderá a la brevedad.
            </p>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 24px; margin: 24px 0; text-align: center;">
              <p style="margin: 0; color: #475569; font-size: 14px;">Tu código de ticket</p>
              <p style="margin: 8px 0 0; font-size: 28px; font-weight: 700; color: #1e293b;">${this.escapeHtml(codigo)}</p>
            </div>
            <div style="text-align: center; margin: 32px 0;">
              <a href="${url}" style="display: inline-block; background: #1e3a8a; color: #ffffff; padding: 14px 36px; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Seguir el estado de mi ticket
              </a>
            </div>
            <p style="font-size: 14px; color: #64748b;">¿Problemas? Responde a este correo o escríbenos a soporte@nicksystem.com</p>
          </div>
          <div style="background: #1e293b; color: #cbd5e1; padding: 24px; text-align: center; font-size: 13px;">
            <p style="margin: 0;"><strong>Nick System</strong> - Sistema de Gestión de Servicios Técnicos</p>
            <p style="margin: 8px 0 0;">© ${new Date().getFullYear()} Nick System. Todos los derechos reservados.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generarHTMLNoConforme({ codigo, empresa, nombre, asunto, motivo, url }) {
    const multlinea = (valor) => this.escapeHtml(valor).replace(/\r?\n/g, '<br>');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Ticket ${this.escapeHtml(codigo)} no conforme</title>
      </head>
      <body style="font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #333; background-color: #f9fafb; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <div style="background: linear-gradient(135deg, #991b1b 0%, #dc2626 100%); color: #ffffff; padding: 28px 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 22px;">⚠️ El cliente marcó el servicio como no conforme</h1>
            <p style="margin: 8px 0 0; opacity: 0.9;">${this.escapeHtml(codigo)}</p>
          </div>
          <div style="padding: 28px 24px;">
            <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #475569; font-weight: 600; width: 110px; vertical-align: top;">🏢 Empresa:</td>
                <td style="padding: 10px 0; color: #1e293b;">${this.escapeHtml(empresa) || 'No especificada'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #475569; font-weight: 600; vertical-align: top;">👤 Nombre:</td>
                <td style="padding: 10px 0; color: #1e293b;">${this.escapeHtml(nombre) || 'No especificado'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #475569; font-weight: 600; vertical-align: top;">📌 Asunto:</td>
                <td style="padding: 10px 0; color: #1e293b; font-weight: 600;">${multlinea(asunto) || 'Sin asunto'}</td>
              </tr>
            </table>
            <div style="background: #fef2f2; border: 1px solid #fecaca; border-radius: 8px; padding: 20px; margin-top: 20px;">
              <p style="margin: 0 0 8px 0; color: #991b1b; font-size: 14px; font-weight: 600;">✍️ Motivo que indicó el cliente</p>
              <p style="margin: 0; color: #1e293b; font-size: 15px; line-height: 1.7; white-space: pre-wrap; word-break: break-word;">${multlinea(motivo) || 'No especificó un motivo'}</p>
            </div>
            <p style="margin: 20px 0 0; color: #475569; font-size: 14px;">
              El ticket ya está en estado <strong>atendido</strong> y la conformidad es irreversible desde el portal del cliente.
              Para revertirla o reabrir el trabajo hay que gestionarlo por soporte.
            </p>
            <div style="text-align: center; margin: 28px 0 8px 0;">
              <a href="${url}" style="display: inline-block; background: #991b1b; color: #ffffff; padding: 14px 32px; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Ver el ticket en el portal
              </a>
            </div>
          </div>
          <div style="background: #1e293b; color: #cbd5e1; padding: 20px; text-align: center; font-size: 13px;">
            <p style="margin: 0;"><strong>Nick System</strong> - Sistema de Gestión de Servicios Técnicos</p>
            <p style="margin: 8px 0 0; font-size: 12px; color: #94a3b8;">Este es un mensaje automático. No responda a este correo.</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  generarHTMLNotificacionTicket({ empresa, nombre, asunto, descripcion, canal, contactoOrigen, codigo, url }) {
    const multlinea = (valor) => this.escapeHtml(valor).replace(/\r?\n/g, '<br>');

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Nuevo ticket ${this.escapeHtml(codigo)}</title>
      </head>
      <body style="font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #333; background-color: #f9fafb; margin: 0; padding: 24px;">
        <div style="max-width: 600px; margin: 0 auto; background: #ffffff; border-radius: 12px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
          <div style="background: linear-gradient(135deg, #1e3a8a 0%, #2563eb 100%); color: #ffffff; padding: 28px 24px; text-align: center;">
            <h1 style="margin: 0; font-size: 22px;">🔧 Nuevo ticket entrante</h1>
            <p style="margin: 8px 0 0; opacity: 0.9;">Recibido por ${this.escapeHtml(canal)}</p>
          </div>
          <div style="padding: 28px 24px;">
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-bottom: 20px; text-align: center;">
              <p style="margin: 0; color: #475569; font-size: 14px;">Código de ticket</p>
              <p style="margin: 6px 0 0; font-size: 26px; font-weight: 700; color: #1e293b;">${this.escapeHtml(codigo)}</p>
            </div>
            <table style="width: 100%; border-collapse: collapse; font-size: 15px;">
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #475569; font-weight: 600; width: 110px; vertical-align: top;">🏢 Empresa:</td>
                <td style="padding: 10px 0; color: #1e293b;">${this.escapeHtml(empresa) || 'No especificada'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #475569; font-weight: 600; vertical-align: top;">👤 Nombre:</td>
                <td style="padding: 10px 0; color: #1e293b;">${this.escapeHtml(nombre) || 'No especificado'}</td>
              </tr>
              <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 0; color: #475569; font-weight: 600; vertical-align: top;">📧 Contacto:</td>
                <td style="padding: 10px 0; color: #1e293b; word-break: break-all;">${this.escapeHtml(contactoOrigen) || 'No especificado'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #475569; font-weight: 600; vertical-align: top;">📌 Asunto:</td>
                <td style="padding: 10px 0; color: #1e293b; font-weight: 600;">${multlinea(asunto) || 'Sin asunto'}</td>
              </tr>
            </table>
            <div style="background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 20px; margin-top: 20px;">
              <p style="margin: 0 0 8px 0; color: #475569; font-size: 14px; font-weight: 600;">📝 Descripción</p>
              <p style="margin: 0; color: #1e293b; font-size: 15px; line-height: 1.7; white-space: pre-wrap; word-break: break-word;">${multlinea(descripcion) || 'Sin descripción'}</p>
            </div>
            <div style="text-align: center; margin: 28px 0 8px 0;">
              <a href="${url}" style="display: inline-block; background: #1e3a8a; color: #ffffff; padding: 14px 32px; font-size: 16px; font-weight: 600; text-decoration: none; border-radius: 8px;">
                Ver el ticket en el portal
              </a>
            </div>
          </div>
          <div style="background: #1e293b; color: #cbd5e1; padding: 20px; text-align: center; font-size: 13px;">
            <p style="margin: 0;"><strong>Nick System</strong> - Sistema de Gestión de Servicios Técnicos</p>
            <p style="margin: 8px 0 0; font-size: 12px; color: #94a3b8;">Este es un mensaje automático. No responda a este correo.</p>
          </div>
        </div>
      </body>
      </html>
    `;
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
              Estimado/a ${this.escapeHtml(clienteNombre) || "Cliente"} ${clienteEmpresa ? `(${this.escapeHtml(clienteEmpresa)})` : ""}
            </div>

            <div class="message">
              Se ha completado un servicio técnico que requiere su revisión y conformidad.
              El reporte está disponible en nuestro portal con todas las evidencias y detalles del trabajo realizado.
            </div>

            <div class="info-card">
              <div class="info-item">
                <div class="info-label">📋 Categoría:</div>
                <div class="info-value">${this.escapeHtml(reporte.categoria) || "No especificado"}</div>
              </div>
              <div class="info-item">
                <div class="info-label">📅 Fecha:</div>
                <div class="info-value">${this.formatearFecha(reporte.fecha)}</div>
              </div>
              <div class="info-item">
                <div class="info-label">👨‍🔧 Técnico:</div>
                <div class="info-value">${this.escapeHtml(reporte.tecnico_nombre) || "No especificado"}</div>
              </div>
              <div class="info-item">
                <div class="info-label">📱 Modalidad:</div>
                <div class="info-value">${reporte.modalidad === "presencial" ? "Presencial 👤" : "Remoto 💻"}</div>
              </div>
              <div class="info-item">
                <div class="info-label">📋 Descripción:</div>
                <div class="info-value">${this.escapeHtml(reporte.descripcion) || "No especificado"}</div>
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
              <p>¿Problemas? <a href="mailto:soporte@nicksystem.com" style="color: #3b82f6;">Contacte a soporte</a></p>
            </div>
          </div>

          <div class="footer">
            <p><strong>Nick System</strong> - Sistema de Gestión de Servicios Técnicos</p>
            <p>Lima, Perú | 📞 +51 932 473 318 | 📧 soporte@nicksystem.com</p>
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