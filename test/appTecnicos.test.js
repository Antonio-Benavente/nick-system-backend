import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import pool from '../src/config/db.js';
import { config } from '../src/config/env.js';
import authMiddleware from '../src/middlewares/auth.middleware.js';
import { login } from '../src/controllers/auth.controller.js';
import { detalleTecnico } from '../src/controllers/ticketsController.js';
import {
  construirPayloadAsignacion,
  construirPayloadReasignacion
} from '../src/services/push.service.js';
import {
  crearDispositivo,
  purgarDispositivosRevocados,
  revocarDispositivos,
  segundosDeExpiracion
} from '../src/services/dispositivos.service.js';
import { validarPushToken } from '../src/validators/validators.js';

let bdDisponible = false;

try {
  await pool.query('SELECT 1');
  const [tablas] = await pool.query("SHOW TABLES LIKE 'dispositivos'");
  bdDisponible = tablas.length > 0;
} catch {
  bdDisponible = false;
}

const crearTecnico = async () => {
  const userUuid = randomUUID();
  const tecnicoUuid = randomUUID();
  const email = `tecnico-${userUuid}@pruebas.local`;

  const [usuario] = await pool.query(
    `INSERT INTO users (uuid, name, email, password, role)
     VALUES (?, 'Técnico de pruebas', ?, 'hash', 'tecnico')`,
    [userUuid, email]
  );

  await pool.query(
    `INSERT INTO tecnicos (uuid, user_id, nombre, email, estado, fecha_ingreso)
     VALUES (?, ?, 'Técnico de pruebas', ?, 'activo', CURDATE())`,
    [tecnicoUuid, usuario.insertId, email]
  );

  return { userId: usuario.insertId, userUuid, tecnicoUuid, email };
};

const limpiarTecnico = async ({ userId, tecnicoUuid }) => {
  await pool.query('DELETE FROM tickets WHERE tecnico_uuid = ?', [tecnicoUuid]);
  await pool.query('DELETE FROM users WHERE id = ?', [userId]);
};

const ejecutarAuth = async (token) => {
  const req = {
    headers: { authorization: `Bearer ${token}` },
    method: 'GET',
    originalUrl: '/prueba'
  };

  let resultado = { req, codigo: 200, cuerpo: null, next: false };

  const res = {
    codigo: 200,
    cuerpo: null,
    status(codigo) {
      this.codigo = codigo;
      return this;
    },
    json(cuerpo) {
      this.cuerpo = cuerpo;
      resultado = { req, codigo: this.codigo, cuerpo, next: false };
      return this;
    }
  };

  await authMiddleware(req, res, (error) => {
    resultado = { req, codigo: 200, cuerpo: null, next: true, error };
  });

  return resultado;
};

test('el payload de asignación no incluye datos sensibles', () => {
  const payload = construirPayloadAsignacion({
    token: 'ExponentPushToken[abc]',
    codigo: 'TK-AJ7ZQVQ',
    ticketUuid: 'uuid-ticket'
  });

  assert.equal(payload.title, 'Nuevo ticket asignado');
  assert.equal(payload.body, 'Código TK-AJ7ZQVQ');
  assert.deepEqual(payload.data, {
    tipo: 'ticket_asignado',
    ticket_uuid: 'uuid-ticket'
  });

  const texto = JSON.stringify(payload);
  assert.ok(!texto.includes('empresa'));
  assert.ok(!texto.includes('cliente'));
  assert.ok(!texto.includes('descripcion'));
});

test('el payload de reasignación apunta a la lista de tickets', () => {
  const payload = construirPayloadReasignacion({
    token: 'ExponentPushToken[abc]',
    codigo: 'TK-AJ7ZQVQ',
    ticketUuid: 'uuid-ticket'
  });

  assert.equal(payload.title, 'Ticket reasignado');
  assert.equal(payload.body, 'Código TK-AJ7ZQVQ ya no está a tu cargo');
  assert.equal(payload.data.tipo, 'ticket_reasignado');
});

