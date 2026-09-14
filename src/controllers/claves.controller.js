import pool from '../config/db.js';
import { validateClave, ValidationError } from '../validators/validators.js';

export const getClaves = async (req, res) => {
  try {
    const { incluir_inactivos } = req.query;

    let query = `
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
        estado
      FROM claves
    `;

    if (incluir_inactivos !== 'true') {
      query += ` WHERE estado = 'activo'`;
    }

    query += ` ORDER BY empresa`;

    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error('Error en getClaves:', error);
    res.status(500).json({ message: 'Error al obtener la tabla claves' });
  }
};

export const createClave = async (req, res) => {
  const { empresa, tipo } = req.body;

  try {
    validateClave(req.body);

    const empresaTrim = empresa.trim();

    if (tipo === 'correo') {
      const [dup] = await pool.query(
        'SELECT id FROM claves WHERE empresa = ? AND tipo = ? AND usuario = ?',
        [empresaTrim, tipo, req.body.usuario.trim()]
      );
      if (dup.length > 0) {
        return res.status(409).json({ message: 'Ya existe un correo con ese valor en esa empresa' });
      }
    } else {
      const [dup] = await pool.query(
        'SELECT id FROM claves WHERE empresa = ? AND tipo = ?',
        [empresaTrim, tipo]
      );
      if (dup.length > 0) {
        return res.status(409).json({ message: 'Ya existe una credencial de PC y AnyDesk para esa empresa' });
      }
    }

    const {
      nombre,
      usuario,
      password,
      pc,
      pc_password,
      anydesk,
      anydesk_password,
    } = req.body;

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
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message, field: error.field });
    }
    console.error('Error en createClave:', error);
    res.status(500).json({ message: 'Error al crear la clave' });
  }
};

export const updateClave = async (req, res) => {
  const { id } = req.params;
  const body = req.body;

  try {
    const hasFields =
      body.empresa !== undefined ||
      body.tipo !== undefined ||
      body.nombre !== undefined ||
      body.usuario !== undefined ||
      body.password !== undefined ||
      body.pc !== undefined ||
      body.pc_password !== undefined ||
      body.anydesk !== undefined ||
      body.anydesk_password !== undefined;

    if (!hasFields) {
      return res.status(400).json({ message: 'No se proporcionaron campos para actualizar' });
    }

    const [rows] = await pool.query('SELECT * FROM claves WHERE id = ?', [id]);
    if (rows.length === 0) {
      return res.status(404).json({ message: 'Clave no encontrada' });
    }

    const existing = rows[0];
    const newEmpresa = body.empresa !== undefined ? body.empresa.trim() : existing.empresa;
    const newTipo = body.tipo !== undefined ? body.tipo : existing.tipo;
    const newNombre = body.nombre !== undefined ? (body.nombre || '').trim() || null : existing.nombre;

    let validationData;
    let dupQuery;
    let dupParams;
    let updateQuery;
    let updateParams;

    if (newTipo === 'correo') {
      const newUsuario = body.usuario !== undefined ? body.usuario.trim() : existing.usuario;
      const newPassword = body.password !== undefined ? body.password : existing.password;

      validationData = { empresa: newEmpresa, tipo: newTipo, nombre: newNombre, usuario: newUsuario, password: newPassword };
      dupQuery = 'SELECT id FROM claves WHERE empresa = ? AND tipo = ? AND usuario = ? AND id != ?';
      dupParams = [newEmpresa, newTipo, newUsuario, id];
      updateQuery = `UPDATE claves SET empresa = ?, tipo = ?, nombre = ?, usuario = ?, password = ?,
          pc = NULL, pc_password = NULL, anydesk = NULL, anydesk_password = NULL WHERE id = ?`;
      updateParams = [newEmpresa, newTipo, newNombre, newUsuario, newPassword, id];
    } else {
      const newPc = body.pc !== undefined ? body.pc.trim() : existing.pc;
      const newPcPassword = body.pc_password !== undefined ? body.pc_password : existing.pc_password;
      const newAnydesk = body.anydesk !== undefined ? body.anydesk.trim() : existing.anydesk;
      const newAnydeskPassword = body.anydesk_password !== undefined ? body.anydesk_password : existing.anydesk_password;

      validationData = {
        empresa: newEmpresa,
        tipo: newTipo,
        nombre: newNombre,
        pc: newPc,
        pc_password: newPcPassword,
        anydesk: newAnydesk,
        anydesk_password: newAnydeskPassword,
      };
      dupQuery = 'SELECT id FROM claves WHERE empresa = ? AND tipo = ? AND id != ?';
      dupParams = [newEmpresa, newTipo, id];
      updateQuery = `UPDATE claves SET empresa = ?, tipo = ?, nombre = ?, pc = ?, pc_password = ?, anydesk = ?, anydesk_password = ?,
          usuario = NULL, password = NULL WHERE id = ?`;
      updateParams = [newEmpresa, newTipo, newNombre, newPc, newPcPassword, newAnydesk, newAnydeskPassword, id];
    }

    validateClave(validationData);

    const [dup] = await pool.query(dupQuery, dupParams);
    if (dup.length > 0) {
      const label = newTipo === 'correo' ? 'Ya existe un correo con ese valor en esa empresa' : 'Ya existe una credencial de PC y AnyDesk para esa empresa';
      return res.status(409).json({ message: label });
    }

    await pool.query(updateQuery, updateParams);

    res.json({ message: 'Clave actualizada correctamente' });
  } catch (error) {
    if (error instanceof ValidationError) {
      return res.status(400).json({ message: error.message, field: error.field });
    }
    console.error('Error en updateClave:', error);
    res.status(500).json({ message: 'Error al actualizar la clave' });
  }
};

export const deleteClave = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE claves SET estado = 'inactivo' WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Clave no encontrada' });
    }

    res.json({ message: 'Clave inactivada correctamente' });
  } catch (error) {
    console.error('Error en deleteClave:', error);
    res.status(500).json({ message: 'Error al inactivar la clave' });
  }
};

export const restaurarClave = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE claves SET estado = 'activo' WHERE id = ? AND estado = 'inactivo'`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Clave no encontrada o ya está activa' });
    }

    res.json({ message: 'Clave restaurada correctamente' });
  } catch (error) {
    console.error('Error en restaurarClave:', error);
    res.status(500).json({ message: 'Error al restaurar la clave' });
  }
};