import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config({ quiet: true });

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const EMAIL_FROM = /^(?:.*<[^@\s]+@[^@\s]+>|[^@\s]+@[^@\s]+)$/;
const HORARIO = /^\d{1,2}:\d{2}-\d{1,2}:\d{2}$/;

const esClaveCifrado = (valor) => {
  if (/^[0-9a-fA-F]{64}$/.test(valor)) return true;
  if (/^[A-Za-z0-9+/]{43}=$/.test(valor)) return true;
  return Buffer.byteLength(valor, 'utf8') === 32;
};

const vacioComoIndefinido = (valor) =>
  typeof valor === 'string' && valor.trim() === '' ? undefined : valor;

const opcional = (esquema) => z.preprocess(vacioComoIndefinido, esquema.optional());

const correo = z.string().regex(CORREO, 'formato de correo inválido');

const entero = (defecto, { min = 1, max = Number.MAX_SAFE_INTEGER } = {}) =>
  z.coerce.number().int().min(min).max(max).default(defecto);

const bandera = (defecto) =>
  z.enum(['off', 'observe', 'enforce']).default(defecto);

const esquema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: entero(4000, { min: 1, max: 65535 }),
  TRUST_PROXY: z.coerce.number().int().min(0).max(10).default(1),

  DATABASE_URL: z
    .string()
    .min(1, 'es obligatoria')
    .regex(/^mysql(s)?:\/\/.+/i, 'debe ser una URL mysql://'),

  JWT_SECRET: z.string().min(8, 'debe tener al menos 8 caracteres'),
  JWT_EXPIRES_IN: z.string().min(1).default('1d'),
  TICKET_CODIGO_SECRET: opcional(z.string().min(8)),
  CLAVES_ENCRYPTION_KEY: opcional(
    z.string().refine(esClaveCifrado, 'debe ser 32 bytes en base64, 64 hex o 32 caracteres UTF-8')
  ),

  FRONTEND_URL: opcional(z.string().url()),
  ALLOWED_ORIGINS: opcional(z.string()),
  APP_TIMEZONE: z.string().default('America/Lima'),

  EMAIL_FROM: opcional(z.string().regex(EMAIL_FROM, 'formato inválido')),
  RESEND_API_KEY: opcional(z.string()),
  RESEND_WEBHOOK_SECRET: opcional(z.string()),

  WHATSAPP_TOKEN: opcional(z.string()),
  WHATSAPP_PHONE_NUMBER_ID: opcional(z.string()),
  WHATSAPP_VERIFY_TOKEN: opcional(z.string()),
  WHATSAPP_APP_SECRET: opcional(z.string()),
  WHATSAPP_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/, 'formato esperado vXX.Y').default('v26.0'),
  WHATSAPP_CONVERSACION_MINUTOS: entero(30),
  WHATSAPP_MENSAJES_DIAS: entero(7),
  WHATSAPP_INTENTOS_MAXIMOS: entero(2),
  WHATSAPP_CONSULTA_TICKET_DIAS: entero(90),
  WHATSAPP_PREFIJO_PAIS: z.string().regex(/^\d{1,4}$/, 'solo dígitos').default('51'),

  TICKET_EMPRESA_CORREO: z.string().default('G'),
  TICKET_EMPRESA_WHATSAPP: z.string().default('WhatsApp'),
  TICKET_NOTIFICACION_EMAIL: opcional(z.string()),
  TICKET_URGENCIA_TELEFONO: opcional(z.string()),
  TICKET_URGENCIA_EMAIL: opcional(correo),

  WARMUP_URL: opcional(z.string().url()),
  WARMUP_MINUTOS: entero(10, { min: 0 }),
  WARMUP_HORARIO: z.string().regex(HORARIO, 'formato esperado HH:MM-HH:MM').default('08:00-22:00'),
  RENDER_EXTERNAL_URL: opcional(z.string().url()),
  RENDER_GIT_COMMIT: opcional(z.string()),

  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  SENTRY_DSN: opcional(z.string().url()),
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0.1),

  FF_INCOMING_EVENTS: bandera('observe'),
  FF_ZOD_VALIDATION: bandera('observe'),
  FF_IDEMPOTENCY: z.enum(['off', 'enforce']).default('off'),
  FF_PUSH: z.enum(['off', 'enforce']).default('off'),

  EXPO_ACCESS_TOKEN: opcional(z.string()),
  JWT_EXPIRES_IN_APP_TECNICOS: z
    .string()
    .regex(/^\d+\s*[smhd]?$/i, 'formato esperado 365d, 12h o segundos')
    .default('365d'),
  APP_TECNICOS_VERSION_MINIMA: z
    .string()
    .regex(/^\d+(?:\.\d+)*$/, 'formato esperado 1.2.3')
    .default('1.0.0'),
  APP_TECNICOS_URL_DESCARGA: opcional(z.string().url()),

  EVIDENCIAS_MAX_MB: entero(10),
  EVIDENCIAS_HOSTS: opcional(z.string())
});

