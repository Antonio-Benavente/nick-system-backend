import dotenv from 'dotenv';
import mysql from 'mysql2/promise';

dotenv.config({ quiet: true });

if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL no está definida en las variables de entorno');
  console.error('📍 Por favor, configura la variable en tu archivo .env');
  console.error('📝 Ejemplo: DATABASE_URL=mysql://usuario:password@host:3307/database');
  process.exit(1);
}

console.log('🔌 Creando pool de conexiones MySQL...');

const pool = mysql.createPool({
  uri: process.env.DATABASE_URL,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

console.log('✅ Pool de MySQL configurado correctamente');

pool.on('error', (error) => {
  console.error('Error en una conexión del pool de MySQL:', error.message);
});

pool.getConnection()
  .then(connection => {
    console.log('✅ Conexión inicial a MySQL exitosa');
    connection.release();
  })
  .catch(err => {
    console.error('❌ Error conectando a MySQL:', err.message);
    console.error('🔧 Verifica que:');
    console.error('   1. La URL de conexión sea correcta');
    console.error('   2. El servidor MySQL esté en ejecución');
    console.error('   3. Las credenciales sean válidas');
    console.error('   4. El acceso remoto esté habilitado');
  });

export default pool;