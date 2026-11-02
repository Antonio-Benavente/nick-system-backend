import { config } from '../config/env.js';
import { crearTicket, ticketPorMensajeExterno, ultimosTicketsPorContacto } from './ticketService.js';
import emailService from './email.service.js';
import { enviarMensajeTexto, enviarSolicitudContacto } from './whatsapp.service.js';
import { bitacora, enmascararEmail, enmascararTelefono } from './bitacora.service.js';
import {
  CAMPOS_OBLIGATORIOS,
  TIPOS_SIN_TEXTO,
  camposFaltantes,
  interpretarMensaje,
  mensajeBienvenida,
  mensajeConsultaEstado,
  mensajeFaltanDatos,
  mensajePideNumero,
  mensajeSinTexto,
  mensajeSinTicket,
  mensajeTicketCreado,
  pedirNumeroConFaltantes
} from './whatsappParser.service.js';
import {
  obtenerConversacion,
  abrirConversacion,
  cerrarConversacion,
  guardarDatos,
  sumarIntento,
  establecerIntentos,
  registrarMensajeProcesado,
  descartarMensajeProcesado
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
    return config.TICKET_EMPRESA_CORREO;
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

export const urlSeguimiento = (uuid) =>
  `${String(config.FRONTEND_URL || '').replace(/\/+$/, '')}/ticket/${uuid}`;

const esDuplicado = (error) => Boolean(error) && error.code === 'ER_DUP_ENTRY';

const registrar = async (datos) => {
  try {
    const creado = await crearTicket(datos);
    return { creado: true, ...creado };
  } catch (error) {
    if (esDuplicado(error)) {
      // El ticket ya existe (reintento del webhook). Lo recuperamos para poder
      // reenviarle el código al cliente si en su momento no le llegó.
      return {
        creado: false,
        duplicado: true,
        ...((await ticketPorMensajeExterno(datos.mensajeExternoId)) || {})
      };
    }
    throw error;
  }
};

const avisarInterno = async (ticket, datos, canal, canalLog) => {
  const notificacion = await emailService.enviarNotificacionTicketInterna({
    ...datos,
    canal,
    codigo: ticket.codigo,
    url: urlSeguimiento(ticket.uuid),
    fecha: new Date()
  });

  const internos = emailService.destinatariosTicketInterno();

  if (notificacion.omitido) {
    bitacora(canalLog, 'Aviso interno → omitido, TICKET_NOTIFICACION_EMAIL está vacía');
  } else if (!notificacion.success) {
    bitacora(canalLog, `Aviso interno → no se pudo enviar: ${notificacion.error}`);
  } else {
    bitacora(
      canalLog,
      `Aviso interno del ticket ${ticket.codigo} → enviado a ${internos.map(enmascararEmail).join(', ')}`
    );
  }

  return notificacion;
};

const esAutomatico = (correo, email) => {
  if (email && /^(mailer-daemon|postmaster|no-?reply|do-?not-?reply|notifications?)@/i.test(email)) {
    return true;
  }

  const propio = parsearRemitente(config.EMAIL_FROM).email;
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

  const notificacion = await avisarInterno(
    ticket,
    { empresa, nombre, asunto, descripcion, contactoOrigen },
    'correo',
    'resend'
  );

  if (!email) {
    bitacora('resend', `Respuesta a ${remitente} → sin remitente, no pude enviar el acuse`);
    return { ...ticket, notificacion };
  }

  const acuse = await emailService.enviarAcuseTicket({
    to: email,
    nombre,
    codigo: ticket.codigo,
    url: urlTicket,
    asunto,
    descripcion,
    fecha: new Date()
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

// Cliente preguntando por un caso ya registrado ("¿ya vieron mi caso?").
// Se quitó `mi solicitud` / `mi reporte`: "Quiero registrar mi solicitud" contiene
// la frase y respondía con el estado en vez de con la bienvenida.
const PATRON_CONSULTA_ESTADO =
  /ya\s+(?:vieron|revisaron|revisan|miraron|atendieron|resolvieron|respondieron|contestaron|lo\s+(?:vieron|resolvieron|revisaron)|me\s+(?:respondieron|contestaron|atendieron))\b|mi\s+(?:caso|ticket)\b|\bestado\s+(?:de|del)\b|c[oó]mo\s+va\b|\bavance\s+de\b|\bseguimiento\s+de\b|nadie\s+me\s+(?:responde|atiende|contesta)|nadie\s+(?:ha\s+)?contesta/i;

const LARGO_CONSULTA_MAXIMO = 120;

const esConsultaEstado = (texto) => {
  const cuerpo = String(texto || '').trim();

  if (!cuerpo || cuerpo.length > LARGO_CONSULTA_MAXIMO) return false;

  return PATRON_CONSULTA_ESTADO.test(cuerpo);
};

const intentosMaximos = () => config.WHATSAPP_INTENTOS_MAXIMOS;

const diasConsultaTicket = () => config.WHATSAPP_CONSULTA_TICKET_DIAS;

const telefonoCompartido = (mensaje) => {
  if (mensaje.type !== 'contacts') return '';

  for (const tarjeta of mensaje.contacts || []) {
    for (const item of tarjeta.phones || []) {
      const numero = String(item.phone || item.wa_id || '').replace(/\D/g, '');
      if (numero) return numero;
    }
  }

  return '';
};

const telefonoEscrito = (texto) => {
  const digitos = String(texto || '')
    .replace(/[+\s().-]/g, '')
    .replace(/^0+/, '');

  if (digitos.length < 9 || digitos.length > 15) return '';
  if (!/^\d+$/.test(digitos)) return '';

  return digitos.length === 9 ? config.WHATSAPP_PREFIJO_PAIS + digitos : digitos;
};

const responderPedirContacto = async (bsuid, mensajeId, cuerpo) => {
  const esNuevo = await registrarMensajeProcesado(mensajeId, bsuid);

  if (!esNuevo) {
    bitacora(
      'whatsapp',
      `Mensaje de usuario ${enmascararTelefono(bsuid)} → reenvío de Meta, no respondí otra vez`
    );
    return { success: true, duplicado: true };
  }

  const respuesta = await enviarSolicitudContacto(bsuid, cuerpo);

  if (!respuesta.success) {
    await descartarMensajeProcesado(mensajeId).catch(() => {});
  }

  return respuesta;
};

/**
 * Envía una respuesta del bot garantizando una sola vez por wamid. El registro va
 * ANTES del envío para que un reintento de Meta no produzca un segundo mensaje.
 */
const responder = async (telefono, mensajeId, cuerpo) => {
  const esNuevo = await registrarMensajeProcesado(mensajeId, telefono);

  if (!esNuevo) {
    bitacora(
      'whatsapp',
      `Mensaje de ${enmascararTelefono(telefono)} → reenvío de Meta, no respondí otra vez`
    );
    return { success: true, duplicado: true };
  }

  const respuesta = await enviarMensajeTexto(telefono, cuerpo);

  if (!respuesta.success) {
    await descartarMensajeProcesado(mensajeId).catch(() => {});
  }

  return respuesta;
};

/**
 * Crea el ticket a partir de los datos acumulados y le responde a `remitente`
 * con el acuse. `remitente` puede ser un teléfono o un BSUID: enviarMensajeTexto
 * manda a cada uno por su campo correspondiente (to / recipient).
 */
const registrarTicketYAcuse = async ({
  datos,
  fuenteTexto,
  permitirLibre,
  contactoOrigen,
  nombreContacto,
  wamid,
  remitente
}) => {
  const etiqueta = enmascararTelefono(remitente);

  const empresa =
    recortar(datos.empresa, LIMITES.empresa) || config.TICKET_EMPRESA_WHATSAPP;
  const nombre =
    recortar(datos.nombre, LIMITES.nombre) || recortar(nombreContacto, LIMITES.nombre) || 'Contacto';
  const asunto =
    recortar(datos.asunto, LIMITES.asunto) ||
    recortar(primeraLinea(fuenteTexto), LIMITES.asunto) ||
    'Solicitud por WhatsApp';

  const descripcion =
    recortar(datos.descripcion, LIMITES.descripcion) ||
    (!datos.parseado && permitirLibre ? recortar(fuenteTexto, LIMITES.descripcion) : '') ||
    'Sin descripción adicional';

  const ticket = await registrar({
    empresa,
    nombre,
    asunto,
    descripcion,
    canal: 'whatsapp',
    contactoOrigen,
    mensajeExternoId: wamid || null
  });

  if (ticket.duplicado) {
    bitacora('whatsapp', `Mensaje de ${etiqueta} → ese mensaje ya tenía un ticket`);

    // Reintento del webhook. La clave `acuse:<wamid>` ya quedó registrada en el
    // intento anterior, así que `responder` sale sin escribir. Solo entra aquí el
    // caso en que el ticket se creó pero el acuse se perdió: entonces sí lo reenvía.
    if (ticket.codigo) {
      await responder(
        remitente,
        `acuse:${wamid}`,
        mensajeTicketCreado(ticket.codigo, urlSeguimiento(ticket.uuid), { asunto, descripcion })
      );
    }

    return ticket;
  }

  if (!ticket.creado) return ticket;

  const notificacion = await avisarInterno(
    ticket,
    { empresa, nombre, asunto, descripcion, contactoOrigen },
    'whatsapp',
    'whatsapp'
  );

  if (remitente) {
    const acuse = await responder(
      remitente,
      `acuse:${wamid}`,
      mensajeTicketCreado(ticket.codigo, urlSeguimiento(ticket.uuid), { asunto, descripcion })
    );

    if (!acuse.success) {
      bitacora('whatsapp', `Mensaje de ${etiqueta} → creé el ticket ${ticket.codigo} pero el acuse falló: ${acuse.error}`);
      return { ...ticket, acuse, notificacion };
    }

    bitacora('whatsapp', `Mensaje de ${etiqueta} → creé el ticket ${ticket.codigo} y le devolví el código`);

    return { ...ticket, acuse, notificacion };
  }

  bitacora('whatsapp', `Mensaje de ${etiqueta} → creé el ticket ${ticket.codigo}`);

  return { ...ticket, notificacion };
};

/**
 * Llega un número real de un remitente que solo se podía identificar por
 * BSUID: termina la conversación con el BSUID y retoma (o crea el ticket)
 * bajo el número recién compartido, sin pedirle nada de nuevo.
 */
const retomarConNumero = async (bsuid, numero, mensajeId, nombreContacto) => {
  const previa = await obtenerConversacion(bsuid);
  const datosPrevios = previa?.datos || {};
  const faltantes = camposFaltantes(datosPrevios);

  if (previa) await cerrarConversacion(bsuid);

  if (faltantes.length) {
    const recibidos = CAMPOS_OBLIGATORIOS.filter((campo) => !faltantes.includes(campo));

    await abrirConversacion(numero, mensajeId);
    await guardarDatos(numero, datosPrevios);
    const intentosPrevios = Number(previa?.intentos || 0);
    if (intentosPrevios > 0) await establecerIntentos(numero, intentosPrevios);

    const respuesta = await responder(numero, mensajeId, mensajeFaltanDatos(recibidos, faltantes));

    bitacora(
      'whatsapp',
      `Usuario ${enmascararTelefono(bsuid)} compartió el número ${enmascararTelefono(numero)} → ${
        respuesta.success ? `sigue la conversación con esos datos (faltan: ${faltantes.join(', ')})` : `el aviso falló: ${respuesta.error}`
      }`
    );

    return { creado: false, telefono_recibido: true, mensaje: respuesta };
  }

  const resultado = await registrarTicketYAcuse({
    datos: datosPrevios,
    fuenteTexto: datosPrevios.descripcion || '',
    permitirLibre: true,
    contactoOrigen: recortar(numero, LIMITES.empresa) || null,
    nombreContacto,
    wamid: mensajeId,
    remitente: numero
  });

  bitacora(
    'whatsapp',
    `Usuario ${enmascararTelefono(bsuid)} compartió el número ${enmascararTelefono(numero)} → ${
      resultado.creado
        ? `creé el ticket ${resultado.codigo} con sus datos guardados, sin pedirle nada de nuevo`
        : 'no se pudo crear el ticket con sus datos guardados'
    }`
  );

  return { ...resultado, telefono_recibido: true };
};

export const ingestarWhatsapp = async (mensaje, contacto) => {
  const telefono = mensaje.from || (contacto && contacto.wa_id) || '';
  const bsuid = (mensaje.from_user_id || (contacto && contacto.user_id) || '').trim();
  const nombreContacto = (contacto && contacto.profile && contacto.profile.name) || telefono;
  const contenidoTexto = contenidoWhatsapp(mensaje).trim();
  const contenido = contenidoTexto || `[Mensaje recibido de tipo ${mensaje.type || 'desconocido'}]`;
  const mensajeId = mensaje.id || `sin-id-${Date.now()}`;

  if (!telefono && !bsuid) {
    const depurar = (objeto) =>
      JSON.stringify(objeto, (clave, valor) =>
        ['text', 'body', 'caption', 'audio', 'image', 'video', 'document', 'sticker', 'location', 'contacts'].includes(clave)
          ? '[contenido oculto]'
          : valor
      );

    bitacora(
      'whatsapp',
      `Evento sin remitente (tipo ${mensaje.type || 'desconocido'}), lo ignoro. mensaje=${depurar(mensaje)} contacto=${depurar(contacto || {})}`
    );
    return { creado: false, sin_remitente: true };
  }

  if (!telefono && mensaje.type === 'contacts') {
    const numero = telefonoCompartido(mensaje);

    if (!numero) {
      const respuesta = await responderPedirContacto(bsuid, mensajeId, mensajePideNumero());
      bitacora(
        'whatsapp',
        `Mensaje de usuario ${enmascararTelefono(bsuid)} → compartió un contacto sin teléfono${respuesta.duplicado ? ' (reenvío de Meta)' : ' utilizable'}`
      );
      return { creado: false, sin_telefono: true, mensaje: respuesta };
    }

    return await retomarConNumero(bsuid, numero, mensajeId, nombreContacto);
  }

  if (mensaje.type === 'system' || mensaje.type === 'reaction' || mensaje.type === 'edit') {
    bitacora('whatsapp', `Evento de ${mensaje.type}, no generó respuesta. remitente=${enmascararTelefono(telefono || bsuid)}`);
    return { creado: false, evento_interno: true };
  }

  if (!telefono) {
    if (contenidoTexto && /^\d/.test(contenidoTexto)) {
      const numero = telefonoEscrito(contenidoTexto);

      if (numero) {
        bitacora('whatsapp', `Mensaje de usuario ${enmascararTelefono(bsuid)} → me escribió su número como texto`);
        return await retomarConNumero(bsuid, numero, mensajeId, nombreContacto);
      }
    }

    const conversacion = await obtenerConversacion(bsuid);
    const permitirLibre = Boolean(conversacion);

    const acumulados = { ...(conversacion?.datos || {}) };
    const interpretados = interpretarMensaje(contenido, { permitirLibre });
    for (const campo of CAMPOS_OBLIGATORIOS) {
      if (interpretados[campo] && !acumulados[campo]) {
        acumulados[campo] = recortar(interpretados[campo], LIMITES[campo] || LIMITES.asunto);
      }
    }
    if (interpretados.descripcion && !acumulados.descripcion) {
      acumulados.descripcion = recortar(interpretados.descripcion, LIMITES.descripcion);
    }

    const faltantes = camposFaltantes(acumulados);
    const recibidos = CAMPOS_OBLIGATORIOS.filter((campo) => !faltantes.includes(campo));

    if (!conversacion) await abrirConversacion(bsuid, mensajeId);
    await sumarIntento(bsuid);
    await guardarDatos(bsuid, acumulados);

    const respuesta = await responderPedirContacto(
      bsuid,
      mensajeId,
      faltantes.length
        ? pedirNumeroConFaltantes(recibidos, faltantes)
        : mensajePideNumero()
    );

    bitacora(
      'whatsapp',
      `Mensaje de usuario ${enmascararTelefono(bsuid)} (sin teléfono en el webhook) → ${
        respuesta.duplicado
          ? 'reenvío de Meta, no respondí otra vez'
          : respuesta.success
            ? `le pedí que comparta su número con el botón (guardé: ${recibidos.length ? recibidos.join(', ') : 'nada'}, faltan: ${faltantes.length ? faltantes.join(', ') : 'nada'})`
            : `no pude pedirle el número: ${respuesta.error}`
      }`
    );

    return { creado: false, sin_telefono: true, mensaje: respuesta };
  }

  if (!contenidoTexto && TIPOS_SIN_TEXTO[mensaje.type]) {
    await responder(telefono, mensajeId, mensajeSinTexto(TIPOS_SIN_TEXTO[mensaje.type]));
    bitacora(
      'whatsapp',
      `Mensaje de ${enmascararTelefono(telefono)} → llegó ${mensaje.type}, le pedí que lo escriba`
    );
    return { creado: false, sin_texto: true };
  }

  const conversacion = await obtenerConversacion(telefono);
  const permitirLibre = Boolean(conversacion);

  const datos = interpretarMensaje(contenido, { permitirLibre });
  const faltantes = camposFaltantes(datos);
  const recibidos = CAMPOS_OBLIGATORIOS.filter((campo) => !faltantes.includes(campo));

  if (faltantes.length && !conversacion && esConsultaEstado(contenido)) {
    const [ultimo] = await ultimosTicketsPorContacto(recortar(telefono, LIMITES.empresa), {
      dias: diasConsultaTicket()
    });

    const cuerpo = ultimo
      ? mensajeConsultaEstado(ultimo.codigo, urlSeguimiento(ultimo.uuid))
      : mensajeSinTicket();

    const respuesta = await responder(telefono, mensajeId, cuerpo);

    if (!ultimo) await abrirConversacion(telefono, mensajeId);

    bitacora(
      'whatsapp',
      ultimo
        ? `Mensaje de ${enmascararTelefono(telefono)} → le devolví el estado del ticket ${ultimo.codigo}`
        : `Mensaje de ${enmascararTelefono(telefono)} → preguntó por su caso pero no tiene tickets`
    );

    return { creado: false, consulta_estado: true, ticket: ultimo || null, mensaje: respuesta };
  }

  const intentos = Number(conversacion?.intentos || 0);
  const forzarTicket = faltantes.length > 0 && intentos >= intentosMaximos();

  if (faltantes.length && !forzarTicket) {
    if (!conversacion) await abrirConversacion(telefono, mensajeId);
    const total = await sumarIntento(telefono);

    const cuerpo = conversacion
      ? mensajeFaltanDatos(recibidos, faltantes)
      : mensajeBienvenida();

    const respuesta = await responder(telefono, mensajeId, cuerpo);

    if (respuesta.duplicado) {
      return { creado: false, esperando_datos: true, faltantes, mensaje: respuesta };
    }

    if (!respuesta.success) {
      bitacora(
        'whatsapp',
        `Mensaje de ${enmascararTelefono(telefono)} → falló la bienvenida: ${respuesta.error}`
      );
      return { creado: false, esperando_datos: true, faltantes, mensaje: respuesta };
    }

    bitacora(
      'whatsapp',
      `Mensaje de ${enmascararTelefono(telefono)} → ${
        conversacion ? 'faltan datos' : 'respondí pidiendo los datos'
      } (intento ${total})`
    );

    return { creado: false, esperando_datos: true, faltantes, mensaje: respuesta };
  }

  if (forzarTicket) {
    bitacora(
      'whatsapp',
      `Mensaje de ${enmascararTelefono(telefono)} → ${intentos} intentos sin formato, creo el ticket igual`
    );
  }

  await cerrarConversacion(telefono);

  return await registrarTicketYAcuse({
    datos,
    fuenteTexto: contenido,
    permitirLibre,
    contactoOrigen: recortar(telefono, LIMITES.empresa) || null,
    nombreContacto,
    wamid: mensaje.id || null,
    remitente: telefono
  });
};
