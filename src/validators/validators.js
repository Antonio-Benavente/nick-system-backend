

export class ValidationError extends Error {
  constructor(message, field = null) {
    super(message);
    this.name = "ValidationError";
    this.field = field;
    this.statusCode = 400;
  }
}

const FECHA_REGEX = /^\d{4}-\d{2}-\d{2}$/;

export const REPORTE_ESTADOS = ['activo', 'eliminado'];

export const REPORTE_MODALIDADES = ['presencial', 'remoto'];

export const REPORTE_CONFORMIDAD = ['conforme', 'no_conforme', 'por_confirmar'];

export const REPORTE_LIMITES = {
  categoria: 100,
  descripcion: 5000,
  aprobado_por: 100
};

const texto = (valor) => (typeof valor === 'string' ? valor.trim() : '');

export const sanear = (valor, max) => texto(valor).slice(0, max);

const limite = (valor, max, campo, etiqueta) => {
  if (texto(valor).length > max) {
    throw new ValidationError(
      `${etiqueta} no puede superar ${max} caracteres`,
      campo
    );
  }
  return true;
};

const validateEmail = (email) => {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    throw new ValidationError("Email inválido", "email");
  }
  if (texto(email).length > 100) {
    throw new ValidationError("El email no puede superar 100 caracteres", "email");
  }
  return true;
};

export const validatePassword = (password, campo = "password") => {
  if (!password || typeof password !== "string" || password.length < 6) {
    throw new ValidationError(
      "La contraseña debe tener al menos 6 caracteres",
      campo,
    );
  }
  if (password.length > 72) {
    throw new ValidationError(
      "La contraseña no puede superar 72 caracteres",
      campo,
    );
  }
  return true;
};

export const validateFecha = (fecha, campo = "fecha") => {
  const limpio = texto(fecha);
  if (!limpio || !FECHA_REGEX.test(limpio)) {
    throw new ValidationError("La fecha debe tener formato YYYY-MM-DD", campo);
  }

  const [anio, mes, dia] = limpio.split("-").map(Number);
  const fechaReal = new Date(Date.UTC(anio, mes - 1, dia));

  if (
    fechaReal.getUTCFullYear() !== anio ||
    fechaReal.getUTCMonth() !== mes - 1 ||
    fechaReal.getUTCDate() !== dia
  ) {
    throw new ValidationError("La fecha no es válida", campo);
  }

  return true;
};

export const validarRangoFechas = (query = {}) => {
  const rango = {};

  for (const campo of ['fecha_desde', 'fecha_hasta']) {
    const limpio = sanear(query[campo], 10);
    if (!limpio) continue;
    validateFecha(limpio, campo);
    rango[campo] = limpio;
  }

  return rango;
};

export const validarEnumFiltro = (valor, permitidos, campo) => {
  const limpio = sanear(valor, 50);
  if (!limpio) return null;

  if (!permitidos.includes(limpio)) {
    throw new ValidationError(
      `${campo} debe ser uno de: ${permitidos.join(', ')}`,
      campo
    );
  }

  return limpio;
};

const validaNombre = (nombre, campo = "nombre") => {
  if (!nombre || texto(nombre).length < 2) {
    throw new ValidationError(
      "Nombre es requerido y debe tener al menos 2 caracteres",
      campo,
    );
  }
  limite(nombre, 100, campo, "El nombre");
  return true;
};

const validaEmpresa = (empresa) => {
  if (!empresa || texto(empresa).length < 2) {
    throw new ValidationError("Empresa es requerida", "empresa");
  }
  limite(empresa, 100, "empresa", "La empresa");
  return true;
};

const validaTelefono = (telefono) => {
  const phoneRegex = /^[\d\s\-\+\(\)]+$/;
  if (!phoneRegex.test(telefono)) {
    throw new ValidationError("Formato de teléfono inválido", "telefono");
  }
  limite(telefono, 50, "telefono", "El teléfono");
  return true;
};

