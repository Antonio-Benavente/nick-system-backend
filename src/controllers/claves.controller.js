import { validateClave } from '../validators/validators.js';
import { registrarAuditoriaClave } from '../services/auditoria.service.js';
import { leerPaginacion, cabeceraPaginacion } from '../services/paginacion.service.js';
import {
  listarClaves as listarClavesEnServicio,
  crearClave as crearClaveEnServicio,
  actualizarClave as actualizarClaveEnServicio,
  inactivarClave,
  restaurarClave as restaurarClaveEnServicio
} from '../services/claves.service.js';

export const getClaves = async (req, res) => {
  const paginacion = leerPaginacion(req.query);

  await registrarAuditoriaClave(req, 'consulta');

  const { filas, total } = await listarClavesEnServicio({
    incluirInactivos: req.query.incluir_inactivos === 'true',
    buscar: req.query.buscar,
    paginacion
  });

  if (paginacion.activa) {
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  res.json(filas);
};

export const createClave = async (req, res) => {
  validateClave(req.body);

  const id = await crearClaveEnServicio(req.body);

  res.status(201).json({ message: 'Clave creada correctamente', id });

  await registrarAuditoriaClave(req, 'creacion');
};

export const updateClave = async (req, res) => {
  await actualizarClaveEnServicio(req.params.id, req.body);

  res.json({ message: 'Clave actualizada correctamente' });

  await registrarAuditoriaClave(req, 'actualizacion');
};

export const deleteClave = async (req, res) => {
  await inactivarClave(req.params.id);

  res.json({ message: 'Clave inactivada correctamente' });

  await registrarAuditoriaClave(req, 'inactivacion');
};

export const restaurarClave = async (req, res) => {
  await restaurarClaveEnServicio(req.params.id);

  res.json({ message: 'Clave restaurada correctamente' });

  await registrarAuditoriaClave(req, 'restauracion');
};
