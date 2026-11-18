import pool from '../config/db.js';
import { abortar } from '../middlewares/error.middleware.js';
import { validateClave } from '../validators/validators.js';
import { contar } from './paginacion.service.js';
import {
  cifrarCamposClave,
  cifrarClave,
  descifrarFilaClave
} from './clavesCifrado.service.js';

const DUPLICADO_CORREO = 'Ya existe un correo con ese valor en esa empresa';
const DUPLICADO_PC = 'Ya existe una credencial de PC y AnyDesk para esa empresa';

const CAMPOS_CLAVE = [
  'empresa',
  'tipo',
  'nombre',
  'usuario',
  'password',
  'pc',
  'pc_password',
  'anydesk',
  'anydesk_password'
];

const COLUMNAS_CLAVE = `
  id,
  empresa,
  tipo,
  nombre,
  usuario,
  password,
  pc,
  pc_password,
  anydesk,
  anydesk_password,
  estado,
  updated_at
`;

export const listarClaves = async ({
  incluirInactivos = false,
  buscar = null,
  paginacion
} = {}) => {
  const condiciones = [];
  const params = [];

  if (!incluirInactivos) {
    condiciones.push('estado = ?');
    params.push('activo');
  }

  if (buscar) {
    condiciones.push('(empresa LIKE ? OR usuario LIKE ? OR pc LIKE ?)');
    const patron = `%${String(buscar).trim().slice(0, 100)}%`;
    params.push(patron, patron, patron);
  }

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const total = paginacion.activa
    ? await contar(pool, `SELECT COUNT(*) AS total FROM claves ${donde}`, params)
    : null;

  const [filas] = await pool.query(
    `SELECT ${COLUMNAS_CLAVE}
     FROM claves
     ${donde}
     ORDER BY empresa
     LIMIT ? OFFSET ?`,
    [...params, paginacion.limite, paginacion.offset]
  );

  return { filas: filas.map(descifrarFilaClave), total };
};

