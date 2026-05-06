# Dockerfile minimal pro monorepo · Easypanel.
# Usa `turbo prune --docker` pra extrair só o subgrafo da Lara.

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ─── Stage 1: prune subgraph da Lara ──────────────────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune @clinicai/lara --docker

# ─── Stage 2: install + build ─────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
# Cache mount do pnpm store · BuildKit · 30-60s -> 5-10s em rebuilds.
RUN --mount=type=cache,id=pnpm-store,target=/root/.local/share/pnpm/store \
    pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
# Build Next.js 16 + transpilePackages + standalone precisa heap 3GB pra
# nao OOM em container Easypanel default. Mira tem o mesmo · sem isso
# o build trava silenciosamente em "Compiling..." e demora 4x.
ENV NODE_OPTIONS="--max-old-space-size=3072"
# NEXT_PUBLIC_* sao embed no bundle JS aqui (build time) · TEM que vir
# como build-args do Easypanel (Build Settings -> Build Args). Sem isso,
# browser client recebe `undefined` literal em runtime · createBrowserClient
# lanca erro · usePresence/JoinClient/ChangePasswordModal quebram.
# Espelha pattern apps/flipbook/Dockerfile.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG NEXT_PUBLIC_APP_URL
ARG NEXT_PUBLIC_PAINEL_URL
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_PAINEL_URL=$NEXT_PUBLIC_PAINEL_URL
# Cache mount do .next/cache · acelera rebuild incremental do Next.
RUN --mount=type=cache,id=lara-next-cache,target=/app/apps/lara/.next/cache \
    pnpm turbo run build --filter=@clinicai/lara

# ─── Stage 3: runner (standalone Next.js) ─────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3005
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/apps/lara/.next/standalone ./
COPY --from=builder /app/apps/lara/.next/static ./apps/lara/.next/static
COPY --from=builder /app/apps/lara/public ./apps/lara/public
EXPOSE 3005
CMD ["node", "apps/lara/server.js"]
