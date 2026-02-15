import pool from '../config/db.js';

// =====================================================
// LISTAR CATEGORÃƒÆ’Ã‚ÂAS
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
    res.status(500).json({ message: 'Error al obtener categorÃƒÆ’Ã‚Â­as' });
  }
};

// =====================================================
// CREAR CATEGORÃƒÆ’Ã‚ÂA
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
    res.status(201).json({ message: 'CategorÃƒÆ’Ã‚Â­a creada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al crear categorÃƒÆ’Ã‚Â­a' });
  }
};

// =====================================================
// ACTUALIZAR CATEGORÃƒÆ’Ã‚ÂA
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
      return res.status(404).json({ message: 'CategorÃƒÆ’Ã‚Â­a no encontrada' });
    }

    res.json({ message: 'CategorÃƒÆ’Ã‚Â­a actualizada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al actualizar categorÃƒÆ’Ã‚Â­a' });
  }
};

// =====================================================
// ELIMINAR CATEGORÃƒÆ’Ã‚ÂA (SOFT DELETE)
// =====================================================
export const deleteCategoria = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE categorias SET estado = 'eliminado' WHERE id = ?`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'CategorÃƒÆ’Ã‚Â­a no encontrada' });
    }

    res.json({ message: 'CategorÃƒÆ’Ã‚Â­a eliminada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al eliminar categorÃƒÆ’Ã‚Â­a' });
  }
};

// =====================================================
// RESTAURAR CATEGORÃƒÆ’Ã‚ÂA
// =====================================================
export const restaurarCategoria = async (req, res) => {
  const { id } = req.params;

  try {
    const [result] = await pool.query(
      `UPDATE categorias SET estado = 'activo' WHERE id = ? AND estado = 'eliminado'`,
      [id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ message: 'CategorÃƒÆ’Ã‚Â­a no encontrada o ya estÃƒÆ’Ã‚Â¡ activa' });
    }

    res.json({ message: 'CategorÃƒÆ’Ã‚Â­a restaurada correctamente' });
  } catch (error) {
    console.error(error);
    res.status(500).json({ message: 'Error al restaurar categorÃƒÆ’Ã‚Â­a' });
  }
};