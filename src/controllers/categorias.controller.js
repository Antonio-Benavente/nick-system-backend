import pool from '../config/db.js';

// =====================================================
// LISTAR CATEGORÍAS
// =====================================================
export const getCategorias = async (req, res) => {
  try {
    const { incluir_eliminadas } = req.query;
    
    let query = 'SELECT * FROM categorias';
    
    // Por defecto solo mostrar activas
    if (incluir_eliminadas !== 'true') {
      query += ` WHERE estado = 'activo'`;
    }
    
    query += ' ORDER BY nombre';
    
    const [rows] = await pool.query(query);
    res.json(rows);
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al obtener categorías' });
  }
};

// =====================================================
// CREAR CATEGORÍA
// =====================================================
export const createCategoria = async (req, res) => {
  const { nombre } = req.body;

  if (!nombre) {
    return res.status(400).json({ message: 'Nombre requerido' });
  }

  try {
    await pool.query(
      `INSERT INTO categorias (nombre, estado) VALUES (?, 'activo')`,
      [nombre]
    );
    res.status(201).json({ message: 'Categoría creada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear categoría' });
  }
};

// =====================================================
// ACTUALIZAR CATEGORÍA
// =====================================================
export const updateCategoria = async (req, res) => {
  const { id } = req.params;
  const { nombre } = req.body;

  if (!nombre) {
    return res.status(400).json({ message: 'Nombre requerido' });
  }

  try {
    const [result] = await pool.query(
      'UPDATE categorias SET nombre = ? WHERE id = ?',
      [nombre, id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    res.json({ message: 'Categoría actualizada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar categoría' });
  }
};

// =====================================================
// ELIMINAR CATEGORÍA (SOFT DELETE)
// =====================================================
export const deleteCategoria = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE categorias SET estado = 'eliminado' WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Categoría no encontrada' });
    }

    res.json({ message: 'Categoría eliminada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar categoría' });
  }
};

// =====================================================
// RESTAURAR CATEGORÍA
// =====================================================
export const restaurarCategoria = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE categorias SET estado = 'activo' WHERE id = ? AND estado = 'eliminado'`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'Categoría no encontrada o ya está activa' });
    }

    res.json({ message: 'Categoría restaurada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al restaurar categoría' });
  }
};