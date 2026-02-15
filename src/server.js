import dotenv from "dotenv";
dotenv.config({ quiet: true });

import app from "./app.js";
import pool from "./config/db.js";

const PORT = process.env.PORT || 4000;

async function startServer() {
  try {
    // Verificar conexión a la base de datos
    await pool.query("SELECT 1");
    console.log("✅ Conectado a MySQL");
  } catch (error) {
    console.warn("⚠️ MySQL no disponible al iniciar");
  }

  // Iniciar servidor
  app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📍 Entorno: ${process.env.NODE_ENV || "development"}`);
  });
}

startServer();