test('el token de push valida el formato de Expo', () => {
  assert.equal(
    validarPushToken('ExponentPushToken[abc-123]'),
    'ExponentPushToken[abc-123]'
  );

  assert.throws(() => validarPushToken('token-invalido'), /formato válido/);
  assert.throws(() => validarPushToken(''), /formato válido/);
});

test('segundosDeExpiracion entiende días, horas y segundos', () => {
  assert.equal(segundosDeExpiracion('365d'), 365 * 86400);
  assert.equal(segundosDeExpiracion('12h'), 12 * 3600);
  assert.equal(segundosDeExpiracion('45'), 45);
  assert.equal(segundosDeExpiracion(''), 365 * 86400);
});

test(
  'un admin no puede iniciar sesión desde la app de técnicos',
  { skip: !bdDisponible },
  async () => {
    const email = `admin-${randomUUID()}@pruebas.local`;
    const password = 'clave-de-pruebas';

    const [usuario] = await pool.query(
      `INSERT INTO users (uuid, name, email, password, role)
       VALUES (?, 'Admin de pruebas', ?, ?, 'admin')`,
      [randomUUID(), email, await bcrypt.hash(password, 4)]
    );

    const req = {
      body: { email, password },
      get: () => 'app-tecnicos'
    };

    try {
      await assert.rejects(
        () => login(req, { json: () => {} }),
        (error) => error.statusCode === 403
      );

      const [dispositivos] = await pool.query(
        'SELECT id FROM dispositivos WHERE user_id = ?',
        [usuario.insertId]
      );

      assert.equal(dispositivos.length, 0);
    } finally {
      await pool.query('DELETE FROM users WHERE id = ?', [usuario.insertId]);
    }
  }
);

test(
  'revocar un dispositivo no afecta a los demás del mismo técnico',
  { skip: !bdDisponible },
  async () => {
    const tecnico = await crearTecnico();
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

      await revocarDispositivos(tecnico.userId, {
        sid: sidA,
        motivo: 'logout_app'
      });

      const [filas] = await pool.query(
        'SELECT sid, revocado_at, motivo_revocacion FROM dispositivos WHERE user_id = ? ORDER BY sid',
        [tecnico.userId]
      );

      const filaA = filas.find((fila) => fila.sid === sidA);
      const filaB = filas.find((fila) => fila.sid === sidB);

      assert.ok(filaA.revocado_at);
      assert.equal(filaA.motivo_revocacion, 'logout_app');
      assert.equal(filaB.revocado_at, null);

      await revocarDispositivos(tecnico.userId, { motivo: 'inactivacion' });

      const [todas] = await pool.query(
        'SELECT revocado_at FROM dispositivos WHERE user_id = ?',
        [tecnico.userId]
      );

      assert.ok(todas.every((fila) => fila.revocado_at));
    } finally {
      await limpiarTecnico(tecnico);
    }
  }
);

test(
  'la purga respeta token_vivo_hasta y deja bitácora en auditoría',
  { skip: !bdDisponible },
  async () => {
    const tecnico = await crearTecnico();
    const sidVencido = randomUUID();
    const sidVivo = randomUUID();

    try {
      await crearDispositivo({
        sid: sidVencido,
        userId: tecnico.userId,
        segundosVigencia: 60
      });
      await crearDispositivo({
        sid: sidVivo,
        userId: tecnico.userId,
        segundosVigencia: 86400
      });

      await revocarDispositivos(tecnico.userId, { motivo: 'prueba_purga' });

      await pool.query(
        "UPDATE dispositivos SET token_vivo_hasta = DATE_SUB(NOW(), INTERVAL 1 MINUTE) WHERE sid = ?",
        [sidVencido]
      );
      await pool.query(
        "UPDATE dispositivos SET token_vivo_hasta = DATE_ADD(NOW(), INTERVAL 1 DAY) WHERE sid = ?",
        [sidVivo]
      );

      const purgados = await purgarDispositivosRevocados({
        sids: [sidVencido, sidVivo]
      });
      assert.ok(purgados >= 1);

      const [restantes] = await pool.query(
        'SELECT sid FROM dispositivos WHERE sid IN (?, ?)',
        [sidVencido, sidVivo]
      );
      const sids = restantes.map((fila) => fila.sid);

      assert.ok(!sids.includes(sidVencido));
      assert.ok(sids.includes(sidVivo));

      const [auditoria] = await pool.query(
        'SELECT motivo_revocacion FROM dispositivos_auditoria WHERE sid = ?',
        [sidVencido]
      );

      assert.equal(auditoria.length, 1);
      assert.equal(auditoria[0].motivo_revocacion, 'prueba_purga');
    } finally {
      await pool.query('DELETE FROM dispositivos_auditoria WHERE sid IN (?, ?)', [
        sidVencido,
        sidVivo
      ]);
      await limpiarTecnico(tecnico);
    }
  }
);

