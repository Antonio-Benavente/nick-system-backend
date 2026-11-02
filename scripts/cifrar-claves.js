import pool from '../src/config/db.js';
import { CAMPOS_CIFRADOS, cifrarClave, descifrarClave } from '../src/services/clavesCifrado.service.js';

const descifrar = process.argv.includes('--descifrar');
const operacion = descifrar ? descifrarClave : cifrarClave;

const ejecutar = async () => {
  const [filas] = await pool.query(
    `SELECT id, ${CAMPOS_CIFRADOS.join(', ')} FROM claves`
  );

  let filasActualizadas = 0;
  let camposActualizados = 0;

  for (const fila of filas) {
    const cambios = {};

    for (const campo of CAMPOS_CIFRADOS) {
      const nuevo = operacion(fila[campo]);

      if (nuevo !== fila[campo]) {
        cambios[campo] = nuevo;
        camposActualizados++;
      }
    }

    const entradas = Object.entries(cambios);

    if (!entradas.length) continue;

    const asignaciones = entradas.map(([campo]) => `${campo} = ?`).join(', ');
    const valores = entradas.map(([, valor]) => valor);

    await pool.query(`UPDATE claves SET ${asignaciones} WHERE id = ?`, [...valores, fila.id]);
    filasActualizadas++;
  }

  console.log(
    `${descifrar ? 'Descifrado' : 'Cifrado'} completado: ` +
      `${filasActualizadas} filas y ${camposActualizados} campos actualizados de ${filas.length} filas.`
  );
};

try {
  await ejecutar();
} catch (error) {
  console.error('Error procesando claves:', error.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
