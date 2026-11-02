import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatearFechaLima,
  formatearFechaSoloLima,
  formatearFechaHoraLima,
  horaDelDiaLima,
  saludoLima
} from '../src/utils/fechas.js';

test('un ticket de las 20:00 de Lima se muestra con el día real', () => {
  const instante = new Date('2026-11-02T01:00:00Z');

  assert.equal(formatearFechaLima(instante), '01/11/2026 20:00');
  assert.equal(formatearFechaSoloLima(instante), '01/11/2026');
});

test('las fechas puras se muestran tal cual, sin desplazarse', () => {
  assert.equal(formatearFechaSoloLima('2026-11-01'), '01/11/2026');
  assert.equal(formatearFechaHoraLima('2026-11-01'), '01/11/2026');
});

test('los strings de MySQL sin zona se interpretan como UTC', () => {
  assert.equal(formatearFechaLima('2026-11-02 01:00:00'), '01/11/2026 20:00');
});

test('la hora del día se calcula en Lima', () => {
  assert.equal(horaDelDiaLima(new Date('2026-11-02T02:00:00Z')), 21);
  assert.equal(horaDelDiaLima(new Date('2026-11-02T05:00:00Z')), 0);
});

test('el saludo cambia según la hora de Lima', () => {
  assert.equal(saludoLima(new Date('2026-11-02T14:00:00Z')), 'Buenos días');
  assert.equal(saludoLima(new Date('2026-11-02T20:00:00Z')), 'Buenas tardes');
  assert.equal(saludoLima(new Date('2026-11-03T02:00:00Z')), 'Buenas noches');
});
