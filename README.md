# clinicai-v2

Sistema de gestão da **Clínica Mirian de Paula** · sucessor moderno do `clinic-dashboard` (vanilla JS). **Monorepo** com 3 apps Next.js + 7 packages compartilhados.

> **Doutrina**: `clinic-dashboard/docs/MIGRATION_DOCTRINE.md`
> **Plano Lara/Mira**: `clinic-dashboard/docs/MIGRATION_LARA_MIRA_PLAN.md`
> **ADRs novos**: 027 (Pattern Next.js), 028 (Multi-tenant inegociável)

---

## Stack

| Camada | Tecnologia | Versão |
|---|---|---|
| Monorepo | Turborepo | 2.x |
| Package manager | pnpm workspaces | 9+ |
| Framework | Next.js | 16.2.4 |
| UI | React | 19.2.4 |
| Linguagem | TypeScript | 5+ strict |
| Estilo | Tailwind | 4 (CSS-first) |
| Backend | Supabase | 2.103+ |
| LLM | Claude Sonnet 4.6 | Anthropic SDK 0.89 |
| Transcrição | Groq Whisper-large-v3 | groq-sdk 1.1 |
| Logger | Pino | 9 |

---

## Estrutura

```
clinicai-v2/
├── apps/
│   ├── lara/         @clinicai/lara       · Inbox WhatsApp + IA · porta 3005
│   │                                       Importado do Ivan (clinicai-lara)
│   ├── mira/         @clinicai/mira       · B2B parcerias · porta 3007 (Fase 2)
│   └── dashboard/    @clinicai/dashboard  · Admin geral · porta 3006
├── packages/
│   ├── tsconfig/     @clinicai/tsconfig   · base, nextjs, library configs
│   ├── utils/        @clinicai/utils      · cn, phone, date helpers
│   ├── logger/       @clinicai/logger     · Pino estruturado (Gap 3)
│   ├── supabase/     @clinicai/supabase   · server/browser clients + tenant resolver (ADR-028)
│   ├── ai/           @clinicai/ai         · Anthropic + Groq + cost control budget (Gap 2)
│   ├── whatsapp/     @clinicai/whatsapp   · Meta Cloud API service per-clinic
│   └── ui/           @clinicai/ui         · Design system Mirian (Tailwind 4 @theme)
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

---

## Setup local

```bash
cd C:/Users/Dr.Quesada/Documents/clinicai-v2

# Instalar deps
pnpm install

# Copiar .env.local de cada app · preencher chaves
cp apps/lara/.env.local.example apps/lara/.env.local
cp apps/dashboard/.env.local.example apps/dashboard/.env.local
# (preencher SUPABASE_SERVICE_ROLE_KEY + ANTHROPIC_API_KEY + GROQ_API_KEY + WHATSAPP_*)

# Dev de um app específico
pnpm dev:lara          # localhost:3005
pnpm dev:dashboard     # localhost:3006

# Ou todos paralelo
pnpm dev

