import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import pool from '../src/config/db.js';

const email = process.env.ADMIN_EMAIL;
const password = process.env.ADMIN_PASSWORD;

if (!email || !password) {
  console.error('Define ADMIN_EMAIL y ADMIN_PASSWORD antes de ejecutar este script');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);

await pool.query(
  `INSERT INTO users (uuid, name, email, password, role, empresa)
   VALUES (?, 'Administrador General', ?, ?, 'admin', 'NickSystem')
   ON DUPLICATE KEY UPDATE password = VALUES(password), role = 'admin', sesion_version = sesion_version + 1`,
  [randomUUID(), email, hash]
);

console.log(`Administrador asegurado: ${email}`);
await pool.end();
