# clinicai-v2 · app

Foundation do sistema novo da Clínica Mirian de Paula. Espelha a arquitetura do `clinicai-lara` (Ivan): Next.js 16 + React 19 + TypeScript + Tailwind 4 + Supabase.

> **Doutrina**: ver [docs/MIGRATION_DOCTRINE.md](../../clinic-dashboard/docs/MIGRATION_DOCTRINE.md) no repo `clinic-dashboard`. Vanilla JS está aposentado para novos desenvolvimentos.

---

## Setup

```bash
cd app
cp .env.local.example .env.local
# Preencher SUPABASE_SERVICE_ROLE_KEY + ANTHROPIC_API_KEY (Alden tem)

npm install
npm run dev
# http://localhost:3006
```

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Dev server (porta 3006 — não conflita com `clinicai-lara` na 3005) |
| `npm run build` | Build de produção (webpack, não Turbopack) |
| `npm run start` | Servidor de produção |
| `npm run lint` | ESLint (next/core-web-vitals + next/typescript) |
| `npm run typecheck` | `tsc --noEmit` — validação de tipos |

## Estrutura

```
app/
├── src/
│   ├── app/                 # Next.js App Router · páginas + layouts + API routes
│   │   ├── layout.tsx       # Root layout · fontes globais + globals.css
│   │   ├── page.tsx         # Landing (POC atual)
│   │   └── globals.css      # Tailwind 4 + design tokens da marca
│   ├── lib/
│   │   ├── supabase.ts      # Clients server/browser
│   │   ├── anthropic.ts     # Cliente Claude (Sonnet 4.6 default)
│   │   └── utils.ts         # cn() helper (clsx + tailwind-merge)
│   ├── services/            # Lógica de negócio (a popular conforme módulos chegam)
│   └── components/
│       └── ui/              # Sistema de design (shadcn-like, próprio)
├── public/                  # Estáticos
├── package.json
├── tsconfig.json
├── next.config.ts
├── postcss.config.mjs
├── eslint.config.mjs
├── Dockerfile               # Easypanel · porta 3006
└── .env.local.example
```

## Próximos passos (Onda 0)

- [ ] Auth Supabase (login + signup) — usar `@supabase/ssr` pra cookie-based session
- [ ] Layout base (sidebar + topbar) reutilizável
- [ ] Sistema de design — começar com 5-6 componentes (Button, Input, Card, Toast, Modal, Skeleton)
- [ ] Setup ESLint + Prettier + Husky pre-commit
- [ ] CI no GitHub Actions: typecheck + lint + build
- [ ] Domínio `app.miriandpaula.com.br` no Easypanel (cert Let's Encrypt)
- [ ] DEV environment com Supabase local? (a discutir)

## Decisões em aberto

Ver `docs/MIGRATION_DOCTRINE.md` seção "Decisões pendentes":
- Sistema de design (shadcn/ui vs próprio vs mix)
- SSO entre `painel.*`, `lara.*`, `app.*`
- Edge Functions vs API Routes (caso a caso)
- Forms (RHF + Zod recomendado)
- State client (server-first com Zustand pra estado raro)

## Convenções

- **Sem `.js` no app novo** — sempre `.ts`/`.tsx`
- **Sem default exports** exceto onde Next.js exige (page/layout/route)
- **Server Components por padrão** · `'use client'` só quando necessário
- **Imports absolutos via `@/*`** (ver `tsconfig.json`)
- **Naming**: `kebab-case` pra arquivos, `PascalCase` pra componentes, `camelCase` pra funções
- **Comentários em português** seguindo padrão do clinic-dashboard
