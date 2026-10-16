import 'dotenv/config';
import pool from '../src/config/db.js';
import { SQL_CODIGO_TICKET } from '../src/services/ticketService.js';
import { ingestarCorreo } from '../src/services/ticketIngesta.service.js';

const from = process.argv[2] || 'Antonio Benavente <antoniobenavente81@gmail.com>';
const asunto = process.argv[3] || 'Mi PC no enciende';
const cuerpo = process.argv[4] || 'Hola, tengo un problema con mi equipo. ¿Me pueden ayudar?';
const destino = process.argv[5] || 'pruebas@nicksystem.com';

const correo = {
  from,
  to: destino,
  subject: asunto,
  html: `<p>${cuerpo}</p>`,
  text: cuerpo,
  id: 'email.SIM-' + Date.now()
};

const resultado = await ingestarCorreo(correo);

if (resultado.ignorado) {
  console.log('El correo se ignoró porque parece automático.');
  await pool.end();
  process.exit(0);
}

const [[ticket]] = await pool.query(
  `SELECT id, uuid, ${SQL_CODIGO_TICKET} AS codigo,
          canal, empresa_solicitante, nombre_solicitante, asunto, contacto_origen
   FROM tickets WHERE uuid = ?`,
  [resultado.uuid]
);

console.log('Ticket creado:');
console.table([ticket]);
console.log('Acuse correo:', resultado.acuse);
console.log('Notificación interna:', resultado.notificacion);

await pool.end();
process.exitCode = resultado.acuse && resultado.acuse.success ? 0 : 1;
