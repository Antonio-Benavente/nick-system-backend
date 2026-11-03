import { z } from 'zod';
import { ValidationError } from './validators.js';

const CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().regex(CORREO, 'Email inválido').max(100),
  password: z.string().min(1, 'La contraseña es requerida').max(72)
});

export const esquemaLoginApp = esquemaLogin.extend({
  dispositivo: z
    .object({
      nombre: z.string().trim().max(100).optional(),
      plataforma: z.enum(['android', 'ios']).optional(),
      app_version: z.string().trim().max(20).optional()
    })
    .optional()
});

export const esquemaPushToken = z.object({
  expo_push_token: z.string().trim().min(1).max(255)
});

export const esquemaNuevoTicket = z.object({
  empresa_solicitante: z.string().trim().min(2, 'La empresa es requerida').max(150),
  nombre_solicitante: z.string().trim().min(2, 'El nombre es requerido').max(100),
  asunto: z.string().trim().min(1, 'El asunto es requerido').max(150),
  descripcion: z.string().trim().min(1, 'El problema es requerido').max(2000),
  modalidad: z.enum(['presencial', 'remoto']).optional()
});

export const esquemaConformidadPublica = z
  .object({
    conforme: z.boolean({ message: 'Debes indicar si el servicio fue conforme o no' }),
    aprobado_por: z.string().trim().max(100).optional(),
    motivo: z.string().trim().max(500).optional()
  })
  .refine((datos) => datos.conforme || Boolean(datos.motivo), {
    message: 'Cuéntanos qué pasó para que el técnico pueda revisarlo',
    path: ['motivo']
  });

export const esquemaWebhookResend = z
  .object({
    type: z.string().min(1),
    data: z
      .object({
        email_id: z.string().min(1).optional()
      })
      .passthrough()
  })
  .passthrough();

export const esquemaWebhookWhatsapp = z
  .object({
    entry: z.array(
      z
        .object({
          changes: z.array(z.any()).default([])
        })
        .passthrough()
    )
  })
  .passthrough();

const unirMensajes = (problema) => {
  const campo = problema.path.join('.');
  const mensaje = problema.message || 'Valor inválido';
  return campo ? `${campo}: ${mensaje}` : mensaje;
};

export const validarConZod = (esquema, datos, { modo = 'observe', contexto = 'petición' } = {}) => {
  const resultado = esquema.safeParse(datos);

  if (resultado.success) return resultado.data;

  const problema = resultado.error.issues[0];
  const mensaje = unirMensajes(problema);

  if (modo === 'enforce') {
    throw new ValidationError(mensaje, problema.path.join('.') || null);
  }

  console.warn(`[zod][observación] ${contexto}: ${mensaje}`);
  return datos;
};
