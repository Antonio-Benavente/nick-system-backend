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
import { estadoReadiness } from "./services/health.service.js";

import { config } from "./config/env.js";
import requestContext from "./middlewares/requestContext.middleware.js";
import { errorHandler } from "./middlewares/error.middleware.js";
import { asyncHandler } from "./middlewares/async.middleware.js";
import { limiteExcedido } from "./middlewares/limite.middleware.js";

const app = express();

app.set('trust proxy', config.TRUST_PROXY);

app.use(requestContext);

app.use(helmet());

app.use(
  compression({
    filter: (req, res) => {
      if (req.headers['x-no-compression']) return false;
      return compression.filter(req, res);
    }
  })
);

const ORIGENES_POR_DEFECTO = [
  'https://nicksystem.com',
  'https://www.nicksystem.com',
  'http://localhost:5173'
];

const corsOptions = {
  origin: function (origin, callback) {
    const allowedOrigins = [...ORIGENES_POR_DEFECTO, ...config.ORIGENES_PERMITIDOS];

    if (config.ES_DESARROLLO || !origin) {
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
  exposedHeaders: ['X-Total-Count', 'X-Page-Size', 'X-Page-Offset', 'X-Request-Id', 'Idempotent-Replay']
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
  skip: (req) => req.path === '/health' || req.path === '/ready',
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

apiRouter.get("/health", (req, res) => {
  res.set('Cache-Control', 'no-store').json({
    status: "ok",
    message: "Backend funcionando 🚀",
    uptime: Math.round(process.uptime()),
    environment: config.NODE_ENV,
    timestamp: new Date().toISOString(),
  });
});

apiRouter.get("/ready", asyncHandler(async (req, res) => {
  const estado = await estadoReadiness();

  if (!estado.listo) {
    console.error('Readiness: MySQL no respondió', estado.baseDeDatos.motivo);
  }

  res
    .status(estado.listo ? 200 : 503)
    .set('Cache-Control', 'no-store')
    .json({
      status: estado.listo ? "listo" : "no_listo",
      database: estado.baseDeDatos.sano ? "ok" : "error",
      configuration: estado.configuracion,
      timestamp: new Date().toISOString(),
      ...(config.ES_DESARROLLO && { events: estado.eventos })
    });
}));

app.use("/webhooks", webhooksRoutes);

app.use("/", apiRouter);

app.use((req, res) => {
  res.status(404).json({
    message: "Ruta no encontrada",
    path: req.path,
    requestId: req.id,
    ...(config.ES_DESARROLLO && {
      hint: "Rutas disponibles: /auth, /admin, /tecnicos, /clientes, /categorias, /evidencias, /notificaciones, /publico, /webhooks, /health, /ready"
    })
  });
});

app.use(errorHandler);

export default app;
