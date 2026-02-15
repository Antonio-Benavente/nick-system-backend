import express from "express";
import cors from "cors";

// Importar rutas
import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import tecnicosRoutes from "./routes/tecnicos.routes.js";
import clienteRoutes from "./routes/cliente.routes.js";
import categoriasRoutes from "./routes/categorias.routes.js";
import evidenciasRoutes from "./routes/evidencias.routes.js";
import notificacionesRoutes from "./routes/notificaciones.routes.js";

// Importar middleware de manejo de errores
import { errorHandler } from "./middlewares/error.middleware.js";

const app = express();

// =====================================================
// CONFIGURACIÃ“N DE CORS
// =====================================================
const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [
      "https://nicksystem.com",
      "https://www.nicksystem.com",
      "http://localhost:5173",
    ];

    if (process.env.NODE_ENV === "development" || !origin) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error("No permitido por CORS"));
    }
  },
  credentials: true,
};

app.use(cors(corsOptions));

// =====================================================
// MIDDLEWARES GLOBALES
// =====================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging en desarrollo
if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

// =====================================================
// CREAR ROUTER PARA /api
// =====================================================
const apiRouter = express.Router();

// Montar todas las rutas bajo /
apiRouter.use("/auth", authRoutes);
apiRouter.use("/admin", adminRoutes);
apiRouter.use("/tecnicos", tecnicosRoutes);
apiRouter.use("/clientes", clienteRoutes);
apiRouter.use("/categorias", categoriasRoutes);
apiRouter.use("/evidencias", evidenciasRoutes);
apiRouter.use("/notificaciones", notificacionesRoutes);

// Health check bajo /
apiRouter.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Backend funcionando 🚀",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

// Montar el router bajo /
app.use("/", apiRouter);


// =====================================================
// RUTA NO ENCONTRADA (404)
// =====================================================
app.use((req, res) => {
  res.status(404).json({
    message: "Ruta no encontrada",
    path: req.path,
    hint: "Las rutas de la API estÃ¡n bajo /api",
  });
});

// =====================================================
// MIDDLEWARE DE MANEJO DE ERRORES
// =====================================================
app.use(errorHandler);

export default app;
