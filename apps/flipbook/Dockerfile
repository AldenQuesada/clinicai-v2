# Dockerfile flipbook · Easypanel · multi-stage com turbo prune.
# canvas (server-side preview render) precisa libs nativas em build E runtime.
# Build context: root do monorepo. No Easypanel: Dockerfile path = apps/flipbook/Dockerfile.

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ─── Stage 1: prune subgraph do flipbook ──────────────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune @clinicai/flipbook --docker

# ─── Stage 2: install + build ─────────────────────────────────────
# canvas (node-canvas) compila binding nativo via node-gyp · precisa toolchain
# + headers de cairo/pango/etc. NEXT_PUBLIC_* são embed no bundle aqui — passar
# como build-args no Easypanel (Build Settings → Build Args).
FROM base AS builder
WORKDIR /app
RUN apk add --no-cache python3 make g++ pkgconfig \
  cairo-dev pango-dev jpeg-dev giflib-dev librsvg-dev libpng-dev

ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@clinicai/flipbook

# ─── Stage 3: runner (standalone Next.js) ─────────────────────────
# canvas precisa das libs runtime (sem -dev) pra carregar via dlopen.
FROM base AS runner
WORKDIR /app
RUN apk add --no-cache cairo pango jpeg giflib librsvg libpng
ENV NODE_ENV=production
ENV PORT=3333
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/apps/flipbook/.next/standalone ./
COPY --from=builder /app/apps/flipbook/.next/static ./apps/flipbook/.next/static
COPY --from=builder /app/apps/flipbook/public ./apps/flipbook/public
EXPOSE 3333
CMD ["node", "apps/flipbook/server.js"]
