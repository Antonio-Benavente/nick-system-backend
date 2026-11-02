import { config } from '../config/env.js';
import { saludoLima } from '../utils/fechas.js';

const normalizarEtiqueta = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/ñ/gi, 'n')
    .replace(/[^\w]/g, '')
    .toLowerCase();

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

const PATRON_ETIQUETA =
  /\b([a-zA-ZÁÉÍÓÚÜÑáéíóúüñ]{3,12})\s*(?::\s*|\s+[-=]\s+)/g;

const ubicarEtiquetas = (texto) =>
  [...texto.matchAll(PATRON_ETIQUETA)]
    .map((coincidencia) => ({
      campo: ALIAS_ETIQUETA[normalizarEtiqueta(coincidencia[1])],
      inicio: coincidencia.index,
      fin: coincidencia.index + coincidencia[0].length
    }))
    .filter((marca) => marca.campo);

export const CAMPOS_OBLIGATORIOS = ['empresa', 'nombre', 'asunto'];

export const ETIQUETA_CAMPO = {
  empresa: 'Empresa: nombre de tu empresa',
  nombre: 'Nombre: tu nombre completo',
  asunto: 'Asunto: resumen del problema o solicitud',
  descripcion: 'Descripción: nombre, número de celular y ubicación de la persona a contactar'
};

export const LISTA_CAMPOS = [
  '🏢 *Empresa:* nombre de tu empresa',
  '👤 *Nombre:* tu nombre completo',
  '📝 *Asunto:* resumen del problema o solicitud',
  '📄 *Descripción:* Nombre, número de celular y ubicación de la persona a contactar'
];

const EJEMPLO_CAMPOS = [
  'Empresa: Acme',
  'Nombre: Juan Pérez',
  'Asunto: Mi computadora no enciende desde esta mañana',
  'Descripción: llamar a Juanito 999999999 tienda ate'
];

const EJEMPLO_COMAS = 'Acme, Juan Pérez, Mi computadora no enciende desde esta mañana, llamar a Juanito 999999999 tienda ate';

const marcarParseado = (datos) => {
  Object.defineProperty(datos, 'parseado', { value: true, enumerable: false });
  return datos;
};

const porComas = (texto) => {
  const partes = String(texto || '')
    .split(',')
    .map((parte) => parte.trim());

  if (partes.length < 3) return null;
  if (partes.slice(0, 3).some((parte) => !parte)) return null;

  return marcarParseado({
    empresa: partes[0],
    nombre: partes[1],
    asunto: partes[2],
    descripcion: partes.slice(3).join(', ').trim()
  });
};

const repartirValor = (valor) => {
  const lineas = String(valor || '')
    .split('\n')
    .map((linea) => linea.trim())
    .filter(Boolean);

  return { principal: lineas[0] || '', sobrante: lineas.slice(1).join('\n').trim() };
};

export const interpretarMensaje = (texto, { permitirLibre = false } = {}) => {
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

    const lineas = normalizado
      .split('\n')
      .map((linea) => linea.trim())
      .filter(Boolean);

    if (lineas.length >= 4) {
      return marcarParseado({
        empresa: lineas[0],
        nombre: lineas[1],
        asunto: lineas[2],
        descripcion: lineas.slice(3).join('\n')
      });
    }

    if (lineas.length === 3) {
      return marcarParseado({
        empresa: lineas[0],
        nombre: lineas[1],
        asunto: lineas[2],
        descripcion: ''
      });
    }

    return porComas(normalizado) || datos;
  }

  if (etiquetasUsadas === 1) {
    const unico = Object.keys(datos)[0];
    const desglose = porComas(datos[unico]);

    if (desglose) {
      return marcarParseado({
        ...desglose,
        descripcion: datos.descripcion || desglose.descripcion
      });
    }
  }

  return marcarParseado(datos);
};

export const camposFaltantes = (datos) =>
  CAMPOS_OBLIGATORIOS.filter((campo) => !String(datos?.[campo] || '').trim());

const enumerar = (palabras) => {
  if (palabras.length <= 1) return palabras.join('');
  return `${palabras.slice(0, -1).join(', ')} y ${palabras[palabras.length - 1]}`;
};

const lineaUrgencia = () => {
  const telefono = config.TICKET_URGENCIA_TELEFONO || '';
  const correo = config.TICKET_URGENCIA_EMAIL || '';

  if (!telefono && !correo) return [];

  const contactos = [telefono, correo].filter(Boolean).join(' o ');

  return ['', `🚨 Si es una *urgencia*, llámanos o escríbenos: ${contactos}`];
};

export const mensajeBienvenida = () =>
  [
    `${saludoLima()} 👋 Te damos la bienvenida a Nick System.`,
    '',
    'Este canal es solo para registrar tickets de soporte. Aquí no se resuelven consultas técnicas.',
    '',
    'Para crear tu ticket, envíame en un solo mensaje:',
    '',
    ...LISTA_CAMPOS,
    '',
    'Ejemplo:',
    ...EJEMPLO_CAMPOS,
    '',
    'Ejemplo 2:',
    EJEMPLO_COMAS,
    '',
    'Recibirás un código y un enlace para seguir el estado de tu solicitud.',
    ...lineaUrgencia()
  ].join('\n');

export const mensajeTicketCreado = (codigo, url, { asunto, descripcion } = {}) => {
  const detalle = [];

  if (asunto) detalle.push(`📝 Asunto: ${asunto}`);
  if (descripcion) detalle.push(`📄 Descripción: ${descripcion}`);

  return [
    '✅ *Tu ticket fue creado correctamente.*',
    '',
    `🎫 Código: *${codigo}*`,
    ...(detalle.length ? ['', ...detalle] : []),
    '',
    '🔎 Consulta el estado aquí:',
    url,
    '',
    'Gracias por contactarnos.',
    ...lineaUrgencia()
  ].join('\n');
};

export const mensajeConsultaEstado = (codigo, url) =>
  [
    `Ya registramos tu ticket *${codigo}*. Puedes ver su estado aquí: ${url}`,
    '',
    'Si quieres crear una solicitud nueva, envíame Empresa, Nombre, Asunto y Descripción.'
  ].join('\n');

export const mensajeSinTicket = () =>
  [
    'No tengo solicitudes registradas desde este número.',
    '',
    'Para crear una nueva, envíame en un solo mensaje:',
    '',
    ...LISTA_CAMPOS,
    '',
    'Ejemplo:',
    ...EJEMPLO_CAMPOS
  ].join('\n');

export const mensajeSinTexto = (tipo) =>
  [
    `Recibí un *${tipo}* pero por este canal solo puedo leer texto. ✍️`,
    '',
    ...LISTA_CAMPOS
  ].join('\n');

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
    'Ejemplo:',
    ...EJEMPLO_CAMPOS
  ].join('\n');

export const pedirNumeroConFaltantes = (recibidos, faltantes) => [
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
    'Envíame los datos que faltan en un solo mensaje.',
    '',
    'Recuerda el formato por comas: Empresa, Nombre, Asunto, Descripción. El Asunto no puede llevar comas.'
  ].join('\n');
};

export const TIPOS_SIN_TEXTO = {
  audio: 'audio',
  image: 'imagen',
  video: 'video',
  document: 'documento',
  sticker: 'sticker',
  location: 'ubicación',
  contacts: 'contacto'
};
