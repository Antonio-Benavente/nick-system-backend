import pool from '../config/db.js';
import { validateClave } from '../validators/validators.js';
import { abortar } from '../middlewares/error.middleware.js';
import { registrarAuditoriaClave } from '../services/auditoria.service.js';
import { leerPaginacion, cabeceraPaginacion, contar } from '../services/paginacion.service.js';

const DUPLICADO_CORREO = 'Ya existe un correo con ese valor en esa empresa';
const DUPLICADO_PC = 'Ya existe una credencial de PC y AnyDesk para esa empresa';

export const getClaves = async (req, res) => {
  const { incluir_inactivos } = req.query;
  const paginacion = leerPaginacion(req.query);

  await registrarAuditoriaClave(req, 'consulta');

  const condiciones = [];
  const params = [];

  if (incluir_inactivos !== 'true') {
    condiciones.push('estado = ?');
    params.push('activo');
  }

  if (req.query.buscar) {
    condiciones.push('(empresa LIKE ? OR usuario LIKE ? OR pc LIKE ?)');
    const patron = `%${String(req.query.buscar).trim().slice(0, 100)}%`;
    params.push(patron, patron, patron);
  }

  const donde = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  if (paginacion.activa) {
    const total = await contar(pool, `SELECT COUNT(*) AS total FROM claves ${donde}`, params);
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  const [rows] = await pool.query(
    `
    SELECT
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
    FROM claves
    ${donde}
    ORDER BY empresa
    LIMIT ? OFFSET ?
  `,
    [...params, paginacion.limite, paginacion.offset]
  );

  res.json(rows);
};

export const createClave = async (req, res) => {
  validateClave(req.body);

  const {
    empresa,
    tipo,
    nombre,
    usuario,
    password,
    pc,
    pc_password,
    anydesk,
    anydesk_password,
  } = req.body;

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

  const [result] = await pool.query(
    `INSERT INTO claves (empresa, tipo, nombre, usuario, password, pc, pc_password, anydesk, anydesk_password, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      empresaTrim,
      tipo,
      nombre ? nombre.trim() : null,
      usuario ? usuario.trim() : null,
      password ?? null,
      pc ? pc.trim() : null,
      pc_password ?? null,
      anydesk ? anydesk.trim() : null,
      anydesk_password ?? null,
      'activo',
    ]
  );

  res.status(201).json({ message: 'Clave creada correctamente', id: result.insertId });

  await registrarAuditoriaClave(req, 'creacion');
};

export const updateClave = async (req, res) => {
  const { id } = req.params;
  const body = req.body;

  const CAMPOS = [
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

  if (!CAMPOS.some((campo) => body[campo] !== undefined)) {
    throw abortar(400, 'No se proporcionaron campos para actualizar');
  }

  const [rows] = await pool.query(
    'SELECT id, empresa, tipo, nombre, usuario, password, pc, pc_password, anydesk, anydesk_password FROM claves WHERE id = ?',
    [id]
  );

  if (rows.length === 0) {
    throw abortar(404, 'Clave no encontrada');
  }

  const existing = rows[0];

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
    updateParams = [nuevaEmpresa, existing.tipo, nuevoNombre, nuevoUsuario, nuevoPassword, id];
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
      nuevoPcPassword,
      nuevoAnydesk,
      nuevoAnydeskPassword,
      id
    ];
  }

  validateClave(validationData);

  const [dup] = await pool.query(dupQuery, dupParams);

  if (dup.length > 0) {
    throw abortar(409, existing.tipo === 'correo' ? DUPLICADO_CORREO : DUPLICADO_PC);
  }

  await pool.query(updateQuery, updateParams);

  res.json({ message: 'Clave actualizada correctamente' });

  await registrarAuditoriaClave(req, 'actualizacion');
};

export const deleteClave = async (req, res) => {
  const [result] = await pool.query(
    `UPDATE claves SET estado = 'inactivo' WHERE id = ?`,
    [req.params.id]
  );

  if (result.affectedRows === 0) {
    throw abortar(404, 'Clave no encontrada');
  }

  res.json({ message: 'Clave inactivada correctamente' });

  await registrarAuditoriaClave(req, 'inactivacion');
};

export const restaurarClave = async (req, res) => {
  const [result] = await pool.query(
    `UPDATE claves SET estado = 'activo' WHERE id = ? AND estado = 'inactivo'`,
    [req.params.id]
  );

  if (result.affectedRows === 0) {
    throw abortar(404, 'Clave no encontrada o ya está activa');
  }

  res.json({ message: 'Clave restaurada correctamente' });

  await registrarAuditoriaClave(req, 'restauracion');
};
