import pool from '../config/db.js';
import { conTransaccion } from './transaccion.service.js';

const PLATAFORMAS = ['android', 'ios'];

const FACTORES = { s: 1, m: 60, h: 3600, d: 86400 };

export const segundosDeExpiracion = (valor) => {
  const coincidencia = /^(\d+)\s*(s|m|h|d)?$/i.exec(String(valor || '').trim());

  if (!coincidencia) return 365 * FACTORES.d;

  return Number(coincidencia[1]) * FACTORES[(coincidencia[2] || 's').toLowerCase()];
};

export const plataformaValida = (valor) =>
  PLATAFORMAS.includes(String(valor || '').toLowerCase());

export const crearDispositivo = async ({
  sid,
  userId,
  nombre = null,
  plataforma = 'android',
  appVersion = null,
  segundosVigencia
}) => {
  await pool.query(
    `INSERT INTO dispositivos
       (sid, user_id, nombre, plataforma, app_version, token_vivo_hasta)
     VALUES (?, ?, ?, ?, ?, DATE_ADD(NOW(), INTERVAL ? SECOND))`,
    [
      sid,
      userId,
      nombre ? String(nombre).trim().slice(0, 100) : null,
      plataformaValida(plataforma) ? String(plataforma).toLowerCase() : 'android',
      appVersion ? String(appVersion).trim().slice(0, 20) : null,
      segundosVigencia
    ]
  );

  return { sid };
};

export const revocarDispositivos = async (
  userId,
  { sid = null, motivo = 'manual', conexion = pool } = {}
) => {
  const condiciones = ['user_id = ?', 'revocado_at IS NULL'];
  const parametros = [userId];

  if (sid) {
    condiciones.push('sid = ?');
    parametros.push(sid);
  }

  const [resultado] = await conexion.query(
    `UPDATE dispositivos
     SET revocado_at = NOW(), expo_push_token = NULL, motivo_revocacion = ?
     WHERE ${condiciones.join(' AND ')}`,
    [String(motivo).slice(0, 50), ...parametros]
  );

  return resultado.affectedRows;
};

export const registrarPushToken = async (sid, userId, expoPushToken) => {
  await pool.query(
    'UPDATE dispositivos SET expo_push_token = NULL WHERE expo_push_token = ? AND sid <> ?',
    [expoPushToken, sid]
  );

  const [resultado] = await pool.query(
    `UPDATE dispositivos
     SET expo_push_token = ?, last_seen_at = NOW()
     WHERE sid = ? AND user_id = ? AND revocado_at IS NULL`,
    [expoPushToken, sid, userId]
  );

  return resultado.affectedRows === 1;
};

export const quitarPushToken = async (sid, userId) => {
  const [resultado] = await pool.query(
    `UPDATE dispositivos
     SET expo_push_token = NULL
     WHERE sid = ? AND user_id = ? AND revocado_at IS NULL`,
    [sid, userId]
  );

  return resultado.affectedRows === 1;
};

export const marcarTokenInvalido = async (expoPushToken) => {
  const [resultado] = await pool.query(
    'UPDATE dispositivos SET expo_push_token = NULL WHERE expo_push_token = ?',
    [expoPushToken]
  );

  return resultado.affectedRows;
};

export const tokensDeTecnico = async (tecnicoUuid) => {
  const [filas] = await pool.query(
    `SELECT d.expo_push_token
     FROM dispositivos d
     INNER JOIN tecnicos t ON t.user_id = d.user_id
     WHERE t.uuid = ?
       AND d.revocado_at IS NULL
       AND d.expo_push_token IS NOT NULL`,
    [tecnicoUuid]
  );

  return filas.map((fila) => fila.expo_push_token);
};

export const listarDispositivosTecnico = async (tecnicoUuid) => {
  const [filas] = await pool.query(
    `SELECT
       d.id,
       d.sid,
       d.nombre,
       d.plataforma,
       d.app_version,
       d.created_at,
       d.last_seen_at,
       d.revocado_at,
       d.motivo_revocacion,
       (d.expo_push_token IS NOT NULL) AS tiene_push
     FROM dispositivos d
     INNER JOIN tecnicos t ON t.user_id = d.user_id
     WHERE t.uuid = ?
     ORDER BY d.created_at DESC`,
    [tecnicoUuid]
  );

  return filas;
};

