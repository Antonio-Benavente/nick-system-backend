import { horaLima } from '../services/bitacora.service.js';

const NIVELES = ['log', 'info', 'warn', 'error', 'debug'];
const originales = {};

const anteponerHora = (nivel) => (...argumentos) => {
  originales[nivel](`|| ${horaLima()} `, ...argumentos);
};

for (const nivel of NIVELES) {
  originales[nivel] = console[nivel].bind(console);
  console[nivel] = anteponerHora(nivel);
}

export const registros = originales;