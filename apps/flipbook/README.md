# Flipbook · @clinicai/flipbook

Biblioteca digital de livros com leitor em formato flipbook · stack premium Next.js 16 + React 19.

**Porta:** `3333` · **Workspace:** `@clinicai/flipbook` · **Tema:** dark luxury matching brandbook v2.0 Mirian (gold + Cormorant)

## Comandos

```bash
pnpm install
pnpm --filter=@clinicai/flipbook dev          # localhost:3333
pnpm --filter=@clinicai/flipbook build
pnpm --filter=@clinicai/flipbook typecheck
```
Atalhos no root: `pnpm dev:flipbook · pnpm build:flipbook · pnpm start:flipbook`

## Setup primeiro deploy

1. **Migrations** (já aplicadas no Supabase oqboitkpcvuaudouwvkl):
   - `800-46` schema flipbook (3 tabelas + bucket pdfs + RLS)
   - `800-47` bucket flipbook-covers (público, 5MB)
   - `800-48` flipbook_progress (sync cross-device)
2. **Env vars** em `apps/flipbook/.env.local` (já copiado de lara):
   - `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `FLIPBOOK_ADMIN_EMAILS=contato@aldenquesada.org` (csv)
3. **Criar admin user:** Supabase Dashboard → Auth → Add user com email do allowlist
4. **Logar em /login → /admin → subir 1º livro**

## Estrutura

```
apps/flipbook/src/
├── app/
│   ├── (shell)/                  ← layout com sidebar/topbar/cmdpalette
│   │   ├── page.tsx              ← catálogo público
│   │   ├── admin/
│   │   │   ├── page.tsx          ← grid de cards modelo Heyzine
│   │   │   ├── AdminBookCard.tsx ← card com menu contextual
│   │   │   ├── UploadForm.tsx    ← upload + extração metadata
│   │   │   └── [slug]/edit/      ← editor por livro (sidebar STYLE+SETTINGS)
│   │   ├── settings/page.tsx
│   │   └── stats/page.tsx
│   ├── [slug]/                   ← leitor fullscreen (fora do shell)
│   │   ├── page.tsx              ← server: signed URL + metadata + Schema.org
│   │   ├── Reader.tsx            ← orquestrador client (refresh URL, atalhos)
│   │   └── error.tsx             ← error boundary elegante
│   ├── login/                    ← email+senha + magic link
│   ├── api/
│   │   ├── flipbooks/[id]/       ← PATCH/DELETE + duplicate
│   │   ├── refresh-url           ← renova signed URL
│   │   ├── views                 ← analytics page leitura
│   │   └── progress              ← sync cross-device
│   ├── auth/callback/            ← magic link callback
│   ├── sitemap.ts + robots.ts    ← SEO
│   ├── error.tsx                 ← root error boundary
│   └── layout.tsx                ← root + PWA register + fonts
├── components/
│   ├── reader/
│   │   ├── FlipbookCanvas.tsx    ← PDF (react-pageflip + react-pdf)
│   │   ├── EpubCanvas.tsx        ← EPUB (epub.js)
│   │   ├── CbzCanvas.tsx         ← CBZ (JSZip)
│   │   ├── HtmlCanvas.tsx        ← HTML (DOMPurify)
│   │   ├── UnsupportedFormat.tsx ← MOBI placeholder
│   │   ├── CinematicCover.tsx    ← intro animada (Framer)
│   │   └── ResumeBanner.tsx      ← "continuar de onde parou"
│   ├── shell/
│   │   ├── Sidebar.tsx · Topbar.tsx · CommandPalette.tsx · MobileDrawer.tsx
│   │   ├── Shell.tsx             ← orquestrador client
│   │   └── PWARegister.tsx       ← service worker
│   ├── cover/BookCard.tsx        ← catálogo público
│   └── ui/Skeleton.tsx           ← shimmer dourado
├── lib/
│   ├── supabase/                 ← server, browser, flipbooks CRUD
│   ├── pdf/                      ← worker config + extract metadata
│   └── utils/
│       ├── trackView.ts          ← analytics (sendBeacon)
│       ├── useReadingSound.ts    ← som procedural Web Audio
│       └── useProgress.ts        ← sync cross-device hook
├── middleware.ts                 ← gate /admin /settings /stats
└── public/
    ├── sw.js                     ← service worker (cache offline)
    ├── pdfjs/pdf.worker.min.mjs  ← worker bundled local
    └── manifest.json             ← PWA
