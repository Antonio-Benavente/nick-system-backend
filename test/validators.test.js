import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ValidationError,
  validarEvidencias,
  validateEmail
} from '../src/validators/validators.js';
import {
  esUUID,
  validarConformidad,
  validarFiltros,
  validarNuevoTicket
} from '../src/validators/ticketValidators.js';
import { REGEX_CODIGO_TICKET } from '../src/services/ticketService.js';

test('el seguimiento público acepta UUID y código TK-', () => {
  assert.equal(esUUID('3f2b8c1e-8f6a-4a4e-9b1a-2c3d4e5f6a7b'), true);
  assert.equal(esUUID('no-es-uuid'), false);

  assert.equal(REGEX_CODIGO_TICKET.test('TK-AB12345'), true);
  assert.equal(REGEX_CODIGO_TICKET.test('TK-AB1234'), true);
  assert.equal(REGEX_CODIGO_TICKET.test('TK-AB123456'), false);
  assert.equal(REGEX_CODIGO_TICKET.test('12345'), false);
});

test('crear ticket recorta textos y usa modalidad por defecto', () => {
  const datos = validarNuevoTicket({
    empresa_solicitante: '  Acme  ',
    nombre_solicitante: ' Juan ',
    asunto: ' Sin internet ',
    descripcion: ' Llamar a Ana '
  });

  assert.deepEqual(datos, {
    empresa: 'Acme',
    nombre: 'Juan',
    asunto: 'Sin internet',
    descripcion: 'Llamar a Ana',
    modalidad: 'presencial'
  });
});

test('la conformidad exige motivo cuando es no conforme', () => {
  assert.throws(
    () => validarConformidad({ conforme: false }),
    (error) => error instanceof ValidationError && /qué pasó/.test(error.message)
  );

  const datos = validarConformidad({ conforme: false, motivo: 'No quedó bien', aprobado_por: 'Ana' });

  assert.deepEqual(datos, {
    conforme: false,
    aprobadoPor: 'Ana',
    motivo: 'No quedó bien'
  });
});

test('los filtros de fecha exigen el formato YYYY-MM-DD', () => {
  assert.throws(
    () => validarFiltros({ fecha_desde: '01/11/2026' }),
    (error) => error instanceof ValidationError
  );

  assert.deepEqual(validarFiltros({ fecha_desde: '2026-11-01' }), {
    fecha_desde: '2026-11-01'
  });
});

test('las evidencias validan URL, tipo, longitud y orden', () => {
  assert.deepEqual(
    validarEvidencias([
      { url: 'https://res.cloudinary.com/demo/image/upload/foto.jpg', tipo: 'imagen', orden: '2' }
    ]),
    [{ url: 'https://res.cloudinary.com/demo/image/upload/foto.jpg', tipo: 'imagen', orden: 2 }]
  );

  assert.throws(() => validarEvidencias('no-es-array'), ValidationError);
  assert.throws(() => validarEvidencias([{ url: '' }]), ValidationError);
  assert.throws(() => validarEvidencias([{ url: 'https://x.com/a', tipo: 'audio' }]), ValidationError);
  assert.throws(() => validarEvidencias([{ url: 'https://x.com/a', orden: -1 }]), ValidationError);
});

test('el correo se valida de forma básica', () => {
  assert.equal(validateEmail('soporte@nicksystem.com'), true);
  assert.throws(() => validateEmail('sin-arroba'), ValidationError);
});
