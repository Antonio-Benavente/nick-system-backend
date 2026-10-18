import "./config/logs.js";
import express from "express";
import cors from "cors";
import helmet from "helmet";
import compression from "compression";
import rateLimit from "express-rate-limit";

import authRoutes from "./routes/auth.routes.js";
import adminRoutes from "./routes/admin.routes.js";
import tecnicosRoutes from "./routes/tecnicos.routes.js";
import clienteRoutes from "./routes/cliente.routes.js";
import categoriasRoutes from "./routes/categorias.routes.js";
import evidenciasRoutes from "./routes/evidencias.routes.js";
import notificacionesRoutes from "./routes/notificaciones.routes.js";
import publicoRoutes from "./routes/publico.routes.js";
import webhooksRoutes from "./routes/webhooks.routes.js";
import { comprobarBaseDatos } from "./services/health.service.js";

import { errorHandler } from "./middlewares/error.middleware.js";
import { asyncHandler } from "./middlewares/async.middleware.js";
import { limiteExcedido } from "./middlewares/limite.middleware.js";

const app = express();

app.set('trust proxy', process.env.TRUST_PROXY || 1);

app.use(helmet());

app.use(
  compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    }
  })
);

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
      callback(null, false);
    }
  },
  credentials: true,
  exposedHeaders: ['X-Total-Count', 'X-Page-Size', 'X-Page-Offset']
};

app.use(cors(corsOptions));

app.use(express.json({
  limit: '1mb',
  verify: (req, res, buf) => {
    req.rawBody = buf;
  }
}));

const apiRouter = express.Router();

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 1000,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  skip: (req) => req.path === '/health',
  handler: limiteExcedido('Demasiadas peticiones. Intenta de nuevo en unos minutos.'),
});

apiRouter.use(apiLimiter);

apiRouter.use("/auth", authRoutes);
apiRouter.use("/admin", adminRoutes);
apiRouter.use("/tecnicos", tecnicosRoutes);
apiRouter.use("/clientes", clienteRoutes);
apiRouter.use("/categorias", categoriasRoutes);
apiRouter.use("/evidencias", evidenciasRoutes);
apiRouter.use("/notificaciones", notificacionesRoutes);
apiRouter.use("/publico", publicoRoutes);

apiRouter.get("/health", asyncHandler(async (req, res) => {
  const { sano: baseDeDatos } = await comprobarBaseDatos();

  res.status(baseDeDatos ? 200 : 503).json({
    status: baseDeDatos ? "ok" : "degradado",
    message: baseDeDatos ? "Backend funcionando 🚀" : "El backend responde pero MySQL no está disponible",
    database: baseDeDatos ? "ok" : "error",
    environment: process.env.NODE_ENV || "development",
    timestamp: new Date().toISOString(),
  });
}));

app.use("/webhooks", webhooksRoutes);

app.use("/", apiRouter);

app.use((req, res) => {
  res.status(404).json({
    message: "Ruta no encontrada",
    path: req.path,
    ...(process.env.NODE_ENV === "development" && {
      hint: "Rutas disponibles: /auth, /admin, /tecnicos, /clientes, /categorias, /evidencias, /notificaciones, /publico, /webhooks, /health"
    })
  });
});

app.use(errorHandler);

export default app;