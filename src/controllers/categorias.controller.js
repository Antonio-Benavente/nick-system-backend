import pool from '../config/db.js';
import { validateCategoria } from '../validators/validators.js';
import { abortar } from '../middlewares/error.middleware.js';
import { conTransaccion } from '../services/transaccion.service.js';

export const getCategorias = async (req, res) => {
  const incluirTodas = req.query.incluir_eliminadas === 'true';

  const [rows] = await pool.query(
    `SELECT id, nombre, estado
     FROM categorias
     ${incluirTodas ? '' : "WHERE estado = 'activo'"}
     ORDER BY nombre`
  );

  res.json(rows);
};

export const createCategoria = async (req, res) => {
  validateCategoria(req.body);

  await pool.query(
    `INSERT INTO categorias (nombre, estado) VALUES (?, 'activo')`,
    [req.body.nombre.trim()]
  );

  res.status(201).json({ message: 'Categoría creada correctamente' });
};

export const updateCategoria = async (req, res) => {
  validateCategoria(req.body);

  const nombre = req.body.nombre.trim();

  await conTransaccion(async (connection) => {
    const [actual] = await connection.query(
      'SELECT id, nombre FROM categorias WHERE id = ?',
      [req.params.id]
    );

    if (actual.length === 0) {
      throw abortar(404, 'Categoría no encontrada');
    }

    const [duplicada] = await connection.query(
      "SELECT id FROM categorias WHERE nombre = ? AND estado = 'activo' AND id != ?",
      [nombre, req.params.id]
    );

    if (duplicada.length > 0) {
      throw abortar(409, 'Ya existe una categoría activa con ese nombre');
    }

    await connection.query(
      'UPDATE categorias SET nombre = ? WHERE id = ?',
      [nombre, req.params.id]
    );

    await connection.query(
      'UPDATE reportes SET categoria = ? WHERE categoria = ?',
      [nombre, actual[0].nombre]
    );
  });

  res.json({ message: 'Categoría actualizada correctamente' });
};

export const deleteCategoria = async (req, res) => {
  const [result] = await pool.query(
    `UPDATE categorias SET estado = 'eliminado' WHERE id = ?`,
    [req.params.id]
  );

  if (result.affectedRows === 0) {
    throw abortar(404, 'Categoría no encontrada');
  }

  res.json({ message: 'Categoría eliminada correctamente' });
};

export const restaurarCategoria = async (req, res) => {
  const [result] = await pool.query(
    `UPDATE categorias SET estado = 'activo' WHERE id = ? AND estado = 'eliminado'`,
    [req.params.id]
  );

  if (result.affectedRows === 0) {
    throw abortar(404, 'Categoría no encontrada o ya está activa');
  }

  res.json({ message: 'Categoría restaurada correctamente' });
};