export const crearClave = async (body) => {
  const {
    empresa,
    tipo,
    nombre,
    usuario,
    password,
    pc,
    pc_password,
    anydesk,
    anydesk_password
  } = body;

  const empresaTrim = empresa.trim();

  const [dup] = tipo === 'correo'
    ? await pool.query(
        'SELECT id FROM claves WHERE empresa = ? AND tipo = ? AND usuario = ?',
        [empresaTrim, tipo, usuario.trim()]
      )
    : await pool.query(
        'SELECT id FROM claves WHERE empresa = ? AND tipo = ?',
        [empresaTrim, tipo]
      );

  if (dup.length > 0) {
    throw abortar(409, tipo === 'correo' ? DUPLICADO_CORREO : DUPLICADO_PC);
  }

  const datos = cifrarCamposClave({
    empresa: empresaTrim,
    tipo,
    nombre: nombre ? nombre.trim() : null,
    usuario: usuario ? usuario.trim() : null,
    password: password ?? null,
    pc: pc ? pc.trim() : null,
    pc_password: pc_password ?? null,
    anydesk: anydesk ? anydesk.trim() : null,
    anydesk_password: anydesk_password ?? null,
    estado: 'activo'
  });

  const [result] = await pool.query(
    `INSERT INTO claves (empresa, tipo, nombre, usuario, password, pc, pc_password, anydesk, anydesk_password, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      datos.empresa,
      datos.tipo,
      datos.nombre,
      datos.usuario,
      datos.password,
      datos.pc,
      datos.pc_password,
      datos.anydesk,
      datos.anydesk_password,
      datos.estado
    ]
  );

  return result.insertId;
};

export const actualizarClave = async (id, body) => {
  if (!CAMPOS_CLAVE.some((campo) => body[campo] !== undefined)) {
    throw abortar(400, 'No se proporcionaron campos para actualizar');
  }

  const [rows] = await pool.query(
    `SELECT id, empresa, tipo, nombre, usuario, password, pc, pc_password, anydesk, anydesk_password
     FROM claves WHERE id = ?`,
    [id]
  );

  if (rows.length === 0) {
    throw abortar(404, 'Clave no encontrada');
  }

  const existing = descifrarFilaClave(rows[0]);

  if (body.tipo !== undefined && body.tipo !== existing.tipo) {
    throw abortar(400, 'No se puede cambiar el tipo de la clave');
  }

  const nuevaEmpresa = body.empresa !== undefined ? body.empresa.trim() : existing.empresa;
  const nuevoNombre = body.nombre !== undefined
    ? (body.nombre || '').trim() || null
    : existing.nombre;

  let validationData;
  let dupQuery;
  let dupParams;
  let updateQuery;
  let updateParams;

  if (existing.tipo === 'correo') {
    const nuevoUsuario = body.usuario !== undefined ? body.usuario.trim() : existing.usuario;
    const nuevoPassword = body.password !== undefined ? body.password : existing.password;

    validationData = {
      empresa: nuevaEmpresa,
      tipo: existing.tipo,
      nombre: nuevoNombre,
      usuario: nuevoUsuario,
      password: nuevoPassword
    };
    dupQuery = 'SELECT id FROM claves WHERE empresa = ? AND tipo = ? AND usuario = ? AND id != ?';
    dupParams = [nuevaEmpresa, existing.tipo, nuevoUsuario, id];
    updateQuery = `UPDATE claves SET empresa = ?, tipo = ?, nombre = ?, usuario = ?, password = ?,
        pc = NULL, pc_password = NULL, anydesk = NULL, anydesk_password = NULL WHERE id = ?`;
    updateParams = [nuevaEmpresa, existing.tipo, nuevoNombre, nuevoUsuario, cifrarClave(nuevoPassword), id];
  } else {
    const nuevoPc = body.pc !== undefined ? body.pc.trim() : existing.pc;
    const nuevoPcPassword = body.pc_password !== undefined ? body.pc_password : existing.pc_password;
    const nuevoAnydesk = body.anydesk !== undefined ? body.anydesk.trim() : existing.anydesk;
    const nuevoAnydeskPassword = body.anydesk_password !== undefined
      ? body.anydesk_password
      : existing.anydesk_password;

    validationData = {
      empresa: nuevaEmpresa,
      tipo: existing.tipo,
      nombre: nuevoNombre,
      pc: nuevoPc,
      pc_password: nuevoPcPassword,
      anydesk: nuevoAnydesk,
      anydesk_password: nuevoAnydeskPassword
    };
    dupQuery = 'SELECT id FROM claves WHERE empresa = ? AND tipo = ? AND id != ?';
    dupParams = [nuevaEmpresa, existing.tipo, id];
    updateQuery = `UPDATE claves SET empresa = ?, tipo = ?, nombre = ?, pc = ?, pc_password = ?, anydesk = ?, anydesk_password = ?,
        usuario = NULL, password = NULL WHERE id = ?`;
    updateParams = [
      nuevaEmpresa,
      existing.tipo,
      nuevoNombre,
      nuevoPc,
      cifrarClave(nuevoPcPassword),
      nuevoAnydesk,
      cifrarClave(nuevoAnydeskPassword),
      id
    ];
  }

  validateClave(validationData);

  const [dup] = await pool.query(dupQuery, dupParams);

  if (dup.length > 0) {
    throw abortar(409, existing.tipo === 'correo' ? DUPLICADO_CORREO : DUPLICADO_PC);
  }

  await pool.query(updateQuery, updateParams);
};

export const inactivarClave = async (id) => {
  const [result] = await pool.query(
    `UPDATE claves SET estado = 'inactivo' WHERE id = ?`,
    [id]
  );

  if (result.affectedRows === 0) {
    throw abortar(404, 'Clave no encontrada');
  }
};

export const restaurarClave = async (id) => {
  const [result] = await pool.query(
    `UPDATE claves SET estado = 'activo' WHERE id = ? AND estado = 'inactivo'`,
    [id]
  );

  if (result.affectedRows === 0) {
    throw abortar(404, 'Clave no encontrada o ya está activa');
  }
};

export default {
  listarClaves,
  crearClave,
  actualizarClave,
  inactivarClave,
  restaurarClave
};
