# syntax=docker/dockerfile:1

FROM node:22-slim
WORKDIR /app

# Como Google Cloud ya nos encerró en la carpeta apps/api/, 
# el package.json está directamente acá al lado nuestro.
COPY package.json ./

# Instalamos las dependencias
RUN npm install

# Copiamos el resto del código (la carpeta src, tsconfig.json, etc.)
COPY . .

# Compilamos el TypeScript (esto crea la carpeta dist/)
RUN npm run build

# Exponemos el puerto de Cloud Run
EXPOSE 8080

# Arrancamos la API
CMD ["npm", "start"]