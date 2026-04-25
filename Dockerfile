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
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
RUN pnpm turbo run build --filter=@clinicai/lara

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
