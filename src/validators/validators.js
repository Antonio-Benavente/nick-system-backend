

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.statusCode = 400;
  }
}

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new ValidationError("Email inválido", "email");
  }
  return true;
};

export const validatePassword = (password) => {
  if (!password || password.length < 6) {
    throw new ValidationError(
      "La contraseña debe tener al menos 6 caracteres",
      "password",
    );
  }
  return true;
};

export const validateTecnico = (data) => {
  if (!data.nombre || data.nombre.trim().length < 2) {
    throw new ValidationError(
      "Nombre es requerido y debe tener al menos 2 caracteres",
      "nombre",
    );
  }

  validateEmail(data.email);

  if (data.password) {
    validatePassword(data.password);
  }

  if (data.telefono && data.telefono.length > 0) {
    const phoneRegex = /^[\d\s\-\+\(\)]+$/;
    if (!phoneRegex.test(data.telefono)) {
      throw new ValidationError("Formato de teléfono inválido", "telefono");
    }
  }

  return true;
};

export const validateCliente = (data) => {
  if (!data.nombre || data.nombre.trim().length < 2) {
    throw new ValidationError(
      "Nombre es requerido y debe tener al menos 2 caracteres",
      "nombre",
    );
  }

  if (!data.empresa || data.empresa.trim().length < 2) {
    throw new ValidationError("Empresa es requerida", "empresa");
  }

  validateEmail(data.email);

  if (data.password) {
    validatePassword(data.password);
  }

  return true;
};

export const validateReporte = (data) => {
  if (!data.cliente_uuid) {
    throw new ValidationError("Cliente es requerido", "cliente_uuid");
  }

  if (!data.categoria || data.categoria.trim().length === 0) {
    throw new ValidationError("Categoría es requerida", "categoria");
  }

  if (!data.fecha) {
    throw new ValidationError("Fecha es requerida", "fecha");
  }

  if (!data.modalidad || !["presencial", "remoto"].includes(data.modalidad)) {
    throw new ValidationError(
      'Modalidad debe ser "presencial" o "remoto"',
      "modalidad",
    );
  }

  if (
    data.cliente_conforme &&
    !["conforme", "no_conforme", "por_confirmar"].includes(
      data.cliente_conforme,
    )
  ) {
    throw new ValidationError(
      "Estado de conformidad inválido",
      "cliente_conforme",
    );
  }

  return true;
};

export const validateReporteUpdate = (data) => {
  if (Object.keys(data).length === 0) {
    throw new ValidationError("Se requiere al menos un campo para actualizar", "body");
  }

  if (data.categoria !== undefined && (!data.categoria || data.categoria.trim().length === 0)) {
    throw new ValidationError("Categoría no puede estar vacía", "categoria");
  }

  if (data.modalidad !== undefined && !["presencial", "remoto"].includes(data.modalidad)) {
    throw new ValidationError('Modalidad debe ser "presencial" o "remoto"', "modalidad");
  }

  if (
    data.cliente_conforme &&
    !["conforme", "no_conforme", "por_confirmar"].includes(data.cliente_conforme)
  ) {
    throw new ValidationError("Estado de conformidad inválido", "cliente_conforme");
  }

  return true;
};

const CLAVE_LIMITS = {
  empresa: 150,
  tipo: 7,
  usuario: 100,
  password: 30,
};

export const CLAVE_TIPOS = ['correo', 'pc', 'anydesk'];

export const CLAVE_TIPO_LABELS = {
  correo: 'correo',
  pc: 'nombre de PC',
  anydesk: 'ID de AnyDesk',
};

export const validateClave = (data) => {
  if (!data.empresa || data.empresa.trim().length < 2) {
    throw new ValidationError(
      "Empresa es requerida y debe tener al menos 2 caracteres",
      "empresa",
    );
  }
  if (data.empresa.trim().length > CLAVE_LIMITS.empresa) {
    throw new ValidationError(
      `Empresa no puede exceder ${CLAVE_LIMITS.empresa} caracteres`,
      "empresa",
    );
  }

  if (!data.tipo || !CLAVE_TIPOS.includes(data.tipo)) {
    throw new ValidationError(
      "Tipo es requerido y debe ser correo, pc o anydesk",
      "tipo",
    );
  }

  if (!data.usuario || data.usuario.trim().length < 2) {
    throw new ValidationError(
      `El ${CLAVE_TIPO_LABELS[data.tipo]} es requerido y debe tener al menos 2 caracteres`,
      "usuario",
    );
  }
  if (data.usuario.length > CLAVE_LIMITS.usuario) {
    throw new ValidationError(
      `El ${CLAVE_TIPO_LABELS[data.tipo]} no puede exceder ${CLAVE_LIMITS.usuario} caracteres`,
      "usuario",
    );
  }
  if (data.tipo === 'correo') {
    try {
      validateEmail(data.usuario);
    } catch (e) {
      if (e instanceof ValidationError) {
        throw new ValidationError(e.message, 'usuario');
      }
      throw e;
    }
  }

  if (!data.password || data.password.length === 0) {
    throw new ValidationError("Password es requerido", "password");
  }
  if (data.password.length > CLAVE_LIMITS.password) {
    throw new ValidationError(
      `Password no puede exceder ${CLAVE_LIMITS.password} caracteres`,
      "password",
    );
  }

  return true;
};

export const validateConformidad = (data) => {
  if (
    !data.cliente_conforme ||
    !["conforme", "no_conforme", "por_confirmar"].includes(data.cliente_conforme)
  ) {
    throw new ValidationError(
      'Estado de conformidad debe ser "conforme", "no_conforme" o "por_confirmar"',
      "cliente_conforme",
    );
  }

  if (data.cliente_conforme === "conforme" || data.cliente_conforme === "no_conforme") {
    if (!data.aprobado_por || data.aprobado_por.trim().length < 2) {
      throw new ValidationError(
        "Nombre de quien aprueba es requerido cuando se marca como conforme o no conforme",
        "aprobado_por",
      );
    }
  }

  return true;
};
