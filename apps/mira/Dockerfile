# Dockerfile · Mira monorepo subset · Easypanel.
# Mirror estrutural do apps/lara/Dockerfile · porta 3006.

FROM node:20-alpine AS base
RUN apk add --no-cache libc6-compat
RUN corepack enable && corepack prepare pnpm@9.15.0 --activate

# ─── Stage 1: prune subgraph da Mira ──────────────────────────────
FROM base AS pruner
WORKDIR /app
COPY . .
RUN pnpm dlx turbo prune @clinicai/mira --docker

# ─── Stage 2: install + build ─────────────────────────────────────
FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
ENV NEXT_TELEMETRY_DISABLED=1
# 18 commits sessao 2026-04-26 cresceu base ~8700 linhas · build Next.js
# precisa heap 3GB pra nao OOM em container Easypanel default. Sem isso
# o build trava silenciosamente.
ENV NODE_OPTIONS="--max-old-space-size=3072"
RUN pnpm turbo run build --filter=@clinicai/mira

# ─── Stage 3: runner (standalone Next.js) ─────────────────────────
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV PORT=3006
ENV HOSTNAME=0.0.0.0
COPY --from=builder /app/apps/mira/.next/standalone ./
COPY --from=builder /app/apps/mira/.next/static ./apps/mira/.next/static
COPY --from=builder /app/apps/mira/public ./apps/mira/public
EXPOSE 3006
CMD ["node", "apps/mira/server.js"]
