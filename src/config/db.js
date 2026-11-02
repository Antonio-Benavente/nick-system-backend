import mysql from 'mysql2/promise';
import { config } from './env.js';

const pool = mysql.createPool({
  uri: config.DATABASE_URL,
  timezone: 'Z',
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0
});

pool.on('error', (error) => {
  console.error('Error en una conexión del pool de MySQL:', error.message);
});

export default pool;
