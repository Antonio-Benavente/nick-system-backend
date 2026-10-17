import { crearTicket } from './ticketService.js';
import emailService from './email.service.js';
import { enviarMensajeTexto } from './whatsapp.service.js';
import { bitacora, enmascararEmail, enmascararTelefono } from './bitacora.service.js';
import {
  abrirConversacion,
  cerrarConversacion,
  hayConversacionAbierta
} from './whatsappConversacion.service.js';

const LIMITES = { empresa: 150, nombre: 100, asunto: 150, descripcion: 2000 };

const PROVEEDORES_GRATUITOS = new Set([
  'gmail.com',
  'googlemail.com',
  'outlook.com',
  'hotmail.com',
  'live.com',
  'msn.com',
  'yahoo.com',
  'yahoo.es',
  'icloud.com',
  'me.com',
  'protonmail.com',
  'proton.me',
  'gmx.com',
  'aol.com'
]);

const recortar = (valor, max) => (typeof valor === 'string' ? valor.trim().slice(0, max) : '');

const primeraLinea = (texto) =>
  (String(texto || '')
    .split('\n')
    .find((linea) => linea.trim()) || ''
  ).trim();

const parsearRemitente = (from) => {
  const texto = String(from || '').trim();
  const coincidencia = texto.match(/^(.*)<([^>]+)>\s*$/);

  if (coincidencia) {
    return {
      nombre: coincidencia[1].replace(/^"|"$/g, '').trim(),
      email: coincidencia[2].trim().toLowerCase()
    };
  }

  return { nombre: '', email: texto.toLowerCase() };
};

const empresaDesdeCorreo = (email) => {
  const dominio = email.split('@')[1] || '';

  if (!dominio || PROVEEDORES_GRATUITOS.has(dominio)) {
    return process.env.TICKET_EMPRESA_CORREO || 'G';
  }

  return dominio.slice(0, LIMITES.empresa);
};

const htmlATexto = (html) =>
  String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|li|h[1-6])>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#39;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

const urlSeguimiento = (uuid) =>
  `${(process.env.FRONTEND_URL || '').replace(/\/+$/, '')}/ticket/${uuid}`;

const esDuplicado = (error) => Boolean(error) && error.code === 'ER_DUP_ENTRY';

const registrar = async (datos) => {
  try {
    const creado = await crearTicket(datos);
    return { creado: true, ...creado };
  } catch (error) {
    if (esDuplicado(error)) return { creado: false, duplicado: true };
    throw error;
  }
};

const esAutomatico = (correo, email) => {
  if (email && /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|notifications?)@/i.test(email)) {
    return true;
  }

  const propio = parsearRemitente(process.env.EMAIL_FROM).email;
  if (email && propio && email === propio) return true;

  const autoSubmitted = correo.headers && correo.headers['auto-submitted'];
  if (autoSubmitted && String(autoSubmitted).toLowerCase() !== 'no') return true;

  return false;
};

