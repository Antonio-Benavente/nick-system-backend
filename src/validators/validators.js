/**
 * Validadores para entrada de datos
 * Implementa validación de datos antes de procesarlos
 */

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.statusCode = 400;
  }
}

export const validateEmail = (email) => {
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

export const validateConformidad = (data) => {
  // Validar que el estado de conformidad sea válido
  if (
    !data.cliente_conforme ||
    !["conforme", "no_conforme", "por_confirmar"].includes(data.cliente_conforme)
  ) {
    throw new ValidationError(
      'Estado de conformidad debe ser "conforme", "no_conforme" o "por_confirmar"',
      "cliente_conforme",
    );
  }

  // Solo requerir aprobado_por si el estado es conforme o no_conforme
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