const validarCamposPresentes = (data, campos) => {
  const enviados = campos.filter((campo) => data[campo] !== undefined);

  if (enviados.length === 0) {
    throw new ValidationError("No se proporcionaron campos para actualizar", "body");
  }

  return true;
};

export const validateTecnico = (data) => {
  validaNombre(data.nombre);

  validateEmail(data.email);

  if (data.password) {
    validatePassword(data.password);
  }

  if (data.telefono && data.telefono.length > 0) {
    validaTelefono(data.telefono);
  }

  if (data.especialidad !== undefined && data.especialidad !== null) {
    limite(data.especialidad, 100, "especialidad", "La especialidad");
  }

  return true;
};

export const validateTecnicoUpdate = (data) => {
  validarCamposPresentes(data, ['nombre', 'email', 'telefono', 'especialidad', 'password']);

  if (data.nombre !== undefined) validaNombre(data.nombre);
  if (data.email !== undefined) validateEmail(data.email);
  if (data.password !== undefined) validatePassword(data.password);
  if (data.telefono !== undefined && data.telefono !== null) validaTelefono(data.telefono);
  if (data.especialidad !== undefined && data.especialidad !== null) {
    limite(data.especialidad, 100, "especialidad", "La especialidad");
  }

  return true;
};

export const validateCliente = (data) => {
  validaNombre(data.nombre);
  validaEmpresa(data.empresa);

  validateEmail(data.email);

  if (data.password) {
    validatePassword(data.password);
  }

  if (data.telefono !== undefined && data.telefono !== null) {
    limite(data.telefono, 50, "telefono", "El teléfono");
  }

  if (data.direccion !== undefined && data.direccion !== null) {
    limite(data.direccion, 150, "direccion", "La dirección");
  }

  return true;
};

export const validateClienteUpdate = (data) => {
  validarCamposPresentes(data, ['nombre', 'empresa', 'email', 'telefono', 'direccion', 'password']);

  if (data.nombre !== undefined) validaNombre(data.nombre);
  if (data.empresa !== undefined) validaEmpresa(data.empresa);
  if (data.email !== undefined) validateEmail(data.email);
  if (data.password !== undefined) validatePassword(data.password);
  if (data.telefono !== undefined && data.telefono !== null) {
    limite(data.telefono, 50, "telefono", "El teléfono");
  }
  if (data.direccion !== undefined && data.direccion !== null) {
    limite(data.direccion, 150, "direccion", "La dirección");
  }

  return true;
};

const validarAprobacion = (cliente_conforme, aprobado_por) => {
  if (cliente_conforme === "conforme" || cliente_conforme === "no_conforme") {
    if (!aprobado_por || texto(aprobado_por).length < 2) {
      throw new ValidationError(
        "Nombre de quien aprueba es requerido cuando se marca como conforme o no conforme",
        "aprobado_por",
      );
    }
  }

  return true;
};

export const validateReporte = (data) => {
  if (!data.cliente_uuid) {
    throw new ValidationError("Cliente es requerido", "cliente_uuid");
  }

  if (!data.categoria || texto(data.categoria).length === 0) {
    throw new ValidationError("Categoría es requerida", "categoria");
  }
  limite(data.categoria, REPORTE_LIMITES.categoria, "categoria", "La categoría");

  validateFecha(data.fecha);

  if (!data.modalidad || !REPORTE_MODALIDADES.includes(data.modalidad)) {
    throw new ValidationError(
      'Modalidad debe ser "presencial" o "remoto"',
      "modalidad",
    );
  }

  if (data.descripcion !== undefined && data.descripcion !== null) {
    limite(data.descripcion, REPORTE_LIMITES.descripcion, "descripcion", "La descripción");
  }

  if (data.cliente_conforme && !REPORTE_CONFORMIDAD.includes(data.cliente_conforme)) {
    throw new ValidationError(
      "Estado de conformidad inválido",
      "cliente_conforme",
    );
  }

  if (data.aprobado_por !== undefined && data.aprobado_por !== null) {
    limite(data.aprobado_por, REPORTE_LIMITES.aprobado_por, "aprobado_por", "El nombre de quien aprueba");
  }

  validarAprobacion(data.cliente_conforme, data.aprobado_por);

  return true;
};