const SELECT_DISPOSITIVO_ADMIN = `
  SELECT
    d.id,
    d.sid,
    t.uuid AS tecnico_uuid,
    t.nombre AS tecnico_nombre,
    d.nombre,
    d.plataforma,
    d.app_version,
    d.created_at,
    d.last_seen_at,
    d.revocado_at,
    d.motivo_revocacion,
    CASE WHEN d.revocado_at IS NULL THEN 'activo' ELSE 'revocado' END AS estado,
    (d.expo_push_token IS NOT NULL) AS tiene_push
  FROM dispositivos d
  INNER JOIN tecnicos t ON t.user_id = d.user_id
`;

export const listarDispositivosGlobal = async ({
  tecnicoUuid = null,
  limite = 25,
  offset = 0,
  conexion = pool
} = {}) => {
  const filtro = tecnicoUuid ? 'WHERE t.uuid = ?' : '';
  const parametros = tecnicoUuid ? [tecnicoUuid] : [];

  const [filas] = await conexion.query(
    `${SELECT_DISPOSITIVO_ADMIN}
     ${filtro}
     ORDER BY t.nombre ASC, d.nombre ASC, d.created_at DESC
     LIMIT ? OFFSET ?`,
    [...parametros, limite, offset]
  );

  return filas;
};

export const contarDispositivosGlobal = async ({
  tecnicoUuid = null,
  conexion = pool
} = {}) => {
  const filtro = tecnicoUuid ? 'WHERE t.uuid = ?' : '';
  const parametros = tecnicoUuid ? [tecnicoUuid] : [];

  const [[fila]] = await conexion.query(
    `SELECT COUNT(*) AS total
     FROM dispositivos d
     INNER JOIN tecnicos t ON t.user_id = d.user_id
     ${filtro}`,
    parametros
  );

  return Number(fila?.total || 0);
};

export const revocarDispositivoDeTecnico = async (tecnicoUuid, dispositivoId, motivo) => {
  const [resultado] = await pool.query(
    `UPDATE dispositivos d
     INNER JOIN tecnicos t ON t.user_id = d.user_id
     SET d.revocado_at = NOW(),
         d.expo_push_token = NULL,
         d.motivo_revocacion = ?
     WHERE d.id = ? AND t.uuid = ? AND d.revocado_at IS NULL`,
    [String(motivo).slice(0, 50), dispositivoId, tecnicoUuid]
  );

  return resultado.affectedRows === 1;
};

export const purgarDispositivosRevocados = async ({ sids = null } = {}) =>
  conTransaccion(async (conexion) => {
    const filtroSids = Array.isArray(sids) && sids.length
      ? `AND sid IN (${sids.map(() => '?').join(', ')})`
      : '';
    const parametros = filtroSids ? sids : [];

    const [filas] = await conexion.query(
      `SELECT id, sid, user_id, nombre, plataforma, app_version,
              created_at, last_seen_at, revocado_at, motivo_revocacion
       FROM dispositivos
       WHERE revocado_at IS NOT NULL
         AND (token_vivo_hasta IS NULL OR token_vivo_hasta <= NOW())
         ${filtroSids}
       FOR UPDATE`,
      parametros
    );

    if (!filas.length) return 0;

    await conexion.query(
      `INSERT INTO dispositivos_auditoria
         (sid, user_id, nombre, plataforma, app_version,
          created_at, last_seen_at, revocado_at, motivo_revocacion)
       VALUES ?`,
      [
        filas.map((fila) => [
          fila.sid,
          fila.user_id,
          fila.nombre,
          fila.plataforma,
          fila.app_version,
          fila.created_at,
          fila.last_seen_at,
          fila.revocado_at,
          fila.motivo_revocacion
        ])
      ]
    );

    await conexion.query('DELETE FROM dispositivos WHERE id IN (?)', [
      filas.map((fila) => fila.id)
    ]);

    return filas.length;
  });