const validarZonaHoraria = (zona) => {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zona }).format(new Date());
    return true;
  } catch {
    return false;
  }
};

const listaCorreos = (valor) =>
  String(valor || '')
    .split(',')
    .map((correo) => correo.trim())
    .filter(Boolean);

const correosValidos = (valor) => listaCorreos(valor).every((correo) => CORREO.test(correo));

const GRUPOS = {
  email: {
    variables: ['RESEND_API_KEY', 'EMAIL_FROM'],
    etiqueta: 'correo (Resend)'
  },
  inbound: {
    variables: ['RESEND_WEBHOOK_SECRET'],
    etiqueta: 'correo entrante (webhook de Resend)'
  },
  claves: {
    variables: ['CLAVES_ENCRYPTION_KEY'],
    etiqueta: 'cifrado de credenciales (tabla claves)'
  },
  whatsapp: {
    variables: [
      'WHATSAPP_TOKEN',
      'WHATSAPP_PHONE_NUMBER_ID',
      'WHATSAPP_VERIFY_TOKEN',
      'WHATSAPP_APP_SECRET'
    ],
    etiqueta: 'WhatsApp (Meta Cloud API)'
  }
};

export const validarEntorno = (entorno = process.env) => {
  const resultado = esquema.safeParse(entorno);
  const errores = [];
  const avisos = [];

  if (!resultado.success) {
    for (const problema of resultado.error.issues) {
      const variable = problema.path.join('.') || 'configuración';
      errores.push(`${variable}: ${problema.message}`);
    }

    return { config: null, errores, avisos };
  }

  const config = resultado.data;
  const produccion = config.NODE_ENV === 'production';

  if (!validarZonaHoraria(config.APP_TIMEZONE)) {
    errores.push(`APP_TIMEZONE: zona horaria desconocida (${config.APP_TIMEZONE})`);
  }

  if (config.TICKET_NOTIFICACION_EMAIL && !correosValidos(config.TICKET_NOTIFICACION_EMAIL)) {
    errores.push('TICKET_NOTIFICACION_EMAIL: contiene un correo con formato inválido');
  }

  const mayusculas = ['DATABASE_URL', 'JWT_SECRET', 'TICKET_CODIGO_SECRET'];
  for (const variable of mayusculas) {
    if (config[variable] && config[variable].length < 16) {
      avisos.push(`${variable}: se recomienda una longitud de al menos 16 caracteres`);
    }
  }

  for (const [grupo, definicion] of Object.entries(GRUPOS)) {
    const faltantes = definicion.variables.filter((variable) => !config[variable]);

    if (!faltantes.length) continue;

    const mensaje = `${definicion.etiqueta}: faltan ${faltantes.join(', ')}`;

    if (produccion) {
      errores.push(mensaje);
    } else {
      avisos.push(`${mensaje} (solo es obligatorio en producción)`);
    }
  }

  if (!config.TICKET_NOTIFICACION_EMAIL) {
    avisos.push('TICKET_NOTIFICACION_EMAIL: vacía; los avisos internos de tickets no se enviarán');
  }

  if (config.TICKET_CODIGO_SECRET && config.TICKET_CODIGO_SECRET === config.JWT_SECRET) {
    avisos.push('TICKET_CODIGO_SECRET: es igual a JWT_SECRET; usa un valor independiente');
  }

  if (!config.APP_TECNICOS_URL_DESCARGA) {
    avisos.push(
      'APP_TECNICOS_URL_DESCARGA: vacía; /publico/app-tecnicos responderá con url_descarga null'
    );
  }

  if (config.FF_PUSH === 'enforce' && !config.EXPO_ACCESS_TOKEN) {
    avisos.push('EXPO_ACCESS_TOKEN: vacía; Expo acepta el envío sin autenticación (menos seguro)');
  }

  const origenes = String(config.ALLOWED_ORIGINS || '')
    .split(',')
    .map((origen) => origen.trim())
    .filter(Boolean);

  const hostsEvidencias = String(config.EVIDENCIAS_HOSTS || '')
    .split(',')
    .map((host) => host.trim().toLowerCase())
    .filter(Boolean);

  return {
    config: {
      ...config,
      ES_PRODUCCION: produccion,
      ES_DESARROLLO: !produccion,
      ZONA_HORARIA: config.APP_TIMEZONE,
      ORIGENES_PERMITIDOS: origenes,
      EVIDENCIAS_HOSTS_LISTA: hostsEvidencias.length
        ? hostsEvidencias
        : ['res.cloudinary.com']
    },
    errores,
    avisos
  };
};

const resultadoEntorno = validarEntorno(process.env);

for (const aviso of resultadoEntorno.avisos) {
  console.warn(`⚠️ Configuración: ${aviso}`);
}

if (resultadoEntorno.errores.length) {
  console.error('❌ Configuración inválida. El servidor no puede arrancar:');
  for (const error of resultadoEntorno.errores) console.error(`   • ${error}`);
  process.exit(1);
}

export const config = Object.freeze(resultadoEntorno.config);

export default config;