export const validateReporteUpdate = (data) => {
  const { evidencias, ...campos } = data;

  if (Object.keys(campos).length === 0 && !evidencias) {
    throw new ValidationError("Se requiere al menos un campo para actualizar", "body");
  }

  if (data.categoria !== undefined && texto(data.categoria).length === 0) {
    throw new ValidationError("Categoría no puede estar vacía", "categoria");
  }

  if (data.categoria !== undefined) {
    limite(data.categoria, REPORTE_LIMITES.categoria, "categoria", "La categoría");
  }

  if (data.fecha !== undefined) {
    validateFecha(data.fecha);
  }

  if (data.modalidad !== undefined && !REPORTE_MODALIDADES.includes(data.modalidad)) {
    throw new ValidationError('Modalidad debe ser "presencial" o "remoto"', "modalidad");
  }

  if (data.estado !== undefined && !REPORTE_ESTADOS.includes(data.estado)) {
    throw new ValidationError(
      'Estado debe ser "activo" o "eliminado"',
      "estado",
    );
  }

  if (data.descripcion !== undefined && data.descripcion !== null) {
    limite(data.descripcion, REPORTE_LIMITES.descripcion, "descripcion", "La descripción");
  }

  if (data.aprobado_por !== undefined && data.aprobado_por !== null) {
    limite(data.aprobado_por, REPORTE_LIMITES.aprobado_por, "aprobado_por", "El nombre de quien aprueba");
  }

  if (data.cliente_conforme && !REPORTE_CONFORMIDAD.includes(data.cliente_conforme)) {
    throw new ValidationError("Estado de conformidad inválido", "cliente_conforme");
  }

  if (data.cliente_conforme !== undefined) {
    validarAprobacion(data.cliente_conforme, data.aprobado_por);
  }

  return true;
};

export const validarEvidencias = (evidencias, campo = "evidencias") => {
  if (evidencias === undefined || evidencias === null) return [];

  if (!Array.isArray(evidencias)) {
    throw new ValidationError("evidencias debe ser un array", campo);
  }

  if (evidencias.length > 50) {
    throw new ValidationError("No se pueden enviar más de 50 evidencias", campo);
  }

  const tipos = ['imagen', 'video', 'documento'];

  evidencias.forEach((evidencia, indice) => {
    const prefijo = `${campo}[${indice}]`;

    if (!evidencia || typeof evidencia !== 'object') {
      throw new ValidationError("Cada evidencia debe ser un objeto", prefijo);
    }

    if (!evidencia.url || typeof evidencia.url !== 'string' || !evidencia.url.trim()) {
      throw new ValidationError("La URL de la evidencia es requerida", `${prefijo}.url`);
    }

    if (evidencia.url.length > 500) {
      throw new ValidationError("La URL de la evidencia excede 500 caracteres", `${prefijo}.url`);
    }

    if (evidencia.tipo !== undefined && !tipos.includes(evidencia.tipo)) {
      throw new ValidationError("Tipo de evidencia inválido", `${prefijo}.tipo`);
    }

    if (evidencia.descripcion !== undefined && evidencia.descripcion !== null) {
      if (typeof evidencia.descripcion !== 'string') {
        throw new ValidationError("Descripción inválida", `${prefijo}.descripcion`);
      }
      if (evidencia.descripcion.length > 255) {
        throw new ValidationError("La descripción excede 255 caracteres", `${prefijo}.descripcion`);
      }
    }

    if (evidencia.orden !== undefined && evidencia.orden !== null) {
      const orden = Number(evidencia.orden);

      if (!Number.isInteger(orden) || orden < 0) {
        throw new ValidationError(
          "El orden debe ser un número entero igual o mayor que cero",
          `${prefijo}.orden`
        );
      }

      evidencia.orden = orden;
    }
  });

  return evidencias;
};

