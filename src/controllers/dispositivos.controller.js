import pool from '../config/db.js';
import { config } from '../config/env.js';
import { abortar } from '../middlewares/error.middleware.js';
import { validarConZod, esquemaPushToken } from '../validators/schemas.js';
import { validarPushToken } from '../validators/validators.js';
import {
  contarDispositivosGlobal,
  listarDispositivosGlobal,
  listarDispositivosTecnico,
  quitarPushToken,
  registrarPushToken,
  revocarDispositivoDeTecnico,
  revocarDispositivos
} from '../services/dispositivos.service.js';
import { leerPaginacion, cabeceraPaginacion } from '../services/paginacion.service.js';

const exigirSesionDeApp = (req) => {
  if (!req.user?.sid) {
    throw abortar(400, 'Esta operación requiere una sesión de la app');
  }

  return req.user.sid;
};

const buscarTecnico = async (uuid) => {
  const [filas] = await pool.query(
    'SELECT id, uuid, user_id FROM tecnicos WHERE uuid = ?',
    [uuid]
  );

  if (!filas.length) throw abortar(404, 'Técnico no encontrado');

  return filas[0];
};

export const registrarPush = async (req, res) => {
  const sid = exigirSesionDeApp(req);

  const datos = validarConZod(esquemaPushToken, req.body, {
    modo: config.FF_ZOD_VALIDATION,
    contexto: 'POST /tecnicos/dispositivos/push'
  });

  const token = validarPushToken(datos.expo_push_token);
  const actualizado = await registrarPushToken(sid, req.user.id, token);

  if (!actualizado) {
    throw abortar(404, 'Dispositivo no encontrado');
  }

  res.json({ message: 'Token de push registrado correctamente' });
};

export const eliminarPush = async (req, res) => {
  const sid = exigirSesionDeApp(req);

  const actualizado = await quitarPushToken(sid, req.user.id);

  if (!actualizado) {
    throw abortar(404, 'Dispositivo no encontrado');
  }

  res.json({ message: 'Token de push eliminado correctamente' });
};

export const listarDispositivos = async (req, res) => {
  const tecnico = await buscarTecnico(req.params.uuid);

  res.json(await listarDispositivosTecnico(tecnico.uuid));
};

export const listarDispositivosAdmin = async (req, res) => {
  const paginacion = leerPaginacion(req.query);
  const tecnicoUuid = req.query.tecnico_uuid
    ? String(req.query.tecnico_uuid).trim()
    : null;

  const total = await contarDispositivosGlobal({ tecnicoUuid });
  cabeceraPaginacion(res, { total, ...paginacion });

  res.json(
    await listarDispositivosGlobal({
      tecnicoUuid,
      limite: paginacion.limite,
      offset: paginacion.offset
    })
  );
};

export const revocarDispositivo = async (req, res) => {
  const tecnico = await buscarTecnico(req.params.uuid);

  const dispositivoId = Number(req.params.id);

  if (!Number.isInteger(dispositivoId) || dispositivoId <= 0) {
    throw abortar(400, 'Dispositivo inválido');
  }

  const motivoCrudo = req.body?.motivo ?? req.query?.motivo;

  if (typeof motivoCrudo !== 'string') {
    throw abortar(400, 'El motivo de revocación es obligatorio');
  }

  const motivo = motivoCrudo.trim();

  if (!motivo) {
    throw abortar(400, 'El motivo de revocación es obligatorio');
  }

  if (motivo.length > 50) {
    throw abortar(400, 'El motivo no puede superar los 50 caracteres');
  }

  const revocado = await revocarDispositivoDeTecnico(
    tecnico.uuid,
    dispositivoId,
    motivo
  );

  if (!revocado) {
    throw abortar(404, 'Dispositivo no encontrado o ya revocado');
  }

  res.json({ message: 'Dispositivo revocado correctamente' });
};

export const cerrarSesiones = async (req, res) => {
  const tecnico = await buscarTecnico(req.params.uuid);

  if (!tecnico.user_id) {
    return res.json({ message: 'El técnico no tiene sesiones activas', revocados: 0 });
  }

  const revocados = await revocarDispositivos(tecnico.user_id, {
    motivo: 'admin_cerrar_sesiones'
  });

  res.json({ message: 'Sesiones cerradas correctamente', revocados });
};
