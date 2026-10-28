import { crearTicket, ticketPorMensajeExterno, ultimosTicketsPorContacto } from './ticketService.js';
import emailService from './email.service.js';
import { enviarMensajeTexto, enviarSolicitudContacto } from './whatsapp.service.js';
import { bitacora, enmascararEmail, enmascararTelefono } from './bitacora.service.js';
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

export const urlSeguimiento = (uuid) =>
  `${(process.env.FRONTEND_URL || '').replace(/\/+$/, '')}/ticket/${uuid}`;

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
    url: urlSeguimiento(ticket.uuid)
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

// Las etiquetas llegan con tildes, mayúsculas o "ñ", así que se comparan ya normalizadas.
const normalizarEtiqueta = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'n')
    .replace(/[^\w]/g, '')
    .toLowerCase();

/**
 * Única fuente de verdad de las etiquetas. Todo lo demás se deriva de aquí:
 * el parser no mantiene una lista paralela de nombres, así que no pueden
 * desincronizarse. Se descartaron `mensaje`, `error` y `errors` porque
 * "Mensaje de error: ..." colisionaba con texto libre.
 */
const ALIAS_ETIQUETA = {
  empresa: 'empresa',
  compania: 'empresa',
  company: 'empresa',
  nombre: 'nombre',
  cliente: 'nombre',
  name: 'nombre',
  asunto: 'asunto',
  motivo: 'asunto',
  tema: 'asunto',
  problema: 'asunto',
  subject: 'asunto',
  descripcion: 'descripcion',
  desc: 'descripcion',
  detalle: 'descripcion',
  detalles: 'descripcion',
  comentario: 'descripcion',
  comentarios: 'descripcion',
  nota: 'descripcion',
  notas: 'descripcion'
};

// `\b` evita que "username:" active "name:". El separador exige `:` pegado o
// espacios alrededor de `-`/`=`, así "cliente-servidor" no activa "cliente".
const PATRON_ETIQUETA =
  /\b([a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]{3,12})\s*(?::\s*|\s+[-=]\s+)/g;

// Ubica las etiquetas reales: matchea cualquier "palabra:" y descarta las que no
// son alias, para que no partan en trozos los valores ya leídos.
const ubicarEtiquetas = (texto) =>
  [...texto.matchAll(PATRON_ETIQUETA)]
    .map((coincidencia) => ({
      campo: ALIAS_ETIQUETA[normalizarEtiqueta(coincidencia[1])],
      inicio: coincidencia.index,
      fin: coincidencia.index + coincidencia[0].length
    }))
    .filter((marca) => marca.campo);

const CAMPOS_OBLIGATORIOS = ['empresa', 'nombre', 'asunto'];

const ETIQUETA_CAMPO = {
  empresa: '🏢 *Empresa:* nombre de tu empresa',
  nombre: '👤 *Nombre:* tu nombre completo',
  asunto: '📝 *Asunto:* resumen del problema o solicitud',
  descripcion: '📄 *Descripción (opcional):* detalles extra del problema'
};

// Los tres obligatorios más el cuarto, que es opcional.
const LISTA_CAMPOS = [
  ...CAMPOS_OBLIGATORIOS.map((campo) => ETIQUETA_CAMPO[campo]),
  ETIQUETA_CAMPO.descripcion
];

const EJEMPLO_CAMPOS = [
  'Empresa: Acme',
  'Nombre: Juan Pérez',
  'Asunto: Mi computadora no enciende desde esta mañana',
  'Descripción: se queda con luz verde y no arranca'
];

const porComas = (texto) => {
  const partes = texto.split(',').map((parte) => parte.trim());

  if (partes.length < 3) return null;

  return {
    empresa: partes[0],
    nombre: partes[1],
    asunto: partes.slice(2).join(',').trim()
  };
};

