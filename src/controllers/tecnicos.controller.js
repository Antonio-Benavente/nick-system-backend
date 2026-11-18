import { validateTecnico, validateTecnicoUpdate } from '../validators/validators.js';
import { abortar } from '../middlewares/error.middleware.js';
import { leerPaginacion, cabeceraPaginacion } from '../services/paginacion.service.js';
import {
  CAMPOS_TECNICO,
  listarTecnicos,
  obtenerTecnicoPorUuid,
  crearTecnico as crearTecnicoEnServicio,
  actualizarTecnico as actualizarTecnicoEnServicio,
  inactivarTecnico,
  restaurarTecnico as restaurarTecnicoEnServicio
} from '../services/tecnicos.service.js';
import { soloDefinidos } from '../utils/objetos.js';

export const getTecnicos = async (req, res) => {
  const paginacion = leerPaginacion(req.query);

  const { filas, total } = await listarTecnicos({
    incluirInactivos: req.query.incluir_inactivos === 'true',
    buscar: req.query.buscar,
    paginacion
  });

  if (paginacion.activa) {
    cabeceraPaginacion(res, { total, ...paginacion });
  }

  res.json(filas);
};

export const getTecnicoByUuid = async (req, res) => {
  const tecnico = await obtenerTecnicoPorUuid(req.params.uuid);

  if (!tecnico) {
    throw abortar(404, 'Técnico no encontrado');
  }

  res.json(tecnico);
};

export const createTecnico = async (req, res) => {
  validateTecnico(req.body);

  if (!req.body.password) {
    throw abortar(
      400,
      'La contraseña es requerida para crear al técnico',
      { message: 'La contraseña es requerida para crear al técnico', field: 'password' }
    );
  }

  const resultado = await crearTecnicoEnServicio(req.body);

  res.status(201).json({
    message: 'Técnico creado correctamente',
    ...resultado
  });
};

export const updateTecnico = async (req, res) => {
  const body = soloDefinidos(req.body, [...CAMPOS_TECNICO, 'password']);

  validateTecnicoUpdate(body);

  await actualizarTecnicoEnServicio(req.params.uuid, body);

  res.json({ message: 'Técnico actualizado correctamente' });
};

export const deleteTecnico = async (req, res) => {
  await inactivarTecnico(req.params.uuid);

  res.json({ message: 'Técnico inactivado correctamente' });
};

export const restaurarTecnico = async (req, res) => {
  await restaurarTecnicoEnServicio(req.params.uuid);

  res.json({ message: 'Técnico restaurado correctamente' });
};
