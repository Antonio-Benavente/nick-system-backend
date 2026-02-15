import dotenv from 'dotenv';
import pkg from 'pg';
const { Pool } = pkg;

// Cargar variables de entorno
dotenv.config();

// Verificar que la URL de PostgreSQL esté configurada
if (!process.env.DATABASE_URL) {
  console.error('❌ ERROR: DATABASE_URL no está definida en las variables de entorno');
  console.error('📍 Por favor, configura la variable en tu archivo .env');
  console.error('📝 Ejemplo: DATABASE_URL=postgresql://usuario:password@host:5432/database');
  process.exit(1);
}

console.log('🔌 Creando pool de conexiones PostgreSQL...');

// Crear pool de conexiones con configuración mejorada
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? {
    rejectUnauthorized: false
  } : false,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});

console.log('✅ Pool de PostgreSQL configurado correctamente');

// Verificar conexión inicial
pool.query('SELECT NOW()')
  .then(() => {
    console.log('✅ Conexión inicial a PostgreSQL exitosa');
  })
  .catch(err => {
    console.error('❌ Error conectando a PostgreSQL:', err.message);
    console.error('🔧 Verifica que:');
    console.error('   1. La URL de conexión sea correcta');
    console.error('   2. El servidor PostgreSQL esté en ejecución');
    console.error('   3. Las credenciales sean válidas');
  });

// Manejar errores del pool
pool.on('error', (err) => {
  console.error('❌ Error inesperado en el pool de PostgreSQL:', err);
});

// Helper para ejecutar queries con formato de resultados similar a MySQL
export const query = async (text, params) => {
  const result = await pool.query(text, params);
  // Retornar en formato [rows, fields] similar a mysql2
  return [result.rows, result.fields];
};

export default pool;
