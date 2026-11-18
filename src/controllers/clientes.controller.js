import { validateCliente, validateClienteUpdate } from '../validators/validators.js';
import { abortar } from '../middlewares/error.middleware.js';
import { leerPaginacion, cabeceraPaginacion } from '../services/paginacion.service.js';
import {
  CAMPOS_CLIENTE,
  listarClientes,
  obtenerClientePorUuid,
  crearCliente as crearClienteEnServicio,
  actualizarCliente as actualizarClienteEnServicio,
  inactivarCliente,
  restaurarCliente as restaurarClienteEnServicio
} from '../services/clientes.service.js';
import { soloDefinidos } from '../utils/objetos.js';

export const getClientes = async (req, res) => {
  const paginacion = leerPaginacion(req.query);

  const { filas, total } = await listarClientes({
    incluirInactivos: req.query.incluir_inactivos === 'true',
    buscar: req.query.buscar,
    paginacion
  });

  if (paginacion.activa) {
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  res.json(filas);
};

export const getClienteByUuid = async (req, res) => {
  const cliente = await obtenerClientePorUuid(req.params.uuid);

  if (!cliente) {
    throw abortar(404, 'Cliente no encontrado');
  }

  res.json(cliente);
};

export const createCliente = async (req, res) => {
  validateCliente(req.body);

  const resultado = await crearClienteEnServicio(req.body);

  res.status(201).json({
    message: 'Cliente creado correctamente',
    ...resultado
  });
};

export const updateCliente = async (req, res) => {
  const body = soloDefinidos(req.body, [...CAMPOS_CLIENTE, 'password']);

  validateClienteUpdate(body);

  await actualizarClienteEnServicio(req.params.uuid, body);

  res.json({ message: 'Cliente actualizado correctamente' });
};

export const deleteCliente = async (req, res) => {
  await inactivarCliente(req.params.uuid);

  res.json({ message: 'Cliente inactivado correctamente' });
};

export const restaurarCliente = async (req, res) => {
  await restaurarClienteEnServicio(req.params.uuid);

  res.json({ message: 'Cliente restaurado correctamente' });
};
