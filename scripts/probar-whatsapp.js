import 'dotenv/config';
import pool from '../src/config/db.js';
import { SQL_CODIGO_TICKET } from '../src/services/ticketService.js';
import { ingestarWhatsapp } from '../src/services/ticketIngesta.service.js';

const numero = process.argv[2] || '51992741064';
const nombre = process.argv[3] || 'Cliente WhatsApp';
const datos = process.argv[4] || 'Empresa: Acme\nNombre: Juan Perez\nAsunto: Mi PC no enciende';
const salto = Date.now();

const crearMensaje = (cuerpo) => ({
  from: numero,
  id: `wamid.SIM-${salto}-${Math.random().toString(36).slice(2, 8)}`,
  timestamp: String(Math.floor(Date.now() / 1000)),
  type: 'text',
  text: { body: cuerpo }
});

const contacto = {
  profile: { name: nombre },
  wa_id: numero
};

const marcar = (titulo) => console.log(`\n=== ${titulo} ===`);

marcar('Mensaje 1: el cliente escribe (se espera la bienvenida)');

const primero = await ingestarWhatsapp(crearMensaje('Hola, buenas tardes'), contacto);
console.log('Ticket creado:', primero.creado);
console.log('Esperando datos:', primero.esperando_datos === true);
console.log('Mensaje enviado:', primero.mensaje?.success ? 'sí' : `no (${primero.mensaje?.error})`);

marcar('Mensaje 2: el cliente envia los datos');

const segundo = await ingestarWhatsapp(crearMensaje(datos), contacto);

if (segundo.duplicado) {
  console.log('Ese mensaje ya se había procesado antes (duplicado). No se creó ticket nuevo.');
} else if (segundo.esperando_datos) {
  console.log('Sigue esperando datos: la conversación anterior venció.');
} else {
  const [[ticket]] = await pool.query(
    `SELECT id, uuid, ${SQL_CODIGO_TICKET} AS codigo, canal, empresa_solicitante, nombre_solicitante,
            asunto, contacto_origen, estado
     FROM tickets WHERE uuid = ?`,
    [segundo.uuid]
  );

  console.log('Ticket creado:');
  console.table([ticket]);
  console.log('Acuse WhatsApp:', segundo.acuse);
}

marcar('Conversaciones pendientes');

const [conversaciones] = await pool.query('SELECT numero, mensaje_origen FROM whatsapp_conversaciones');
console.table(conversaciones);

await pool.end();
