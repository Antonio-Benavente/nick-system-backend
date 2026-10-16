import { randomUUID } from 'node:crypto';
import pool from '../config/db.js';
import { evidenciaAccesible, reporteAccesible } from '../services/acceso.service.js';
import { abortar } from '../middlewares/error.middleware.js';
import { conTransaccion } from '../services/transaccion.service.js';
import { validarEvidencias } from '../validators/validators.js';

const CAMPOS_EDITABLES = ['url', 'tipo', 'descripcion', 'orden'];
const ORDEN_POR_DEFECTO = 1;

const soloDefinidos = (body, campos) =>
  campos.reduce((acc, campo) => {
    if (body[campo] !== undefined) acc[campo] = body[campo];
    return acc;
  }, {});

export const getEvidencias = async (req, res) => {
  const reporte = await reporteAccesible(req.params.reporte_uuid, req.user);

  if (!reporte) {
    throw abortar(404, 'Reporte no encontrado');
  }

  const [evidencias] = await pool.query(
    `SELECT
      uuid,
      url,
      tipo,
      descripcion,
      orden,
      created_at
    FROM reporte_evidencias
    WHERE reporte_id = ?
    ORDER BY orden ASC, created_at ASC`,
    [reporte.id]
  );

  res.json(evidencias);
};

export const addEvidencia = async (req, res) => {
  const [validada] = validarEvidencias([req.body]);

  const { url, tipo, descripcion, orden } = validada;

  const reporte = await reporteAccesible(req.params.reporte_uuid, req.user);

  if (!reporte) {
    throw abortar(404, 'Reporte no encontrado');
  }

  let ordenFinal = orden ?? null;

  if (ordenFinal === null) {
    const [siguiente] = await pool.query(
      'SELECT COALESCE(MAX(orden), 0) + 1 AS valor FROM reporte_evidencias WHERE reporte_id = ?',
      [reporte.id]
    );
    ordenFinal = siguiente[0].valor;
  }

  const evidenciaUUID = randomUUID();

  await pool.query(
    `INSERT INTO reporte_evidencias
     (uuid, reporte_id, url, tipo, descripcion, orden)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [evidenciaUUID, reporte.id, url, tipo || 'imagen', descripcion || null, ordenFinal]
  );

  res.status(201).json({
    message: 'Evidencia agregada correctamente',
    uuid: evidenciaUUID
  });
};

export const addEvidenciasBatch = async (req, res) => {
  const lista = validarEvidencias(req.body.evidencias);

  if (lista.length === 0) {
    throw abortar(400, 'Debe proporcionar al menos una evidencia');
  }

  const uuids = await conTransaccion(async (connection) => {
    const reporte = await reporteAccesible(req.params.reporte_uuid, req.user, connection);

    if (!reporte) {
      throw abortar(404, 'Reporte no encontrado');
    }

    const [maxOrden] = await connection.query(
      'SELECT COALESCE(MAX(orden), 0) AS max_orden FROM reporte_evidencias WHERE reporte_id = ?',
      [reporte.id]
    );

    let ordenActual = Number(maxOrden[0].max_orden) + 1;
    const creadas = [];

    for (const evidencia of lista) {
      if (!evidencia.url) continue;

      const evidenciaUUID = randomUUID();
      creadas.push(evidenciaUUID);

      await connection.query(
        `INSERT INTO reporte_evidencias
         (uuid, reporte_id, url, tipo, descripcion, orden)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          evidenciaUUID,
          reporte.id,
          evidencia.url,
          evidencia.tipo || 'imagen',
          evidencia.descripcion || null,
          ordenActual++
        ]
      );
    }

    return creadas;
  });

  res.status(201).json({
    message: `${uuids.length} evidencias agregadas correctamente`,
    uuids
  });
};

export const updateEvidencia = async (req, res) => {
  const { uuid } = req.params;

  const evidencia = await evidenciaAccesible(uuid, req.user);

  if (!evidencia) {
    throw abortar(404, 'Evidencia no encontrada');
  }

  const [actual] = await pool.query(
    'SELECT url, tipo, descripcion, orden FROM reporte_evidencias WHERE uuid = ?',
    [uuid]
  );

  const cambios = soloDefinidos(req.body, CAMPOS_EDITABLES);

  if (Object.keys(cambios).length === 0) {
    throw abortar(400, 'No hay campos para actualizar');
  }

  const [validada] = validarEvidencias([{ ...actual[0], ...cambios }], 'evidencia');

  await pool.query(
    `UPDATE reporte_evidencias
     SET url = ?, tipo = ?, descripcion = ?, orden = ?
     WHERE uuid = ?`,
    [
      validada.url,
      validada.tipo || 'imagen',
      validada.descripcion || null,
      validada.orden ?? ORDEN_POR_DEFECTO,
      uuid
    ]
  );

  res.json({ message: 'Evidencia actualizada correctamente' });
};

export const deleteEvidencia = async (req, res) => {
  const { uuid } = req.params;

  const evidencia = await evidenciaAccesible(uuid, req.user);

  if (!evidencia) {
    throw abortar(404, 'Evidencia no encontrada');
  }

  await pool.query('DELETE FROM reporte_evidencias WHERE uuid = ?', [uuid]);

  res.json({ message: 'Evidencia eliminada correctamente' });
};

export const reordenarEvidencias = async (req, res) => {
  const { reporte_uuid } = req.params;
  const { orden } = req.body;

  if (!Array.isArray(orden) || orden.length === 0) {
    throw abortar(400, 'Debe proporcionar un array de UUIDs');
  }

  const normalizado = orden.map((uuid) => (typeof uuid === 'string' ? uuid.trim() : ''));

  if (normalizado.some((uuid) => !uuid)) {
    throw abortar(400, 'Todos los identificadores deben ser textos no vacíos');
  }

  if (new Set(normalizado).size !== normalizado.length) {
    throw abortar(400, 'La lista de UUIDs no puede tener repetidos');
  }

  const reordenadas = await conTransaccion(async (connection) => {
    const reporte = await reporteAccesible(reporte_uuid, req.user, connection);

    if (!reporte) {
      throw abortar(404, 'Reporte no encontrado');
    }

    const [existentes] = await connection.query(
      'SELECT uuid FROM reporte_evidencias WHERE reporte_id = ?',
      [reporte.id]
    );

    const existentesUUIDs = new Set(existentes.map((e) => e.uuid));
    const ajenos = normalizado.filter((uuid) => !existentesUUIDs.has(uuid));

    if (ajenos.length > 0) {
      throw abortar(400, 'Algunas evidencias no pertenecen a este reporte', {
        message: 'Algunas evidencias no pertenecen a este reporte',
        ajenos
      });
    }

    for (let i = 0; i < normalizado.length; i++) {
      await connection.query(
        'UPDATE reporte_evidencias SET orden = ? WHERE uuid = ? AND reporte_id = ?',
        [i + 1, normalizado[i], reporte.id]
      );
    }

    const omitidas = [...existentesUUIDs].filter((uuid) => !normalizado.includes(uuid));

    for (let i = 0; i < omitidas.length; i++) {
      await connection.query(
        'UPDATE reporte_evidencias SET orden = ? WHERE uuid = ? AND reporte_id = ?',
        [normalizado.length + i + 1, omitidas[i], reporte.id]
      );
    }

    return normalizado.length + omitidas.length;
  });

  res.json({
    message: 'Evidencias reordenadas correctamente',
    reordenadas
  });
};
