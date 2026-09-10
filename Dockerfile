# ==========================================
# ETAPA 1: Build
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copiar archivos de dependencias
COPY package.json pnpm-lock.yaml ./

# Instalar dependencias con pnpm
RUN corepack enable && corepack prepare pnpm@11.22.0 --activate \
  && pnpm install --frozen-lockfile --prod

# ==========================================
# ETAPA 2: Production
# ==========================================
FROM node:20-alpine

WORKDIR /app

# Crear usuario no-root
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

# Copiar dependencias desde builder
COPY --from=builder --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copiar código fuente
COPY --chown=nodejs:nodejs . .

# Cambiar a usuario no-root
USER nodejs

# Exponer puerto
EXPOSE 4000

# Variables de entorno por defecto
ENV NODE_ENV=production
ENV PORT=4000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:4000/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Comando de inicio
CMD ["node", "src/server.js"]
