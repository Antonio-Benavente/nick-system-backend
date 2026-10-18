import "./config/logs.js";
import app from "./app.js";
import pool from "./config/db.js";
import {
  limpiarConversacionesVencidas,
  limpiarMensajesAntiguos
} from "./services/whatsappConversacion.service.js";
import { iniciarWarmup } from "./services/warmup.service.js";

const INTERVALO_LIMPIEZA_MS = 15 * 60 * 1000;
const APAGADO_MAXIMO_MS = 10000;

if (!process.env.JWT_SECRET) {
  console.error("❌ ERROR: JWT_SECRET no está definida en las variables de entorno");
  process.exit(1);
}

const PORT = process.env.PORT || 4000;

let cerrando = false;

const iniciarLimpieza = () => {
  const tarea = setInterval(async () => {
    try {
      const borradas = await limpiarConversacionesVencidas();
      if (borradas > 0) {
        console.log(`🧹 Conversaciones de WhatsApp vencidas eliminadas: ${borradas}`);
      }
    } catch (error) {
      console.warn('⚠️ Fallo limpiando conversaciones vencidas:', error.message);
    }

    try {
      // El registro de idempotencia solo sirve unos días: pasado ese plazo Meta ya
      // no reintenta y la fila solo ocupa espacio.
      const purgados = await limpiarMensajesAntiguos();
      if (purgados > 0) {
        console.log(`🧹 Mensajes de WhatsApp purgados: ${purgados}`);
      }
    } catch (error) {
      console.warn('⚠️ Fallo purgando mensajes de WhatsApp:', error.message);
    }
  }, INTERVALO_LIMPIEZA_MS);

  tarea.unref();
  return tarea;
};

async function startServer() {
  try {
    await pool.query("SELECT 1");
    console.log("✅ Conectado a MySQL");
  } catch {
    console.warn("⚠️ MySQL no disponible al iniciar");
  }

  const server = app.listen(PORT, () => {
    console.log(`🚀 Servidor corriendo en puerto ${PORT}`);
    console.log(`📍 Entorno: ${process.env.NODE_ENV || "development"}`);
  });

  server.on('error', (error) => {
    if (error.code === 'EADDRINUSE') {
      console.error(`❌ El puerto ${PORT} ya está en uso`);
    } else {
      console.error('❌ Error del servidor HTTP:', error);
    }
    process.exit(1);
  });

  const tareaLimpieza = iniciarLimpieza();
  const tareaWarmup = iniciarWarmup();

  const shutdown = (senal) => {
    if (cerrando) return;
    cerrando = true;

    console.log(`🛑 Cerrando servidor (${senal})...`);
    clearInterval(tareaLimpieza);
    clearInterval(tareaWarmup);

    server.close(() => {
      pool.end().finally(() => process.exit(0));
    });

    setTimeout(() => process.exit(1), APAGADO_MAXIMO_MS).unref();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));

  process.on("unhandledRejection", (razon) => {
    console.error("Promesa rechazada sin manejar:", razon);
  });

  process.on("uncaughtException", (error) => {
    console.error("Excepción no capturada:", error);
    shutdown("uncaughtException");
  });
}

startServer().catch((error) => {
  console.error('❌ No se pudo iniciar el servidor:', error);
  process.exit(1);
});