const CLAVE_LIMITS = {
  empresa: 150,
  tipo: 10,
  nombre: 100,
  usuario: 100,
  password: 30,
  pc: 100,
  anydesk: 100,
};

export const CLAVE_TIPOS = ['correo', 'pc_anydesk'];

export const CLAVE_TIPO_LABELS = {
  correo: 'correo',
  pc_anydesk: 'PC y AnyDesk',
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
      "Tipo es requerido y debe ser correo o pc_anydesk",
      "tipo",
    );
  }

  if (
    data.nombre !== undefined &&
    data.nombre !== null &&
    data.nombre.trim().length > CLAVE_LIMITS.nombre
  ) {
    throw new ValidationError(
      `El nombre de usuario no puede exceder ${CLAVE_LIMITS.nombre} caracteres`,
      "nombre",
    );
  }

  if (data.tipo === 'correo') {
    if (!data.usuario || data.usuario.trim().length < 2) {
      throw new ValidationError(
        "El correo es requerido y debe tener al menos 2 caracteres",
        "usuario",
      );
    }
    if (data.usuario.trim().length > CLAVE_LIMITS.usuario) {
      throw new ValidationError(
        `El correo no puede exceder ${CLAVE_LIMITS.usuario} caracteres`,
        "usuario",
      );
    }
    try {
      validateEmail(data.usuario);
    } catch (e) {
      if (e instanceof ValidationError) {
        throw new ValidationError(e.message, 'usuario');
      }
      throw e;
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
  } else {
    if (!data.pc || data.pc.trim().length < 2) {
      throw new ValidationError(
        "El nombre de PC es requerido y debe tener al menos 2 caracteres",
        "pc",
      );
    }
    if (data.pc.trim().length > CLAVE_LIMITS.pc) {
      throw new ValidationError(
        `El nombre de PC no puede exceder ${CLAVE_LIMITS.pc} caracteres`,
        "pc",
      );
    }
    if (data.anydesk !== undefined && data.anydesk !== null && data.anydesk.trim().length > CLAVE_LIMITS.anydesk) {
      throw new ValidationError(
        `El ID de AnyDesk no puede exceder ${CLAVE_LIMITS.anydesk} caracteres`,
        "anydesk",
      );
    }
    if (data.pc_password !== undefined && data.pc_password !== null && data.pc_password.length > CLAVE_LIMITS.password) {
      throw new ValidationError(
        `El password de PC no puede exceder ${CLAVE_LIMITS.password} caracteres`,
        "pc_password",
      );
    }
    if (data.anydesk_password !== undefined && data.anydesk_password !== null && data.anydesk_password.length > CLAVE_LIMITS.password) {
      throw new ValidationError(
        `El password de AnyDesk no puede exceder ${CLAVE_LIMITS.password} caracteres`,
        "anydesk_password",
      );
    }
  }

  return true;
};

export const validateConformidad = (data) => {
  if (!data.cliente_conforme || !REPORTE_CONFORMIDAD.includes(data.cliente_conforme)) {
    throw new ValidationError(
      'Estado de conformidad debe ser "conforme", "no_conforme" o "por_confirmar"',
      "cliente_conforme",
    );
  }

  if (data.aprobado_por !== undefined && data.aprobado_por !== null) {
    limite(data.aprobado_por, REPORTE_LIMITES.aprobado_por, "aprobado_por", "El nombre de quien aprueba");
  }

  validarAprobacion(data.cliente_conforme, data.aprobado_por);

  return true;
};

export const validateCategoria = (data) => {
  const nombre = texto(data.nombre);

  if (!nombre || nombre.length < 3) {
    throw new ValidationError(
      "Nombre es requerido y debe tener al menos 3 caracteres",
      "nombre"
    );
  }

  if (nombre.length > 100) {
    throw new ValidationError("El nombre no puede superar 100 caracteres", "nombre");
  }

  return true;
};