// Un valor puede traer líneas extra debajo del campo principal: la primera es el
// campo y las demás son la descripción que el cliente escribió sin etiquetar.
const repartirValor = (valor) => {
  const lineas = String(valor || '')
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean);

  return { principal: lineas[0] || '', sobrante: lineas.slice(1).join('\n').trim() };
};

/**
 * `permitirLibre` habilita los formatos por comas y por 3 líneas. Solo se activa
 * cuando el cliente YA recibió la bienvenida: antes de eso el mensaje es texto
 * libre ("Hola, buenas tardes, mi PC no enciende") y esas reglas fabricarían
 * tickets basura sin pasar por el pedido de datos.
 */
const interpretarMensaje = (texto, { permitirLibre = false } = {}) => {
  const normalizado = String(texto || '').replace(/\r\n?/g, '\n');
  const marcas = ubicarEtiquetas(normalizado);
  const datos = {};
  let sobrante = '';

  marcas.forEach((marca, indice) => {
    const campo = marca.campo;
    const fin = indice + 1 < marcas.length ? marcas[indice + 1].inicio : normalizado.length;
    const bruto = normalizado
      .slice(marca.fin, fin)
      .trim()
      .replace(/[\s,;]+$/, '');

    if (!bruto) return;

    // La descripción se guarda completa, con todas sus líneas: "Descripción:"
    // seguido de varios renglones es texto seguido, no una lista de campos.
    if (campo === 'descripcion') {
      if (datos.descripcion === undefined) datos.descripcion = bruto;
      return;
    }

    const { principal, sobrante: extra } = repartirValor(bruto);

    if (principal && datos[campo] === undefined) {
      datos[campo] = principal;
      if (extra) sobrante = [sobrante, extra].filter(Boolean).join('\n');
    }
  });

  if (datos.descripcion === undefined && sobrante) datos.descripcion = sobrante;

  const etiquetasUsadas = Object.keys(datos).length;

  if (!etiquetasUsadas) {
    if (!permitirLibre) return datos;

    const lineas = normalizado.split('\n').map((linea) => linea.trim()).filter(Boolean);
    if (lineas.length === 3) {
      return { empresa: lineas[0], nombre: lineas[1], asunto: lineas[2], descripcion: normalizado };
    }

    return porComas(normalizado) || datos;
  }

  if (etiquetasUsadas === 1) {
    const unico = Object.keys(datos)[0];
    const desglose = porComas(datos[unico]);

    if (desglose) {
      delete datos[unico];
      return { ...desglose, descripcion: datos.descripcion };
    }
  }

  return datos;
};

export const camposFaltantes = (datos) =>
  CAMPOS_OBLIGATORIOS.filter((campo) => !String(datos?.[campo] || '').trim());

// Cliente preguntando por un caso ya registrado ("¿ya vieron mi caso?").
// Se quitó `mi solicitud` / `mi reporte`: "Quiero registrar mi solicitud" contiene
// la frase y respondía con el estado en vez de con la bienvenida.
const PATRON_CONSULTA_ESTADO =
  /ya\s+(?:vieron|revisaron|revisan|miraron|atendieron|resolvieron|respondieron|contestaron|lo\s+(?:vieron|resolvieron|revisaron)|me\s+(?:respondieron|contestaron|atendieron))\b|mi\s+(?:caso|ticket)\b|\bestado\s+(?:de|del)\b|c[oó]mo\s+va\b|\bavance\s+de\b|\bseguimiento\s+de\b|nadie\s+me\s+(?:responde|atiende|contesta)|nadie\s+(?:ha\s+)?contesta/i;

// Una consulta real es corta. Los intentos de crear un ticket son largos.
const LARGO_CONSULTA_MAXIMO = 120;

