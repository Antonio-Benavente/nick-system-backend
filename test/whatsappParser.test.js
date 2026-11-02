import test from 'node:test';
import assert from 'node:assert/strict';
import {
  camposFaltantes,
  interpretarMensaje,
  mensajeBienvenida,
  mensajeTicketCreado
} from '../src/services/whatsappParser.service.js';

const esperado = (empresa, nombre, asunto, descripcion) => ({
  empresa,
  nombre,
  asunto,
  descripcion
});

test('formato por comas separa solo en las tres primeras comas', () => {
  const datos = interpretarMensaje(
    'Nicksystem, Jose Rios, pc malograda, llamar a julio 995043713 tienda mazda',
    { permitirLibre: true }
  );

  assert.deepEqual(
    esperado('Nicksystem', 'Jose Rios', 'pc malograda', 'llamar a julio 995043713 tienda mazda'),
    { ...datos }
  );
});

test('formato por comas conserva las comas de la descripción', () => {
  const datos = interpretarMensaje(
    'Acme, Juan, Sin internet, llamar a Ana, 999999999, sede centro',
    { permitirLibre: true }
  );

  assert.deepEqual(
    esperado('Acme', 'Juan', 'Sin internet', 'llamar a Ana, 999999999, sede centro'),
    { ...datos }
  );
});

test('formato por comas acepta el ejemplo de la bienvenida', () => {
  const datos = interpretarMensaje(
    'Acme, Juan Pérez, Mi computadora no enciende desde esta mañana, llamar a Juanito 999999999 tienda ate',
    { permitirLibre: true }
  );

  assert.deepEqual(
    esperado(
      'Acme',
      'Juan Pérez',
      'Mi computadora no enciende desde esta mañana',
      'llamar a Juanito 999999999 tienda ate'
    ),
    { ...datos }
  );
});

test('formato por etiquetas acepta Descripcion sin tilde y mayúsculas', () => {
  const datos = interpretarMensaje(
    'EMPRESA: Acme\nNOMBRE: Juan Pérez\nASUNTO: Sin internet\nDESCRIPCION: llamar a Ana 999999999 sede centro'
  );

  assert.deepEqual(
    esperado('Acme', 'Juan Pérez', 'Sin internet', 'llamar a Ana 999999999 sede centro'),
    { ...datos }
  );
});

test('formato por líneas usa las tres primeras y el resto como descripción', () => {
  const datos = interpretarMensaje('Acme\nJuan\nSin internet\nLlamar a Ana\nSede centro', {
    permitirLibre: true
  });

  assert.deepEqual(
    esperado('Acme', 'Juan', 'Sin internet', 'Llamar a Ana\nSede centro'),
    { ...datos }
  );
});

test('tres campos del formato anterior dejan la descripción vacía', () => {
  const datos = interpretarMensaje('Acme, Juan, Sin internet', { permitirLibre: true });

  assert.deepEqual(esperado('Acme', 'Juan', 'Sin internet', ''), { ...datos });
});

test('un mensaje incompleto no inventa un ticket', () => {
  const datos = interpretarMensaje('Hola, necesito ayuda', { permitirLibre: true });

  assert.deepEqual(camposFaltantes(datos), ['empresa', 'nombre', 'asunto']);
});

test('antes de la bienvenida no se interpreta texto libre por comas', () => {
  const datos = interpretarMensaje('Hola, buenas tardes, mi PC no enciende');

  assert.deepEqual(camposFaltantes(datos), ['empresa', 'nombre', 'asunto']);
});

test('la bienvenida pide los cuatro campos y usa el saludo de Lima', () => {
  const mensaje = mensajeBienvenida();

  assert.match(mensaje, /Buenos días|Buenas tardes|Buenas noches/);
  assert.match(mensaje, /Empresa:/);
  assert.match(mensaje, /Nombre:/);
  assert.match(mensaje, /Asunto:/);
  assert.match(mensaje, /Descripción:/);
  assert.match(mensaje, /Ejemplo 2:/);
});

test('el acuse muestra asunto y descripción cuando existen', () => {
  const mensaje = mensajeTicketCreado('TK-AB12345', 'https://nicksystem.com/ticket/123', {
    asunto: 'pc malograda',
    descripcion: 'llamar a julio 995043713'
  });

  assert.match(mensaje, /TK-AB12345/);
  assert.match(mensaje, /pc malograda/);
  assert.match(mensaje, /llamar a julio 995043713/);
});
