import app from "./app.js";
import pool from "./config/db.js";

if (!process.env.JWT_SECRET) {
  console.error("❌ ERROR: JWT_SECRET no está definida en las variables de entorno");
  process.exit(1);
}

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Conectado a MySQL");
  } catch (error) {
    console.warn("⚠️ MySQL no disponible al iniciar");
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📍 Entorno: ${process.env.NODE_ENV || "development"}`);
  });

  const shutdown = () => {
    console.log("🛑 Cerrando servidor...");
    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };

  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}

startServer();
