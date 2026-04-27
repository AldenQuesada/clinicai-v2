# Flipbook · @clinicai/flipbook

Biblioteca digital de livros com leitor em formato flipbook (página vira como livro).

**Porta:** `3333` (mantida histórica · `next dev -p 3333`)
**Stack:** Next.js 16 + React 19 + TS + Tailwind 4 + Supabase + react-pageflip + react-pdf + Framer Motion
**Tema:** dark luxury matching brandbook v2.0 da Mirian (azul-noite + dourado champagne + Cormorant Garamond)

## Comandos

```bash
# dev (raiz do monorepo)
pnpm install
pnpm --filter=@clinicai/flipbook dev

# build
pnpm --filter=@clinicai/flipbook build

# typecheck
pnpm --filter=@clinicai/flipbook typecheck
```

## Setup primeiro deploy

1. **Migration:** rodar `db/migrations/20260800000046_clinicai_v2_flipbook_schema.sql` no Supabase do clinicai-v2 (cria tabelas + bucket `flipbook-pdfs` + RLS).
2. **Env vars:** mesmo `.env` do monorepo (`NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY`).
3. **Criar admin:** no Supabase Dashboard → Authentication → criar user com email/senha. Esse user pode logar em `/login` e acessar `/admin`.
4. **Subir 1º livro:** `/admin` → form de upload → marca "Publicar" → aparece em `/`.

## Estrutura

| Path | O quê |
|---|---|
| `/` | Catálogo público de livros publicados |
| `/[slug]` | Leitor de 1 livro |
| `/admin` | Lista + upload (auth required) |
| `/login` | Login email+senha ou magic link |
| `/auth/callback` | Callback do magic link |

## Roadmap

| Versão | O quê | Status |
|---|---|---|
| **v1.0** | PDF reader · catálogo · upload · auth · PWA · mobile responsive | ✅ MVP atual |
| v1.1 | EPUB + MOBI + CBZ readers (normalizar pra "páginas renderizáveis") | TODO |
| v1.2 | Sistema de overlays clicáveis (links/videos/modals em coords %) | TODO |
| v1.3 | Amazon ASIN integration (botão comprar + meta OG + fetch metadata) | TODO |
| v1.4 | Bookmarks + anotações (text layer pdf.js) | TODO |
| v1.5 | Modo apresentação (fullscreen + voice over TTS) | TODO |
| v1.6 | Som de virar página (toggle, Web Audio) | TODO |

## Notas técnicas

- **react-pageflip** tem peer-dep React 16/17/18 mas funciona em React 19 com `--strict-peer-dependencies=false`. Se quebrar, fallback é fork mantido `@stpageflip/react`.
- **pdfjs worker** carregado via CDN (cdnjs) matching a versão exata da `pdfjs-dist`. Sem isso, `Document` não renderiza.
- **Mobile:** detecta `window.innerWidth < 768` e força single-page (sem double spread). Touch/swipe nativos do react-pageflip.
- **PWA:** `manifest.json` + viewport meta + Apple Web App tags. Pra ícones, gerar 192/512px e colocar em `public/icons/`.
- **Storage:** bucket `flipbook-pdfs` privado · 250MB limit · signed URLs com TTL 1h. Sem signed URL não tem leitura.

## Pendências de polimento

- [ ] Gerar ícones PWA reais (192x512) em `public/icons/`
- [ ] Loading skeleton mais elegante na 1ª renderização
- [ ] Capa cinematográfica de abertura (Framer fade+glow) antes do primeiro flip
- [ ] Som "page turn" opcional
- [ ] Extração de capa (1ª página → PNG) automática no upload
