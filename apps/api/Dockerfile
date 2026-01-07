# syntax=docker/dockerfile:1

FROM node:22-slim AS base
WORKDIR /app

# ---------- deps ----------
FROM base AS deps

# Copiamos package.json + package-lock.json del ROOT
COPY package.json package-lock.json ./

# Copiamos el package.json del workspace
COPY apps/api/package.json apps/api/package.json

# Instalamos SOLO lo necesario para el workspace api
RUN npm ci --workspace apps/api --include-workspace-root=false

# ---------- build ----------
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm --workspace apps/api run build

# ---------- runtime ----------
FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080

# Copiamos manifests
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json

# Instalamos SOLO deps de runtime
RUN npm ci --omit=dev --workspace apps/api --include-workspace-root=false

# Copiamos build
COPY --from=build /app/apps/api/dist ./apps/api/dist

EXPOSE 8080
CMD ["node", "apps/api/dist/index.js"]
