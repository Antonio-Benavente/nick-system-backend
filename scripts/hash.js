import bcrypt from 'bcryptjs';

const password = process.argv[2] || process.env.PASSWORD;

if (!password) {
  console.error('Uso: node scripts/hash.js "tu-contraseña"');
  process.exit(1);
}

const hash = await bcrypt.hash(password, 10);

console.log(hash);