const esConsultaEstado = (texto) => {
  const cuerpo = String(texto || '').trim();

  if (!cuerpo || cuerpo.length > LARGO_CONSULTA_MAXIMO) return false;

  return PATRON_CONSULTA_ESTADO.test(cuerpo);
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

// Línea de urgencias. Solo se agrega si hay contacto configurado, para no
// mandar al cliente a un número vacío.
const lineaUrgencia = () => {
  const telefono = String(process.env.TICKET_URGENCIA_TELEFONO || '').trim();
  const correo = String(process.env.TICKET_URGENCIA_EMAIL || '').trim();

  if (!telefono && !correo) return [];

  const contactos = [telefono, correo].filter(Boolean).join(' o ');

  return ['', `🚨 Si es una *urgencia*, llámanos o escríbenos: ${contactos}`];
};

export const mensajeBienvenida = () =>
  [
    `${saludoPorHora()} 👋 Te damos la bienvenida a *Nick System*.`,
    '',
    'Este canal es *solo para registrar tickets de soporte*. Aquí no se resuelven consultas técnicas.',
    '',
    'Para crear tu ticket, envíame en un solo mensaje:',
    '',
    ...LISTA_CAMPOS,
    '',
    '*Ejemplo:*',
    ...EJEMPLO_CAMPOS,
    '',
    'Recibirás un código y un enlace para seguir el estado de tu solicitud.'
  ].join('\n');

export const mensajeTicketCreado = (codigo, url) =>
  [
    '✅ *Tu ticket fue creado correctamente.*',
    '',
    `🎫 Código: *${codigo}*`,
    '',
    '🔎 Consulta el estado aquí:',
    url,
    '',
    'Gracias por contactarnos.',
    ...lineaUrgencia()
  ].join('\n');

export const mensajeConsultaEstado = (codigo, url) =>
  [
    `Ya registramos tu ticket *${codigo}*. Puedes ver su estado aquí: ${url}`,
    '',
    'Si quieres crear una solicitud nueva, envíame Empresa, Nombre y Asunto.'
  ].join('\n');

export const mensajeSinTicket = () =>
  [
    'No tengo solicitudes registradas desde este número.',
    '',
    'Para crear una nueva, envíame en un solo mensaje:',
    '',
    ...LISTA_CAMPOS,
    '',
    '*Ejemplo:*',
    ...EJEMPLO_CAMPOS
  ].join('\n');

// Audios, fotos y documentos: el bot no los lee, hay que decirlo.
export const mensajeSinTexto = (tipo) =>
  [
    `Recibí un *${tipo}* pero por este canal solo puedo leer texto. ✍️`,
    '',
    ...LISTA_CAMPOS
  ].join('\n');

// Meta no manda el teléfono de quienes adoptaron un username (Business-scoped
// User ID, formato PAIS.lo-que-sea). Vía principal: el botón oficial; como
// alternativa, escribir el número como texto. Lo ya aportado queda guardado.
export const mensajePideNumero = () =>
  [
    'Para crear tu ticket necesito tu número de WhatsApp: ese dato no me llegó. 📱',
    '',
    'Toca el botón *Compartir mi número* de abajo,',
    'o escríbeme en un mensaje aparte solo tu número, con prefijo de país (por ejemplo *51987654321*).',
    '',
    'Después, escríbeme los datos de tu caso en un solo mensaje:',
    '',
    ...LISTA_CAMPOS,
    '',
    '*Ejemplo:*',
    ...EJEMPLO_CAMPOS
  ].join('\n');

// Va dentro del cuerpo del botón: número que falta + aviso de que lo ya
// escrito se conserva, con la alternativa de escribir el número como texto.
const pedirNumeroConFaltantes = (recibidos, faltantes) => [
  'Para crear tu ticket necesito tu número de WhatsApp. 📱',
  '',
  'Toca el botón *Compartir mi número* de abajo,',
  'o escríbeme en un mensaje aparte solo tu número, con prefijo de país (por ejemplo *51987654321*).',
  '',
  recibidos.length
    ? `Recibí tu ${enumerar(recibidos)}. Completa con esto en tu siguiente mensaje:`
    : 'En tu siguiente mensaje envía:',
  ...faltantes.map((campo) => `• ${ETIQUETA_CAMPO[campo] || campo}`),
  '',
  'Lo que ya escribiste queda guardado, no necesitas repetirlo.'
].join('\n');

const enumerar = (palabras) => {
  if (palabras.length <= 1) return palabras.join('');
  return `${palabras.slice(0, -1).join(', ')} y ${palabras[palabras.length - 1]}`;
};

// Reconoce lo que ya llegó para que el cliente no sienta que empieza de cero.
export const mensajeFaltanDatos = (recibidos, faltantes) => {
  const recibido = CAMPOS_OBLIGATORIOS.filter((campo) => recibidos.includes(campo));

  const encabezado = recibido.length
    ? `Recibí tu ${enumerar(recibido)}.`
    : 'Todavía no tengo los datos de tu solicitud.';

  return [
    `⚠️ ${encabezado}`,
    '',
    'Me falta:',
    ...faltantes.map((campo) => `• ${ETIQUETA_CAMPO[campo] || campo}`),
    '',
    'Envíame los datos que faltan en un solo mensaje.'
  ].join('\n');
};

const TIPOS_SIN_TEXTO = {
  audio: 'audio',
  image: 'imagen',
  video: 'video',
  document: 'documento',
  sticker: 'sticker',
  location: 'ubicación',
  contacts: 'contacto'
};

// Tras este número de intentos fallidos el ticket se crea igual, con los valores
// por defecto. Evita el bucle infinito de "faltan datos".
const intentosMaximos = () => {
  const valor = Number.parseInt(process.env.WHATSAPP_INTENTOS_MAXIMOS, 10);
  return Number.isFinite(valor) && valor > 0 ? valor : 2;
};

// Ventana para "ya vieron mi caso": evita devolver un ticket de hace meses.
const diasConsultaTicket = () => {
  const valor = Number.parseInt(process.env.WHATSAPP_CONSULTA_TICKET_DIAS, 10);
  return Number.isFinite(valor) && valor > 0 ? valor : 90;
};

/**
 * Número compartido con el botón REQUEST_CONTACT_INFO (origin contact_request,
 * el usuario mismo) o con una tarjeta: Meta lo entrega en phones[].phone.
 */
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

/**
 * Número escrito como texto: solo si el mensaje entero es dígitos (con los
 * separadores habituales). Si no trae prefijo y tiene 9 dígitos (formato
 * local peruano) se le antepone el prefijo del país configurado.
 */
const telefonoEscrito = (texto) => {
  const digitos = String(texto || '')
    .replace(/[+\s().-]/g, '')
    .replace(/^0+/,'');

  if (digitos.length < 9 || digitos.length > 15) return '';
  if (!/^\d+$/.test(digitos)) return '';

  const prefijo = process.env.WHATSAPP_PREFIJO_PAIS || '51';
  return digitos.length === 9 ? prefijo + digitos : digitos;
};

/**
 * Pide el número con el botón de Meta, con la misma idempotencia de `responder`.
 */
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

  // El registro de idempotencia solo cuenta si el envío salió: si Meta lo
  // rechazó lo liberamos para que su reintento pueda volver a intentarlo.
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
    recortar(datos.empresa, LIMITES.empresa) || process.env.TICKET_EMPRESA_WHATSAPP || 'WhatsApp';
  const nombre =
    recortar(datos.nombre, LIMITES.nombre) || recortar(nombreContacto, LIMITES.nombre) || 'Contacto';
  const asunto =
    recortar(datos.asunto, LIMITES.asunto) ||
    recortar(primeraLinea(fuenteTexto), LIMITES.asunto) ||
    'Solicitud por WhatsApp';

  // Si los datos vinieron etiquetados, repetir empresa/nombre/asunto como
  // descripción solo confunde al técnico. El texto libre sí se conserva entero.
  const descripcion =
    recortar(datos.descripcion, LIMITES.descripcion) ||
    (permitirLibre ? recortar(fuenteTexto, LIMITES.descripcion) : '') ||
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
        mensajeTicketCreado(ticket.codigo, urlSeguimiento(ticket.uuid))
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
      mensajeTicketCreado(ticket.codigo, urlSeguimiento(ticket.uuid))
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
    // Datos incompletos: la conversación se reabre con el número, conservando
    // lo ya aportado y los intentos, para que el forzado siga aplicando.
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

  // Datos completos: el ticket se crea de una vez con lo acumulado.
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
        : `no se pudo crear el ticket con sus datos guardados`
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

  // 0) Evento sin remitente: no hay a quién responder ni manera de identificar
  // al usuario. Se bitacorea el objeto crudo (sin el texto del cliente) para
  // identificar qué nos entregó Meta exactamente.
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

  // 0.5) El usuario compartió su número (tocó el botón REQUEST_CONTACT_INFO o
  // nos pasó su tarjeta). Solo importa para remitentes sin teléfono.
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

  // Eventos internos de Meta (cambios de número en 'system', reacciones y
  // ediciones) no son peticiones del usuario: no generan respuesta ni cuentan
  // intentos en ningún remitente, solo se registran.
  if (mensaje.type === 'system' || mensaje.type === 'reaction' || mensaje.type === 'edit') {
    bitacora('whatsapp', `Evento de ${mensaje.type}, no generó respuesta. remitente=${enmascararTelefono(telefono || bsuid)}`);
    return { creado: false, evento_interno: true };
  }

  // 0.6) Remitente identificable solo por BSUID: adoptó un username de Meta y
  // por eso el webhook no trae su teléfono (por ejemplo, contacto de hace más
  // de 30 días). Se acumulan los datos que aporte y se le pide el número con
  // el botón oficial; como alternativa acepta el número escrito como texto,
  // y al llegar, el ticket sale sin repetir nada.
  if (!telefono) {
    // Si el mensaje entero son dígitos, ya nos dio su número.
    if (contenidoTexto && /^\d/.test(contenidoTexto)) {
      const numero = telefonoEscrito(contenidoTexto);

      if (numero) {
        bitacora('whatsapp', `Mensaje de usuario ${enmascararTelefono(bsuid)} → me escribió su número como texto`);
        return await retomarConNumero(bsuid, numero, mensajeId, nombreContacto);
      }
    }

    const conversacion = await obtenerConversacion(bsuid);
    const permitirLibre = Boolean(conversacion);

    // Acumular sin pisar: lo nuevo completa lo que faltaba.
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

    // Persistir el avance antes de responder.
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

  // 1) Audio, foto o documento: no hay nada que interpretar.
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

  // 1) El cliente pregunta por un caso que ya registró. Solo tiene sentido si no
  // tiene una conversación a medias: si le faltan datos, primero hay que crearlos.
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

  // 2) Límite de intentos: el ticket se crea aunque falten datos. Perder a un
  // cliente con una urgencia por no escribir el formato exacto es peor que un
  // ticket con valores por defecto, que el técnico completa al tomar el caso.
  const intentos = Number(conversacion?.intentos || 0);
  const forzarTicket = faltantes.length > 0 && intentos >= intentosMaximos();

  if (faltantes.length && !forzarTicket) {
    if (!conversacion) await abrirConversacion(telefono, mensajeId);
    const total = await sumarIntento(telefono);

    const cuerpo = conversacion
      ? mensajeFaltanDatos(recibidos, faltantes)
      : mensajeBienvenida();

    const respuesta = await responder(telefono, mensajeId, cuerpo);

    // Reenvío de Meta: `responder` ya registró la bitácora correspondiente y
    // el intento no avanzó, así que no repetimos el aviso como si hubiese salido.
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
