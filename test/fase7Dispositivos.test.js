import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pool from '../src/config/db.js';
import { login } from '../src/controllers/auth.controller.js';
import { revocarDispositivo } from '../src/controllers/dispositivos.controller.js';
import {
  contarDispositivosGlobal,
  crearDispositivo,
  listarDispositivosGlobal,
  revocarDispositivoDeTecnico
} from '../src/services/dispositivos.service.js';

let bdDisponible = false;

try {
  await pool.query('SELECT 1');
  const [tablas] = await pool.query("SHOW TABLES LIKE 'dispositivos'");
  bdDisponible = tablas.length > 0;
} catch {
  bdDisponible = false;
}

const crearTecnico = async (nombre = 'Técnico de pruebas') => {
  const userUuid = randomUUID();
  const tecnicoUuid = randomUUID();
  const email = `tecnico-${userUuid}@pruebas.local`;
  const password = 'clave-de-pruebas';

  const [usuario] = await pool.query(
    `INSERT INTO users (uuid, name, email, password, role)
     VALUES (?, ?, ?, ?, 'tecnico')`,
    [userUuid, nombre, email, await bcrypt.hash(password, 4)]
  );

  await pool.query(
    `INSERT INTO tecnicos (uuid, user_id, nombre, email, estado, fecha_ingreso)
     VALUES (?, ?, ?, ?, 'activo', CURDATE())`,
    [tecnicoUuid, usuario.insertId, nombre, email]
  );

  return { userId: usuario.insertId, userUuid, tecnicoUuid, email, password, nombre };
};

const limpiarTecnico = async ({ userId }) => {
  await pool.query('DELETE FROM users WHERE id = ?', [userId]);
};

const responderFalso = () => ({
  codigo: 200,
  cuerpo: null,
  status(codigo) {
    this.codigo = codigo;
    return this;
  },
  json(cuerpo) {
    this.cuerpo = cuerpo;
    return this;
  }
});

test(
  'el listado global se filtra por técnico y ordena por nombre de dispositivo',
  { skip: !bdDisponible },
  async () => {
    const tecnico = await crearTecnico('F7 Orden Dispositivos');

    try {
      await crearDispositivo({
        sid: randomUUID(),
        userId: tecnico.userId,
        nombre: 'Zeta teléfono',
        plataforma: 'android',
        segundosVigencia: 86400
      });
      await crearDispositivo({
        sid: randomUUID(),
        userId: tecnico.userId,
        nombre: 'Alfa teléfono',
        plataforma: 'ios',
        segundosVigencia: 86400
      });

      const filas = await listarDispositivosGlobal({
        tecnicoUuid: tecnico.tecnicoUuid,
        limite: 50,
        offset: 0
      });

      assert.equal(filas.length, 2);
      assert.equal(filas[0].nombre, 'Alfa teléfono');
      assert.equal(filas[1].nombre, 'Zeta teléfono');
      assert.equal(filas[0].tecnico_uuid, tecnico.tecnicoUuid);
      assert.equal(filas[0].tiene_push, 0);

      const total = await contarDispositivosGlobal({
        tecnicoUuid: tecnico.tecnicoUuid
      });
      assert.equal(total, 2);
    } finally {
      await limpiarTecnico(tecnico);
    }
  }
);

test(
  'el listado global ordena alfabéticamente por técnico',
  { skip: !bdDisponible },
  async () => {
    const tecnicoB = await crearTecnico('ZZ F7 Técnico Beta');
    const tecnicoA = await crearTecnico('AA F7 Técnico Alfa');

    try {
      await crearDispositivo({
        sid: randomUUID(),
        userId: tecnicoB.userId,
        nombre: 'Teléfono Beta',
        segundosVigencia: 86400
      });
      await crearDispositivo({
        sid: randomUUID(),
        userId: tecnicoA.userId,
        nombre: 'Teléfono Alfa',
        segundosVigencia: 86400
      });

      const filas = await listarDispositivosGlobal({ limite: 5000, offset: 0 });
      const indiceAlfa = filas.findIndex(
        (fila) => fila.tecnico_uuid === tecnicoA.tecnicoUuid
      );
      const indiceBeta = filas.findIndex(
        (fila) => fila.tecnico_uuid === tecnicoB.tecnicoUuid
      );

      assert.ok(indiceAlfa >= 0);
      assert.ok(indiceBeta >= 0);
      assert.ok(indiceAlfa < indiceBeta);
    } finally {
      await limpiarTecnico(tecnicoA);
      await limpiarTecnico(tecnicoB);
    }
  }
);

