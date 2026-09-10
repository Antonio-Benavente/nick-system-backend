import express from "express";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import tecnicosRoutes from "./routes/tecnicos.routes.js";
import clienteRoutes from "./routes/cliente.routes.js";
import categoriasRoutes from "./routes/categorias.routes.js";
import evidenciasRoutes from "./routes/evidencias.routes.js";
import notificacionesRoutes from "./routes/notificaciones.routes.js";

import { errorHandler } from "./middlewares/error.middleware.js";

const app = express();

app.use(helmet());

const corsOptions = {
  origin: function (origin, callback) {
    const envOrigins = (process.env.ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

    const allowedOrigins = [
      "https://nicksystem.com",
      "https://www.nicksystem.com",
      "http://localhost:5173",
      ...envOrigins,
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

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV === "development") {
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.path}`);
    next();
  });
}

const apiRouter = express.Router();

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
});

apiRouter.use(apiLimiter);

apiRouter.use("/auth", authRoutes);
apiRouter.use("/admin", adminRoutes);
apiRouter.use("/tecnicos", tecnicosRoutes);
apiRouter.use("/clientes", clienteRoutes);
apiRouter.use("/categorias", categoriasRoutes);
apiRouter.use("/evidencias", evidenciasRoutes);
apiRouter.use("/notificaciones", notificacionesRoutes);

apiRouter.get("/health", (req, res) => {
  res.json({
    status: "ok",
    message: "Backend funcionando 🚀",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
});

app.use("/", apiRouter);

app.use((req, res) => {
  res.status(404).json({
    message: "Ruta no encontrada",
    path: req.path,
    hint: "Rutas disponibles: /auth, /admin, /tecnicos, /clientes, /categorias, /evidencias, /notificaciones, /health",
  });
});

app.use(errorHandler);

export default app;