```

## Features entregues

### Cara de plataforma (Bloco A) ✅
- Sidebar lateral 240px com nav + avatar user + role badge
- Topbar com título dinâmico + busca cmd+k + mobile menu
- Command palette (cmd+k / ctrl+k) busca livros + ações
- User menu com avatar, role, logout
- Mobile drawer hamburger + bottom layout

### Robustez P1 (Bloco B) ✅
- Refresh signed URL automático (interval 50min)
- Admin delete + edit + duplicate com modal de confirmação
- Headers de segurança (CSP estrita, HSTS, X-Frame, Permissions-Policy)
- PDF.js worker bundled local (sem CDN dependency)
- Loading skeleton premium com shimmer dourado

### Multi-formato (Bloco C) ✅
- PDF (react-pdf + react-pageflip)
- EPUB (epub.js com tema dark luxury)
- CBZ (JSZip lazy load)
- HTML (DOMPurify sanitize)
- MOBI/AZW3 placeholder (recomendando Calibre)

### Premium UX (Bloco E) ✅
- Capa cinematográfica de abertura (Framer fade + glow + parallax 3D)
- Som procedural de virar página (Web Audio, toggle persistido, atalho M)
- Modo apresentação fullscreen + cursor hide idle 3s + atalho P + clicker support

### Performance + SEO (Bloco F) ✅ parcial
- Service Worker com 3 caches versionados (static, covers, pages)
- Sitemap dinâmico + robots.txt
- generateMetadata por slug (OG, Twitter, canonical, Schema.org Book JSON-LD)

### UX Heyzine (Bloco UX) ✅
- Admin como grid visual de cards (não mais lista)
- Menu contextual por card: Editor / Preview / Share / Copy link / Editar / Duplicar / Apagar
- Editor por livro `/admin/[slug]/edit` com sidebar STYLE + SETTINGS
- Share + Copy link com Web Share API (mobile native sheet)

### Interatividade (Bloco D) parcial ✅
- Share URL `?p=N` (deep link) + botão copiar página atual

### Wow (Bloco G) parcial ✅
- Sync cross-device · `flipbook_progress` table + ResumeBanner

## TODO próxima ronda

| Item | Bloco | Esforço |
|---|---|---|
| F25 · Pré-render próximas páginas (suaviza virada) | Perf | Médio |
| F28 · Lighthouse 100 (a11y, image opt, bundle splitting) | Perf | Médio |
| E22 · TTS narração (Web Speech API) | Premium | Médio |
| E23 · Theme toggle light/dark | Premium | Pequeno |
| E24 · Tema dinâmico por capa (color extraction) | Premium | Médio |
| D15-D17 · Overlays clicáveis + admin UI + anotações | Interatividade | Grande |
| G29 · AI Companion (RAG · Claude + pgvector) | Wow | Grande |
| EditorClient: implementar background/logo/audio (placeholders SOON) | UX | Médio |
| MOBI conversion automática (kindleunpack-wasm) | Multi-formato | Grande |

## Atalhos do leitor

| Tecla | Ação |
|---|---|
| `→` `PgDn` | Próxima página |
| `←` `PgUp` | Página anterior |
| `F` | Toggle fullscreen |
| `P` | Modo apresentação (fullscreen) |
| `M` | Mute/unmute som virar página |
| `Esc` | Sair fullscreen / pular capa |
| `Enter` `Space` | Pular capa cinematográfica |

## Pipeline de deploy

Recomendado: **Easypanel** apontando pra `apps/flipbook` (output standalone do Next).
Subdomain sugerido: `flipbook.aldenquesada.site` ou `livros.miriandpaula.com.br`.

Build standalone: `pnpm --filter=@clinicai/flipbook build` gera `.next/standalone/` containerizável.

## Quirks técnicos

- **Next 16 + Turbopack default** — `next.config.ts` tem `turbopack: {}` pra silenciar warning
- **react-pageflip** peer-dep React 16-18 mas funciona em React 19 com `--strict-peer-dependencies=false`
- **pdfjs worker** carregado via `/pdfjs/pdf.worker.min.mjs` (bundled, copiar manualmente após upgrade do pdfjs-dist)
- **Mobile** detecta `width < 768` → single-page (sem double spread)
- **Service Worker** só registra em production (NODE_ENV=production)
- **Signed URL TTL** 1h · refresh automático 50min antes
- **EPUB** aceita arquivos ePub 2.0 e 3.0 sem DRM
- **MOBI/AZW3** ainda não suportado · usar Calibre pra converter pra EPUB

## Métricas atuais

- **40+ arquivos** TS/TSX/CSS
- **3.800+ linhas** de código
- **3 migrations** Supabase aplicadas
- **3 buckets** Storage (`flipbook-pdfs` + `flipbook-covers` + auth)
- **8 rotas** acessíveis (1 público, 4 admin gated, 1 reader, 2 SEO + 1 manifest)
- **5 API routes**
- **Typecheck** passa sem erros