# Validações
pnpm typecheck
pnpm lint
pnpm build
```

---

## Apps

### `apps/lara` · Inbox WhatsApp + IA

**Importado do Ivan** (clinicai-lara) com adaptações pra monorepo:
- Imports `@/lib/supabase` redirecionados pra `@clinicai/supabase`
- Imports `@/lib/anthropic` redirecionados pra `@clinicai/ai/anthropic`
- `globals.css` substituído por `@import "@clinicai/ui/styles/globals.css"`
- `next.config.ts` com CSP cravada (Gap 1) + `transpilePackages` pros workspace deps
- `Dockerfile` minimal usando `turbo prune --docker`

**⚠️ Refactor multi-tenant pendente (ADR-028 · Fase 1.5)**: 4 ocorrências de `clinic_id` hardcoded no `webhook/whatsapp/route.ts` precisam virar resolução via `wa_numbers` + `phone_number_id`. Comentário no topo do arquivo aponta linhas exatas.

**Domínio prod**: `lara.miriandpaula.com.br` (Easypanel · falta DNS + container).

### `apps/mira` · Pipeline B2B

**A criar (Fase 3 do MIGRATION_LARA_MIRA_PLAN)**. Reescreve 4 Edge Functions Deno (b2b-mira-inbound + router + welcome + mira-proactive · 2696 LOC) usando mesma stack da Lara. Prompt `mira-b2b-prompt.md` já existe no repo do Ivan (189 LOC).

**Domínio prod**: `mira.miriandpaula.com.br`.

### `apps/dashboard` · Admin geral

**Foundation atual** (POC com landing). Vai receber módulos legacy migrados conforme oportunidade (ver MIGRATION_DOCTRINE Onda 4+).

**Domínio prod**: `app.miriandpaula.com.br`.

---

## Packages compartilhados

### `@clinicai/supabase`
- `createServerClient(cookieStore)` · RSC autenticado
- `createServiceRoleClient()` · webhook/cron · BYPASSA RLS
- `createBrowserClient()` · Client Components
- `resolveClinicContext(supabase)` · ADR-028 multi-tenant
- `resolveClinicByPhoneNumberId(svc, phone_number_id)` · webhook tenant resolver

### `@clinicai/ai`
- `getAnthropicClient()`, `MODELS` · Sonnet 4.6 default
- `callAnthropic(opts)` · cost control + logging integrados (Gap 2)
- `transcribeAudio(buf, mime)` · Groq Whisper PT-BR
- `checkBudget(clinic_id, source)` · `recordUsage(...)` · gestão diária

### `@clinicai/whatsapp`
- `WhatsAppCloudService` · sendText/sendImage/downloadMedia/markAsRead
- `createWhatsAppCloudFromWaNumber(svc, wa_number_id)` · factory per-clinic (ADR-028)

### `@clinicai/ui`
- `Button` · variants champagne/secondary/outline/ghost/destructive
- `Card` · superfície elevated da marca
- `globals.css` · tokens da marca em `@theme` (oklch) + dark/light themes
- Mais componentes via `pnpm dlx shadcn@latest add <name>` quando precisar

### `@clinicai/logger`
- `createLogger({ app })` · Pino estruturado JSON
- `hashPhone(phone)` · SHA-256 truncado pra log-safe
- `maskEmail(email)` · "f***@gmail.com"

### `@clinicai/utils`
- `cn(...inputs)` · clsx + tailwind-merge
- `normalizePhoneBR(input)` · DDI 55 + 11/13 digits
- `formatPhoneBR(input)` · "(44) 99162-2986"

### `@clinicai/tsconfig`
- `base.json` · ES2022 + strict
- `nextjs.json` · jsx preserve + Next plugin
- `library.json` · declaration: true

---

## Migrations associadas (em `clinic-dashboard/supabase/migrations/`)

- **847** · `inbox_notifications` table + 2 RPCs (sino do dashboard quando Lara escala)
- **848** · `_ai_budget` table + `_ai_budget_check`/`_ai_budget_record` RPCs (Gap 2)

Mesmo Supabase pro clinic-dashboard e clinicai-v2 · migrations seguem template canônico GOLD-STANDARD.

---

## Próximos passos

1. **Alden cria `AldenQuesada/clinicai-v2` privado no GitHub**
2. `git init` + commit inicial + push
3. Aplicar migrations 847 + 848 em prod
4. Configurar Easypanel (3 services + 3 subdomínios)
5. **Fase 1.5**: refactor multi-tenant do webhook Lara (4 hardcoded clinic_id)
6. **Fase 2**: integrar Lara ao CRM (parser tags + auth + fotos antes/depois)
7. **Fase 3**: portar Mira (4 edges → apps/mira)

---

## Convenções

- **Sem `.js`** · sempre `.ts` ou `.tsx`
- **Server Components por padrão** · `'use client'` só quando necessário
- **Imports absolutos via `@/*`** dentro de cada app, `@clinicai/*` entre packages
- **Comentários em PT-BR** seguindo padrão do clinic-dashboard
- **TypeScript strict** + `noUncheckedIndexedAccess` + `exactOptionalPropertyTypes`
- **NÃO usar `// TODO(ADR-028)`** · multi-tenant não é TODO, é requisito (regra cravada)