export const ingestarCorreo = async (correo) => {
  const { nombre: nombreRemitente, email } = parsearRemitente(correo.from);
  const remitente = enmascararEmail(email);

  if (esAutomatico(correo, email)) {
    return { creado: false, ignorado: true };
  }

  const cuerpo = correo.text ? correo.text.trim() : htmlATexto(correo.html);
  const destino = email || (Array.isArray(correo.to) ? correo.to[0] : correo.to) || '';

  const empresa = empresaDesdeCorreo(email);
  const nombre = recortar(nombreRemitente, LIMITES.nombre) || recortar(email.split('@')[0], LIMITES.nombre) || 'Remitente';
  const asunto = recortar(correo.subject, LIMITES.asunto) || 'Solicitud por correo';
  const descripcion = recortar(cuerpo, LIMITES.descripcion) || 'Sin descripción';
  const contactoOrigen = recortar(destino, LIMITES.empresa) || null;

  const ticket = await registrar({
    empresa,
    nombre,
    asunto,
    descripcion,
    canal: 'correo',
    contactoOrigen,
    mensajeExternoId: correo.id || null
  });

  if (ticket.duplicado) {
    bitacora('resend', `Mensaje de ${remitente} → ese mensaje ya tenía un ticket`);
    return ticket;
  }

  if (!ticket.creado) return ticket;

  bitacora('resend', `Mensaje de ${remitente} → ticket ${ticket.codigo} creado`);

  const urlTicket = urlSeguimiento(ticket.uuid);

  const notificacion = await emailService.enviarNotificacionTicketInterna({
    empresa,
    nombre,
    asunto,
    descripcion,
    canal: 'correo',
    contactoOrigen,
    codigo: ticket.codigo,
    url: urlTicket
  });

  const internos = emailService.destinatariosTicketInterno();

  if (notificacion.omitido) {
    bitacora('resend', 'Aviso interno → omitido, TICKET_NOTIFICACION_EMAIL está vacía');
  } else if (!notificacion.success) {
    bitacora('resend', `Aviso interno → no se pudo enviar: ${notificacion.error}`);
  } else {
    bitacora(
      'resend',
      `Aviso interno del ticket ${ticket.codigo} → enviado a ${internos.map(enmascararEmail).join(', ')}`
    );
  }

  if (!email) {
    bitacora('resend', `Respuesta a ${remitente} → sin remitente, no pude enviar el acuse`);
    return { ...ticket, notificacion };
  }

  const acuse = await emailService.enviarAcuseTicket({
    to: email,
    nombre,
    codigo: ticket.codigo,
    url: urlTicket
  });

  if (!acuse.success) {
    bitacora('resend', `Respuesta a ${remitente} → no pude enviar el acuse: ${acuse.error}`);
  } else {
    bitacora('resend', `Respuesta a ${remitente} → le envié el acuse con el código ${ticket.codigo}`);
  }

  return { ...ticket, acuse, notificacion };
};

const contenidoWhatsapp = (mensaje) => {
  if (mensaje.type === 'text') return mensaje.text?.body || '';

  const detalle = mensaje[mensaje.type];
  if (detalle && typeof detalle === 'object') {
    return detalle.caption || detalle.body || '';
  }

  return '';
};

const CAMPOS_MENSAJE = {
  empresa: /^\s*(?:empresa|compa[nñ][ií]a|company)\s*[:\-=]\s*(.+)$/im,
  nombre: /^\s*(?:nombre|cliente|name)\s*[:\-=]\s*(.+)$/im,
  asunto: /^\s*(?:asunto|motivo|tema|problema|subject)\s*[:\-=]\s*(.+)$/im
};

const interpretarMensaje = (texto) => {
  const datos = {};

  for (const [campo, patron] of Object.entries(CAMPOS_MENSAJE)) {
    const coincidencia = texto.match(patron);
    if (coincidencia) datos[campo] = coincidencia[1].trim();
  }

  if (Object.keys(datos).length) return datos;

  const lineas = texto.split('\n').map((linea) => linea.trim()).filter(Boolean);
  if (lineas.length === 3) {
    return { empresa: lineas[0], nombre: lineas[1], asunto: lineas[2] };
  }

  const partes = texto.split(',');
  if (partes.length >= 3) {
    return {
      empresa: partes[0].trim(),
      nombre: partes[1].trim(),
      asunto: partes.slice(2).join(',').trim()
    };
  }

  return datos;
};

