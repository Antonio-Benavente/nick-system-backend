import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {
  esquemaWebhookResend,
  esquemaWebhookWhatsapp,
  validarConZod
} from '../src/validators/schemas.js';
import { verificarFirmaMeta } from '../src/services/whatsapp.service.js';
import { verificarFirmaSvix } from '../src/services/svix.service.js';

test('el esquema de Resend acepta el evento de correo recibido', () => {
  const evento = {
    type: 'email.received',
    data: { email_id: 'abc-123', from: 'cliente@acme.com', subject: 'Ayuda' }
  };

  assert.equal(esquemaWebhookResend.safeParse(evento).success, true);
  assert.equal(
    esquemaWebhookResend.safeParse({ type: 'email.received', data: {} }).success,
    true
  );
  assert.equal(esquemaWebhookResend.safeParse({ data: {} }).success, false);
});

test('el esquema de WhatsApp exige un arreglo de entradas', () => {
  assert.equal(esquemaWebhookWhatsapp.safeParse({ entry: [] }).success, true);
  assert.equal(esquemaWebhookWhatsapp.safeParse({ entry: {} }).success, false);
  assert.equal(esquemaWebhookWhatsapp.safeParse({}).success, false);
});

test('zod en modo observación no rechaza y en modo enforce sí', () => {
  const datos = { entry: {} };

  assert.deepEqual(validarConZod(esquemaWebhookWhatsapp, datos, { modo: 'observe' }), datos);

  assert.throws(
    () => validarConZod(esquemaWebhookWhatsapp, datos, { modo: 'enforce' }),
    (error) => error.statusCode === 400
  );
});

test('la firma de Meta acepta la firma correcta y rechaza otra', () => {
  const secreto = 'secreto-de-meta';
  const cuerpo = JSON.stringify({ entry: [] });
  const firma = `sha256=${crypto.createHmac('sha256', secreto).update(cuerpo).digest('hex')}`;

  assert.equal(verificarFirmaMeta(cuerpo, firma, secreto), true);
  assert.equal(verificarFirmaMeta(cuerpo, firma, 'otro-secreto'), false);
  assert.equal(verificarFirmaMeta(cuerpo, 'sha256=abc', secreto), false);
  assert.equal(verificarFirmaMeta(cuerpo, null, secreto), false);
});

test('la firma de Svix acepta la firma vigente y rechaza una vencida', () => {
  const secreto = Buffer.from('secreto-de-pruebas').toString('base64');
  const id = 'msg_123';
  const payload = JSON.stringify({ type: 'email.received' });
  const ahora = Math.floor(Date.now() / 1000);

  const firmar = (timestamp) =>
    crypto
      .createHmac('sha256', Buffer.from(secreto, 'base64'))
      .update(`${id}.${timestamp}.${payload}`)
      .digest('base64');

  assert.equal(
    verificarFirmaSvix({
      payload,
      id,
      timestamp: String(ahora),
      signature: `v1,${firmar(ahora)}`,
      secret: secreto
    }),
    true
  );

  const viejo = ahora - 60 * 60;

  assert.equal(
    verificarFirmaSvix({
      payload,
      id,
      timestamp: String(viejo),
      signature: `v1,${firmar(viejo)}`,
      secret: secreto
    }),
    false
  );
});