test(
  'revocar un dispositivo guarda el motivo y no revoca los demás',
  { skip: !bdDisponible },
  async () => {
    const tecnico = await crearTecnico('F7 Revocar');
    const sidA = randomUUID();
    const sidB = randomUUID();

    try {
      await crearDispositivo({
        sid: sidA,
        userId: tecnico.userId,
        nombre: 'Teléfono A',
        segundosVigencia: 86400
      });
      await crearDispositivo({
        sid: sidB,
        userId: tecnico.userId,
        nombre: 'Teléfono B',
        segundosVigencia: 86400
      });

      const [dispositivos] = await pool.query(
        'SELECT id, sid FROM dispositivos WHERE user_id = ?',
        [tecnico.userId]
      );
      const dispositivoA = dispositivos.find((fila) => fila.sid === sidA);

      const revocado = await revocarDispositivoDeTecnico(
        tecnico.tecnicoUuid,
        dispositivoA.id,
        'Teléfono perdido'
      );
      assert.equal(revocado, true);

      const [filas] = await pool.query(
        'SELECT sid, revocado_at, motivo_revocacion FROM dispositivos WHERE user_id = ?',
        [tecnico.userId]
      );
      const filaA = filas.find((fila) => fila.sid === sidA);
      const filaB = filas.find((fila) => fila.sid === sidB);

      assert.ok(filaA.revocado_at);
      assert.equal(filaA.motivo_revocacion, 'Teléfono perdido');
      assert.equal(filaB.revocado_at, null);

      const segundaVez = await revocarDispositivoDeTecnico(
        tecnico.tecnicoUuid,
        dispositivoA.id,
        'otra vez'
      );
      assert.equal(segundaVez, false);
    } finally {
      await limpiarTecnico(tecnico);
    }
  }
);

test(
  'no se puede revocar un dispositivo de otro técnico',
  { skip: !bdDisponible },
  async () => {
    const propietario = await crearTecnico('F7 Dueño');
    const ajeno = await crearTecnico('F7 Ajeno');
    const sid = randomUUID();

    try {
      await crearDispositivo({
        sid,
        userId: propietario.userId,
        nombre: 'Teléfono del dueño',
        segundosVigencia: 86400
      });

      const [dispositivos] = await pool.query(
        'SELECT id FROM dispositivos WHERE sid = ?',
        [sid]
      );

      const revocado = await revocarDispositivoDeTecnico(
        ajeno.tecnicoUuid,
        dispositivos[0].id,
        'intento ajeno'
      );
      assert.equal(revocado, false);

      const [filas] = await pool.query(
        'SELECT revocado_at FROM dispositivos WHERE sid = ?',
        [sid]
      );
      assert.equal(filas[0].revocado_at, null);
    } finally {
      await limpiarTecnico(propietario);
      await limpiarTecnico(ajeno);
    }
  }
);

test(
  'revocar exige un motivo',
  { skip: !bdDisponible },
  async () => {
    const tecnico = await crearTecnico('F7 Motivo');
    const sid = randomUUID();

    try {
      await crearDispositivo({
        sid,
        userId: tecnico.userId,
        nombre: 'Teléfono',
        segundosVigencia: 86400
      });

      const [dispositivos] = await pool.query(
        'SELECT id FROM dispositivos WHERE sid = ?',
        [sid]
      );

      await assert.rejects(
        () =>
          revocarDispositivo(
            {
              params: {
                uuid: tecnico.tecnicoUuid,
                id: String(dispositivos[0].id)
              },
              body: {}
            },
            responderFalso()
          ),
        (error) => error.statusCode === 400 && /motivo/i.test(error.message)
      );

      await assert.rejects(
        () =>
          revocarDispositivo(
            {
              params: {
                uuid: tecnico.tecnicoUuid,
                id: String(dispositivos[0].id)
              },
              body: { motivo: 'x'.repeat(51) }
            },
            responderFalso()
          ),
        (error) => error.statusCode === 400 && /50/.test(error.message)
      );

      const [filas] = await pool.query(
        'SELECT revocado_at FROM dispositivos WHERE sid = ?',
        [sid]
      );
      assert.equal(filas[0].revocado_at, null);
    } finally {
      await limpiarTecnico(tecnico);
    }
  }
);

test(
  'después de revocar, el técnico puede iniciar sesión con un dispositivo nuevo',
  { skip: !bdDisponible },
  async () => {
    const tecnico = await crearTecnico('F7 Reingreso');
    const sidViejo = randomUUID();

    try {
      await crearDispositivo({
        sid: sidViejo,
        userId: tecnico.userId,
        nombre: 'Teléfono viejo',
        segundosVigencia: 86400
      });

      const [dispositivos] = await pool.query(
        'SELECT id FROM dispositivos WHERE sid = ?',
        [sidViejo]
      );

      await revocarDispositivoDeTecnico(
        tecnico.tecnicoUuid,
        dispositivos[0].id,
        'sesión cerrada'
      );

      let respuesta = null;
      const res = {
        json(cuerpo) {
          respuesta = cuerpo;
          return this;
        }
      };

      await login(
        {
          body: {
            email: tecnico.email,
            password: tecnico.password,
            dispositivo: {
              nombre: 'Teléfono nuevo',
              plataforma: 'android',
              app_version: '1.0.0'
            }
          },
          get: () => 'app-tecnicos'
        },
        res
      );

      assert.ok(respuesta?.dispositivo?.sid);
      assert.notEqual(respuesta.dispositivo.sid, sidViejo);

      const [filas] = await pool.query(
        'SELECT sid, nombre, revocado_at FROM dispositivos WHERE user_id = ? ORDER BY id',
        [tecnico.userId]
      );

      const viejo = filas.find((fila) => fila.sid === sidViejo);
      const nuevo = filas.find((fila) => fila.sid === respuesta.dispositivo.sid);

      assert.ok(viejo.revocado_at);
      assert.ok(nuevo);
      assert.equal(nuevo.revocado_at, null);
      assert.equal(nuevo.nombre, 'Teléfono nuevo');
    } finally {
      await limpiarTecnico(tecnico);
    }
  }
);

test.after(async () => {
  await pool.end().catch(() => {});
});
