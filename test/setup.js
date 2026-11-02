process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'mysql://usuario:clave@localhost:3306/nick_system_test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'secreto-de-pruebas-con-mas-de-16-caracteres';
process.env.CLAVES_ENCRYPTION_KEY = process.env.CLAVES_ENCRYPTION_KEY || 'MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=';
process.env.APP_TIMEZONE = process.env.APP_TIMEZONE || 'America/Lima';
process.env.WHATSAPP_PREFIJO_PAIS = process.env.WHATSAPP_PREFIJO_PAIS || '51';
process.env.LOG_LEVEL = process.env.LOG_LEVEL || 'silent';
