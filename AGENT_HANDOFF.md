# Agent Handoff · feat/reader-consumes-settings-v2

**Data:** 2026-04-28
**Branch:** `feat/reader-consumes-settings-v2`
**Status:** ENTREGUE · 12/12 commits feitos · push após cada · typecheck verde
**Migrations:** 0800-51..55 já estavam aplicadas no remote · 0800-56 (flipbook_leads) aplicada nesta sessão

---

## Done (12 commits)

| # | Commit | Conteúdo |
|---|---|---|
| 1 | `bab164d` | `settings.controls` · toggles botões (search/zoom/fullscreen/sound/share/print/thumbnails) |
| 2 | `ed64af7` | `settings.pagination.style` · numbers/thumbs/thumbs-numbers/hidden + `PaginationFooter.tsx` novo |
| 3 | `b817c17` | `settings.background.color` · cor sólida no container externo |
| 4 | `e801c18` | `settings.page_effect.sound` · silencia onPageChange.play() se false |
| 5 | `7fe3684` | `settings.logo` · `<LogoOverlay>` plugado, hide em fullscreen |
| 6 | `44755d2` | `settings.bg_audio` · `<BgAudioPlayer>` por range de página, autoplay arm |
| 7 | `3087fcf` | `settings.toc` · prop `customEntries` em `TocSidebar`, header "Sumário do autor" |
| 8 | `011bb8b` | `settings.lead_capture` · `<LeadCaptureModal>` + `POST /api/leads` + tabela `flipbook_leads` (mig 0800-56) |
| 9 | `9101a89` | `settings.redirect_url` · `redirect()` server-side em `[slug]/page.tsx` |
| 10 | `e893c6d` | Password gate · `flipbooks.access_password_hash` + `<PasswordGate>` cliente + `POST /api/flipbooks/[id]/password/verify` (cookie httpOnly 1d) |
| 11 | `03e4e62` | Cinematic `slug={slug}` (persist localStorage) + tracking `cinematic_skip`, `share_copy`, `fullscreen_enter`, `amazon_click`, `reading_engaged` (≥pág3 once), `reading_complete` (≥75% once) |
| 12 | `9b80681` | Plug `<PrintTrechoButton>` no rodapé (PDF, controls.print) + `<EpubSearchPanel>` no slot de busca (EPUB) |

Total: ~520 linhas adicionadas em `Reader.tsx`/`page.tsx`/`flipbooks.ts` + 4 componentes novos + 1 endpoint novo + 1 migration nova.

---

## Arquivos novos

- `apps/flipbook/src/components/reader/PaginationFooter.tsx`
- `apps/flipbook/src/components/reader/LeadCaptureModal.tsx`
- `apps/flipbook/src/components/reader/PasswordGate.tsx`
- `apps/flipbook/src/app/api/leads/route.ts`
- `apps/flipbook/src/app/api/flipbooks/[id]/password/verify/route.ts`
- `db/migrations/20260800000056_clinicai_v2_flipbook_leads.sql` (+ `.down.sql`)
- `tmp/apply-800-56-flipbook-leads.cjs` (gitignored, executado 1x)

## Arquivos modificados

- `apps/flipbook/src/app/[slug]/page.tsx` · adicionou redirect, password gate, passa settings/previewCount pro Reader
- `apps/flipbook/src/app/[slug]/Reader.tsx` · todos os 8 settings consumidos + tracking funnel
- `apps/flipbook/src/components/reader/TocSidebar.tsx` · prop `customEntries`
- `apps/flipbook/src/lib/supabase/flipbooks.ts` · adicionou `access_password_hash` ao Schema

---

## Decisões de implementação

1. **PaginationFooter** novo componente (em vez de hardcodar 4 estilos no Reader). Modo `thumbs/thumbs-numbers` usa JPEGs do bucket `flipbook-previews` (lazy via `loading="lazy"`). `hidden` esconde rodapé inteiro (`paginationStyle !== 'hidden'` no Reader, pra não pintar borda nem mostrar progress bar).

2. **Lead capture** dispara em `currentPage === lead.page` exato. Dismiss persiste em `localStorage` por slug. Após submit do form: `trackEvent('lead_capture_submitted')` + auto-fecha em 1.6s + persist dismiss. Track `lead_capture_shown` no mount, `lead_capture_dismissed` no close (se não submetido).

3. **Password gate** usa cookie httpOnly com VALUE = bcrypt hash atual (não a senha). Se hash mudar (admin trocou senha), cookie invalida automático. TTL 1 dia. Endpoint `verify` usa `createServiceRoleClient` pra bypass RLS (precisa ler hash mesmo anon).

4. **Tracking refs** (`trackedEngaged`, `trackedComplete`, `trackedFullscreen`) via `useRef` pra disparar evento exatamente 1x por sessão (sem flickar nos re-renders).

5. **Search EPUB** condicionou `format === 'epub'` paralelo ao PDF, usando `canvasRef as RefObject<EpubHandle | null>` (cast seguro porque o canvas swap é por format).

---

## Pendente (fase 2 explícita · NÃO tocado)

- `settings.background.image` · só `color` foi consumido (image_url precisaria layer behind canvas, fora do escopo).
- `settings.page_effect.effect/disposition` · só `sound` foi consumido (mudar effect/disposition exigiria swap dinâmico do FlipbookCanvas mode, refatorar pra outra task).
- Lista admin de leads em `/admin/flipbook/[id]/leads` · API/tabela prontas, falta a UI do dashboard (tarefa de painel admin, fora deste escopo).
- View materializada `flipbook_view_counts` (mencionada no comentário de `listAllFlipbooks` mas não criada — escala futura).

---

## Verificação manual (próximo agent ou QA)

1. Abrir um livro publicado · ver botões padrão (todos visíveis).
2. UPDATE settings em SQL: `update flipbooks set settings = jsonb_build_object('controls', jsonb_build_object('zoom', false, 'search', false), 'pagination', jsonb_build_object('style', 'thumbs')) where slug = 'X'` — recarregar reader, conferir que zoom/search sumiram e que rodapé virou tira de thumbs.
3. Adicionar `'lead_capture': {'page': 5, 'title': 'Quer continuar?'}` no settings · navegar até pág 5 · modal aparece · submeter email · checar `select * from flipbook_leads`.
4. POST `/api/flipbooks/{id}/password` setando senha · abrir slug em janela anon · gate aparece · digitar senha · cookie cria · reader libera.

---

## Como rodar typecheck

```bash
pnpm --filter=@clinicai/flipbook typecheck
```

Verde em cada commit (verificado antes de cada push).

---

## URL do PR

https://github.com/AldenQuesada/clinicai-v2/pull/new/feat/reader-consumes-settings-v2
