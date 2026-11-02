import test from 'node:test';
import assert from 'node:assert/strict';
import {
  cifrarCamposClave,
  cifrarClave,
  descifrarClave,
  descifrarFilaClave,
  esCifrado
} from '../src/services/clavesCifrado.service.js';

test('cifra y descifra una credencial', () => {
  const original = 'Clave-de-prueba-123';
  const cifrado = cifrarClave(original);

  assert.notEqual(cifrado, original);
  assert.equal(esCifrado(cifrado), true);
  assert.equal(descifrarClave(cifrado), original);
});

test('dos cifrados del mismo valor producen resultados distintos', () => {
  const primero = cifrarClave('misma-clave');
  const segundo = cifrarClave('misma-clave');

  assert.notEqual(primero, segundo);
  assert.equal(descifrarClave(primero), 'misma-clave');
  assert.equal(descifrarClave(segundo), 'misma-clave');
});

test('no vuelve a cifrar un valor ya cifrado', () => {
  const cifrado = cifrarClave('sin-doble-cifrado');

  assert.equal(cifrarClave(cifrado), cifrado);
});

test('deja intactos null, vacíos y valores heredados sin cifrar', () => {
  assert.equal(cifrarClave(null), null);
  assert.equal(cifrarClave(''), '');
  assert.equal(descifrarClave(null), null);
  assert.equal(descifrarClave('texto-plano-antiguo'), 'texto-plano-antiguo');
});

test('cifra y descifra solo los campos de contraseña', () => {
  const fila = {
    empresa: 'Acme',
    usuario: 'soporte@acme.com',
    password: 'correo-123',
    pc: 'PC-01',
    pc_password: 'pc-123',
    anydesk: '123456789',
    anydesk_password: 'any-123'
  };

  const cifrada = cifrarCamposClave(fila);

  assert.equal(cifrada.empresa, 'Acme');
  assert.equal(cifrada.usuario, 'soporte@acme.com');
  assert.equal(cifrada.pc, 'PC-01');
  assert.notEqual(cifrada.password, 'correo-123');
  assert.notEqual(cifrada.pc_password, 'pc-123');
  assert.notEqual(cifrada.anydesk_password, 'any-123');

  const descifrada = descifrarFilaClave(cifrada);

  assert.equal(descifrada.password, 'correo-123');
  assert.equal(descifrada.pc_password, 'pc-123');
  assert.equal(descifrada.anydesk_password, 'any-123');
});

test('rechaza un valor cifrado con formato inválido', () => {
  assert.throws(() => descifrarClave('enc:v1:invalido'), /formato inválido/);
});
