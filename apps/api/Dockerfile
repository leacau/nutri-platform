    # syntax=docker/dockerfile:1

    FROM node:22-slim AS base
    WORKDIR /app

    # ---- deps (root + workspace api) ----
    FROM base AS deps
    COPY package.json package-lock.json ./
    COPY apps/api/package.json apps/api/package.json

    # instala deps del root + del workspace apps/api
    RUN npm ci --legacy-peer-deps --workspace apps/api --include-workspace-root

    # ---- build ----
    FROM base AS build
    COPY --from=deps /app/node_modules ./node_modules
    COPY . .
    RUN npm --workspace apps/api run build

    # ---- runner ----
    FROM node:22-slim AS runner
    WORKDIR /app
    ENV NODE_ENV=production
    ENV PORT=8080

    COPY package.json package-lock.json ./
    COPY apps/api/package.json apps/api/package.json

    # instala prod deps root + workspace (sin dev)
    RUN npm ci --omit=dev --legacy-peer-deps --workspace apps/api --include-workspace-root

    COPY --from=build /app/apps/api/dist ./apps/api/dist

    EXPOSE 8080
    CMD ["node", "apps/api/dist/index.js"]
