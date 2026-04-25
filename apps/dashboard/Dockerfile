FROM node:20-alpine
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Instala dependencias
COPY package.json package-lock.json* ./
RUN npm ci

# Copia codigo e faz o build
COPY . .
ENV NEXT_TELEMETRY_DISABLED 1

# Webpack em prod (mesma decisao do clinicai-lara · Turbopack instavel)
RUN npm run build

# Producao
ENV NODE_ENV production
ENV PORT 3006
ENV HOSTNAME "0.0.0.0"

EXPOSE 3006

CMD ["npm", "run", "start"]
