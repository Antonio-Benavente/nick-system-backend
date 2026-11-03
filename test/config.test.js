import test from 'node:test';
import assert from 'node:assert/strict';
import { validarEntorno } from '../src/config/env.js';

const BASE = {
  NODE_ENV: 'development',
  PORT: '4000',
  DATABASE_URL: 'mysql://usuario:clave@localhost:3306/nick_system',
  JWT_SECRET: 'secreto-de-pruebas-con-mas-de-16-caracteres',
  APP_TIMEZONE: 'America/Lima'
};

const entorno = (cambios = {}) => ({ ...BASE, ...cambios });

test('una configuración mínima de desarrollo es válida', () => {
  const { config, errores } = validarEntorno(entorno());

  assert.deepEqual(errores, []);
  assert.equal(config.ZONA_HORARIA, 'America/Lima');
  assert.deepEqual(config.ORIGENES_PERMITIDOS, []);
  assert.deepEqual(config.EVIDENCIAS_HOSTS_LISTA, ['res.cloudinary.com']);
});

test('en producción falla si falta el grupo de correo', () => {
  const { errores } = validarEntorno(entorno({ NODE_ENV: 'production' }));

  assert.ok(errores.some((error) => error.includes('correo (Resend)')));
  assert.ok(errores.some((error) => error.includes('RESEND_API_KEY')));
});

test('en desarrollo el mismo grupo solo genera avisos', () => {
  const { errores, avisos } = validarEntorno(entorno());

  assert.deepEqual(errores, []);
  assert.ok(avisos.some((aviso) => aviso.includes('correo (Resend)')));
});

test('valida el formato de DATABASE_URL y la longitud de JWT_SECRET', () => {
  const { config, errores } = validarEntorno(
    entorno({
      DATABASE_URL: 'postgres://usuario:clave@localhost:5432/db',
      JWT_SECRET: 'corto'
    })
  );

  assert.equal(config, null);
  assert.ok(errores.some((error) => error.startsWith('DATABASE_URL')));
  assert.ok(errores.some((error) => error.startsWith('JWT_SECRET')));
});

test('valida el puerto y la zona horaria', () => {
  const invalido = validarEntorno(entorno({ PORT: '99999' }));
  assert.equal(invalido.config, null);
  assert.ok(invalido.errores.some((error) => error.startsWith('PORT')));

  const zona = validarEntorno(entorno({ APP_TIMEZONE: 'Marte/Olympus' }));
  assert.ok(zona.errores.some((error) => error.startsWith('APP_TIMEZONE')));
});

test('valida los feature flags y toma los valores por defecto', () => {
  const { config } = validarEntorno(
    entorno({ FF_INCOMING_EVENTS: 'enforce', FF_ZOD_VALIDATION: 'off' })
  );

  assert.equal(config.FF_INCOMING_EVENTS, 'enforce');
  assert.equal(config.FF_ZOD_VALIDATION, 'off');
  assert.equal(config.FF_IDEMPOTENCY, 'off');
  assert.equal(config.FF_PUSH, 'off');
  assert.equal(config.JWT_EXPIRES_IN_APP_TECNICOS, '365d');
  assert.equal(config.APP_TECNICOS_VERSION_MINIMA, '1.0.0');
});

test('rechaza un feature flag desconocido', () => {
  const { config, errores } = validarEntorno(entorno({ FF_INCOMING_EVENTS: 'encendido' }));

  assert.equal(config, null);
  assert.ok(errores.some((error) => error.startsWith('FF_INCOMING_EVENTS')));
});

test('normaliza la lista de orígenes y hosts de evidencias', () => {
  const { config } = validarEntorno(
    entorno({
      ALLOWED_ORIGINS: ' https://a.com , https://b.com ',
      EVIDENCIAS_HOSTS: 'res.cloudinary.com, CDN.ejemplo.com'
    })
  );

  assert.deepEqual(config.ORIGENES_PERMITIDOS, ['https://a.com', 'https://b.com']);
  assert.deepEqual(config.EVIDENCIAS_HOSTS_LISTA, ['res.cloudinary.com', 'cdn.ejemplo.com']);
});

test('valida la clave de cifrado de credenciales', () => {
  const invalida = validarEntorno(entorno({ CLAVES_ENCRYPTION_KEY: 'corta' }));

  assert.equal(invalida.config, null);
  assert.ok(invalida.errores.some((error) => error.startsWith('CLAVES_ENCRYPTION_KEY')));

  const valida = validarEntorno(
    entorno({ CLAVES_ENCRYPTION_KEY: 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=' })
  );

  assert.deepEqual(valida.errores, []);
});

test('en producción exige la clave de cifrado de credenciales', () => {
  const { errores } = validarEntorno(
    entorno({
      NODE_ENV: 'production',
      RESEND_API_KEY: 're_prueba',
      EMAIL_FROM: 'soporte@nicksystem.com',
      RESEND_WEBHOOK_SECRET: 'whsec_prueba',
      WHATSAPP_TOKEN: 'token',
      WHATSAPP_PHONE_NUMBER_ID: '123',
      WHATSAPP_VERIFY_TOKEN: 'verify',
      WHATSAPP_APP_SECRET: 'secret'
    })
  );

  assert.ok(errores.some((error) => error.includes('cifrado de credenciales')));
});
