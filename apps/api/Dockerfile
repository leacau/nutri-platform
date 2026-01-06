# syntax=docker/dockerfile:1

FROM node:22-slim AS base
WORKDIR /app

FROM base AS deps
COPY package*.json ./
COPY apps/api/package*.json apps/api/
RUN npm ci

FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm --workspace apps/api run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=8080
COPY package*.json ./
COPY apps/api/package*.json apps/api/
RUN npm ci --omit=dev
COPY --from=build /app/apps/api/dist ./apps/api/dist
EXPOSE 8080
CMD ["node", "apps/api/dist/index.js"]
