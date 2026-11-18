import pool from '../config/db.js';
import { abortar } from '../middlewares/error.middleware.js';
import { conTransaccion } from './transaccion.service.js';

const normalizar = (valor) => String(valor || '').trim().slice(0, 100);

export const categoriaActiva = async (client, nombre) => {
  const limpio = normalizar(nombre);

  const [cat] = await client.query(
    "SELECT id FROM categorias WHERE nombre = ? AND estado = 'activo'",
    [limpio]
  );

  return cat.length > 0;
};

export const obtenerOCrearCategoria = async (client, nombre) => {
  const limpio = normalizar(nombre);

  if (!limpio) {
    throw new Error('La categoría es requerida');
  }

  const [cat] = await client.query(
    'SELECT id, nombre FROM categorias WHERE nombre = ? AND estado = ?',
    [limpio, 'activo']
  );

  if (cat.length > 0) {
    return { ...cat[0], creada: false };
  }

  const [creada] = await client.query(
    "INSERT INTO categorias (nombre, estado) VALUES (?, 'activo')",
    [limpio]
  );

  return { id: creada.insertId, nombre: limpio, creada: true };
};

export const listarCategorias = async ({ incluirEliminadas = false } = {}) => {
  const [filas] = await pool.query(
    `SELECT id, nombre, estado
     FROM categorias
     ${incluirEliminadas ? '' : "WHERE estado = 'activo'"}
     ORDER BY nombre`
  );

  return filas;
};

export const crearCategoria = async (nombre) => {
  await pool.query(
    `INSERT INTO categorias (nombre, estado) VALUES (?, 'activo')`,
    [nombre.trim()]
  );
};

export const actualizarCategoria = async (id, nombre) => {
  const nombreLimpio = nombre.trim();

  await conTransaccion(async (connection) => {
    const [actual] = await connection.query(
      'SELECT id, nombre FROM categorias WHERE id = ?',
      [id]
    );

    if (actual.length === 0) {
      throw abortar(404, 'Categoría no encontrada');
    }

    const [duplicada] = await connection.query(
      "SELECT id FROM categorias WHERE nombre = ? AND estado = 'activo' AND id != ?",
      [nombreLimpio, id]
    );

    if (duplicada.length > 0) {
      throw abortar(409, 'Ya existe una categoría activa con ese nombre');
    }

    await connection.query(
      'UPDATE categorias SET nombre = ? WHERE id = ?',
      [nombreLimpio, id]
    );

    await connection.query(
      'UPDATE reportes SET categoria = ? WHERE categoria = ?',
      [nombreLimpio, actual[0].nombre]
    );
  });
};

export const eliminarCategoria = async (id) => {
  const [result] = await pool.query(
    `UPDATE categorias SET estado = 'eliminado' WHERE id = ?`,
    [id]
  );

  if (result.affectedRows === 0) {
    throw abortar(404, 'Categoría no encontrada');
  }
};

export const restaurarCategoria = async (id) => {
  const [result] = await pool.query(
    `UPDATE categorias SET estado = 'activo' WHERE id = ? AND estado = 'eliminado'`,
    [id]
  );

  if (result.affectedRows === 0) {
    throw abortar(404, 'Categoría no encontrada o ya está activa');
  }
};

export default {
  categoriaActiva,
  obtenerOCrearCategoria,
  listarCategorias,
  crearCategoria,
  actualizarCategoria,
  eliminarCategoria,
  restaurarCategoria
};