test(
  'un token web de técnico sigue validando por sesion_version',
  { skip: !bdDisponible },
  async () => {
    const tecnico = await crearTecnico();

    try {
      const token = jwt.sign(
        {
          id: tecnico.userId,
          uuid: tecnico.userUuid,
          role: 'tecnico',
          sv: 0
        },
        config.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const resultado = await ejecutarAuth(token);

      assert.equal(resultado.codigo, 200);
      assert.ok(resultado.next);
      assert.equal(resultado.req.user.tecnico.uuid, tecnico.tecnicoUuid);
    } finally {
      await limpiarTecnico(tecnico);
    }
  }
);

test(
  'un sid revocado responde 401 en el middleware',
  { skip: !bdDisponible },
  async () => {
    const tecnico = await crearTecnico();
    const sid = randomUUID();

    try {
      await crearDispositivo({
        sid,
        userId: tecnico.userId,
        segundosVigencia: 86400
      });

      const token = jwt.sign(
        {
          id: tecnico.userId,
          uuid: tecnico.userUuid,
          role: 'tecnico',
          sid
        },
        config.JWT_SECRET,
        { expiresIn: '1h' }
      );

      const activo = await ejecutarAuth(token);
      assert.ok(activo.next);

      await revocarDispositivos(tecnico.userId, {
        sid,
        motivo: 'logout_app'
      });

      const revocado = await ejecutarAuth(token);
      assert.equal(revocado.codigo, 401);
    } finally {
      await limpiarTecnico(tecnico);
    }
  }
);

const responderFalso = () => {
  const res = {
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
  };

  return res;
};

test(
  'el detalle de un ticket ajeno responde 404',
  { skip: !bdDisponible },
  async () => {
    const propietario = await crearTecnico();
    const ajeno = await crearTecnico();
    const ticketUuid = randomUUID();

    try {
      await pool.query(
        `INSERT INTO tickets
           (uuid, empresa_solicitante, nombre_solicitante, asunto, descripcion, estado, tecnico_uuid)
         VALUES (?, 'Acme', 'Juan', 'PC no enciende', 'Detalle', 'asignado', ?)`,
        [ticketUuid, propietario.tecnicoUuid]
      );

      const resAjeno = responderFalso();

      await detalleTecnico(
        {
          params: { uuid: ticketUuid },
          user: { tecnico: { uuid: ajeno.tecnicoUuid } }
        },
        resAjeno
      ).catch((error) => {
        resAjeno.codigo = error.statusCode;
        resAjeno.cuerpo = { message: error.message };
      });

      assert.equal(resAjeno.codigo, 404);

      const resPropio = responderFalso();

      await detalleTecnico(
        {
          params: { uuid: ticketUuid },
          user: { tecnico: { uuid: propietario.tecnicoUuid } }
        },
        resPropio
      );

      assert.equal(resPropio.codigo, 200);
      assert.equal(resPropio.cuerpo.uuid, ticketUuid);
    } finally {
      await pool.query('DELETE FROM tickets WHERE uuid = ?', [ticketUuid]);
      await limpiarTecnico(propietario);
      await limpiarTecnico(ajeno);
    }
  }
);

test.after(async () => {
  await pool.end().catch(() => {});
});
