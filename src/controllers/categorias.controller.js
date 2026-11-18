import { validateCategoria } from '../validators/validators.js';
import {
  listarCategorias,
  crearCategoria as crearCategoriaEnServicio,
  actualizarCategoria as actualizarCategoriaEnServicio,
  eliminarCategoria,
  restaurarCategoria as restaurarCategoriaEnServicio
} from '../services/categorias.service.js';

export const getCategorias = async (req, res) => {
  const categorias = await listarCategorias({
    incluirEliminadas: req.query.incluir_eliminadas === 'true'
  });

  res.json(categorias);
};

export const createCategoria = async (req, res) => {
  validateCategoria(req.body);

  await crearCategoriaEnServicio(req.body.nombre);

  res.status(201).json({ message: 'Categoría creada correctamente' });
};

export const updateCategoria = async (req, res) => {
  validateCategoria(req.body);

  await actualizarCategoriaEnServicio(req.params.id, req.body.nombre);

  res.json({ message: 'Categoría actualizada correctamente' });
};

export const deleteCategoria = async (req, res) => {
  await eliminarCategoria(req.params.id);

  res.json({ message: 'Categoría eliminada correctamente' });
};

export const restaurarCategoria = async (req, res) => {
  await restaurarCategoriaEnServicio(req.params.id);

  res.json({ message: 'Categoría restaurada correctamente' });
};