const saludoPorHora = () => {
  const hora = Number.parseInt(
    new Intl.DateTimeFormat('en-US', { timeZone: 'America/Lima', hour: '2-digit', hour12: false }).format(new Date()),
    10
  );

  if (hora < 12) return 'Buenos días';
  if (hora < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

export const mensajeBienvenida = () =>
  [
    `${saludoPorHora()}, soy soporte de Nick System.`,
    '',
    'Para registrar tu solicitud necesito que me envíes estos datos:',
    '',
    'Empresa: (nombre de tu empresa)',
    'Nombre: (tu nombre completo)',
    'Asunto: (describe el problema)',
    '',
    'Ejemplo:',
    'Empresa: Acme',
    'Nombre: Juan Perez',
    'Asunto: Mi PC no enciende'
  ].join('\n');

export const mensajeTicketCreado = (codigo, url) =>
  ['Ticket creado.', '', `Tu código es ${codigo}.`, `Puedes seguir su estado aquí: ${url}`].join('\n');

export const ingestarWhatsapp = async (mensaje, contacto) => {
  const telefono = mensaje.from || (contacto && contacto.wa_id) || '';
  const nombreContacto = (contacto && contacto.profile && contacto.profile.name) || telefono;
  const contenido =
    contenidoWhatsapp(mensaje).trim() || `[Mensaje recibido de tipo ${mensaje.type || 'desconocido'}]`;
  const datos = interpretarMensaje(contenido);

  const conversacionAbierta = await hayConversacionAbierta(telefono);

  if (!conversacionAbierta) {
    const esNuevo = await abrirConversacion(telefono, mensaje.id || `sin-id-${Date.now()}`);

    if (!esNuevo) {
      bitacora('whatsapp', `Mensaje de ${enmascararTelefono(telefono)} → ya estaba procesado, no hice nada`);
      return { creado: false, duplicado: true };
    }

    const respuesta = await enviarMensajeTexto(telefono, mensajeBienvenida());

    if (!respuesta.success) {
      bitacora('whatsapp', `Mensaje de ${enmascararTelefono(telefono)} → falló la bienvenida: ${respuesta.error}`);
      return { creado: false, esperando_datos: true, mensaje: respuesta };
    }

    bitacora('whatsapp', `Mensaje de ${enmascararTelefono(telefono)} → respondí pidiendo los datos`);

    return { creado: false, esperando_datos: true, mensaje: respuesta };
  }

  await cerrarConversacion(telefono);

  const ticket = await registrar({
    empresa: recortar(datos.empresa, LIMITES.empresa) || process.env.TICKET_EMPRESA_WHATSAPP || 'WhatsApp',
    nombre: recortar(datos.nombre, LIMITES.nombre) || recortar(nombreContacto, LIMITES.nombre) || 'Contacto',
    asunto: recortar(datos.asunto, LIMITES.asunto) || recortar(primeraLinea(contenido), LIMITES.asunto) || 'Solicitud por WhatsApp',
    descripcion: recortar(contenido, LIMITES.descripcion) || 'Sin descripción',
    canal: 'whatsapp',
    contactoOrigen: recortar(telefono, LIMITES.empresa) || null,
    mensajeExternoId: mensaje.id || null
  });

  if (ticket.duplicado) {
    bitacora('whatsapp', `Mensaje de ${enmascararTelefono(telefono)} → ese mensaje ya tenía un ticket`);
    return ticket;
  }

  if (ticket.creado && telefono) {
    const acuse = await enviarMensajeTexto(
      telefono,
      mensajeTicketCreado(ticket.codigo, urlSeguimiento(ticket.uuid))
    );

    if (!acuse.success) {
      bitacora('whatsapp', `Mensaje de ${enmascararTelefono(telefono)} → creé el ticket ${ticket.codigo} pero el acuse falló: ${acuse.error}`);
      return { ...ticket, acuse };
    }

    bitacora('whatsapp', `Mensaje de ${enmascararTelefono(telefono)} → creé el ticket ${ticket.codigo} y le devolví el código`);

    return { ...ticket, acuse };
  }

  if (ticket.creado) {
    bitacora('whatsapp', `Mensaje de ${enmascararTelefono(telefono)} → creé el ticket ${ticket.codigo}`);
    return ticket;
  }

  return ticket;
};
