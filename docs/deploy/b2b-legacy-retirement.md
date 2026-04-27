# Roadmap · aposentar B2B legacy (clinic-dashboard)

> Snapshot 2026-04-27 · Alden + Claude. Source-of-truth pra plano de retirada
> definitivo. Atualizar conforme cada etapa fechar.

## Estado atual

**Frontend B2B** (parceiros, vouchers, métricas, comm) vive 100% em
`apps/mira` no monorepo `clinicai-v2`. Deploy: `mira.miriandpaula.com.br`.

**Sidebar do clinic-dashboard** (commit `fe9ec3a`) tem 1 único item B2B
apontando pra `https://mira.miriandpaula.com.br/partnerships` (open new tab).

**Pages legacy** `b2b-partners.html`, `b2b-metrics-v2.html`, `b2b-metrics.html`
viraram redirect stubs (commit `aaf7491`) pra preservar bookmarks/links externos.

**Edge functions** (12 B2B) ainda hospedadas no Supabase project `oqboitkpcvuaudouwvkl`.
Source code copiado pra `clinicai-v2/supabase/functions/` (mesmo project, mesma URL).

**DB** continua único · clinic-dashboard e clinicai-v2 lêem/escrevem mesmas tabelas.

## Fluxo de chamadas atual

```
[clinic-dashboard sidebar]
  └─ B2B (Mira) ↗ → https://mira.miriandpaula.com.br/partnerships (Next.js 16 standalone)
     └─ usa Supabase project oqboitkpcvuaudouwvkl
        ├─ tabelas: b2b_* (partnerships, vouchers, comm_*, scout_*, attributions)
        ├─ edges: b2b-* (12 functions, hospedadas via supabase deploy)
        └─ crons: mira-cron-* + mira_cron_jobs registry

[Evolution API webhook]
  └─ POST → apps/mira/api/webhook/evolution (NOVO · canônico)
     └─ supabase functions/b2b-mira-inbound (LEGACY · ainda recebe se n8n nao migrou)
```

## Etapas pra aposentar 100% legacy

| # | Etapa | Status | Bloqueio |
|---|---|---|---|
| 1 | Frontend B2B migrado pra `apps/mira` | ✅ done | — |
| 2 | Sidebar clinic-dashboard aponta pra Mira (1 link só) | ✅ done | — |
| 3 | Pages legacy B2B viram redirect stubs | ✅ done | — |
| 4 | Source code 12 edges copiado pra `clinicai-v2/supabase/functions/` | ✅ done | — |
| 5 | Deploy edges via `clinicai-v2` (substituir versão hospedada · mesma URL) | ✅ done | 12 edges deployadas 2026-04-27 (v+1 cada) · smoke N2 24/24 |
| 6 | n8n/Evolution apontar webhook pra `apps/mira/api/webhook/evolution` | ✅ done | desde 2026-04-26 18:50 SP · 24 msgs/24h · 0 failed (descoberto via webhook_processing_queue 2026-04-27) |
| 7 | Remover `b2b-mira-inbound` + `b2b-mira-router` do Supabase (legacy router) | ⏭️ ready | zero tráfego há 24h+ · seguro pra remover |
| 8 | Pausar deploy clinic-dashboard no Easypanel | ⏭️ pending | requer #2-#5 estáveis em prod |
| 9 | Redirect 301 painel.miriandpaula.com.br → mira.miriandpaula.com.br | ⏭️ pending | requer #8 |

## Notas operacionais

### Deploy das edges via clinicai-v2 (etapa 5)

Pré-requisitos:
- Supabase CLI logado (`supabase login`)
- Projeto linkado: `cd clinicai-v2/supabase && supabase link --project-ref oqboitkpcvuaudouwvkl`
- Secrets configurados no project: `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `EVOLUTION_API_KEY`

Deploy todas:
```bash
cd clinicai-v2/supabase
for f in b2b-comm-dispatch b2b-mira-inbound b2b-mira-router b2b-mira-welcome \
         b2b-voucher-audio b2b-voucher-og b2b-voucher-share \
         b2b-candidate-evaluate b2b-insights-generator b2b-playbook-ia \
         b2b-scout-scan b2b-weekly-insight; do
  supabase functions deploy "$f"
done
```

URL de invocação não muda: `https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/<edge>`.

### Migrar webhook Evolution (etapa 6)

Webhook atual aponta provavelmente pra:
```
https://oqboitkpcvuaudouwvkl.supabase.co/functions/v1/b2b-mira-inbound
```

Mudar pra:
```
https://mira.miriandpaula.com.br/api/webhook/evolution
```

Configuração vive na Evolution API dashboard (instâncias `Mih` + `mira-mirian`).
Requer chave `EVOLUTION_WEBHOOK_SECRET` configurada como env var no Vercel/host
do app Mira (mesma chave que valida HMAC).

### Remover edges legacy (etapa 7)

Após #6 confirmado em produção (Evolution mandando inbound só pro app Mira),
remover do Supabase:
```bash
supabase functions delete b2b-mira-inbound
supabase functions delete b2b-mira-router
```

**ATENÇÃO**: as outras 10 edges (`b2b-comm-dispatch`, voucher-audio, OG,
share, candidate-evaluate, insights-generator, playbook-ia, scout-scan,
weekly-insight, mira-welcome) continuam hospedadas — são chamadas por
triggers DB e crons, NÃO são webhook receivers. NÃO deletar.

### Pausar Easypanel (etapa 8)

Apenas após:
- Sidebar Mira validado em produção (link funciona pros ~10 usuários)
- Redirect stubs validados (bookmarks antigas redirecionam OK)
- Equipe alinhada (Maringá / clinic team) que clinic-dashboard pode ficar offline

Pausar no Easypanel preserva imagem Docker · rollback rápido se algo quebrar.

### Redirect 301 (etapa 9)

Cloudflare/Vercel/wherever painel.miriandpaula.com.br aponta:
- 301 catch-all → `mira.miriandpaula.com.br`
- Ou 301 path-aware: `/b2b-*` → mira, `/` → mira, demais → algum lugar

## Rollback plan

Se Mira app falhar em prod e precisar voltar pro legacy:
1. Reverter sidebar (`git revert fe9ec3a` no clinic-dashboard)
2. Reverter redirect stubs (`git revert aaf7491` no clinic-dashboard)
3. Re-deploy clinic-dashboard no Easypanel
4. Re-apontar Evolution webhook pra `b2b-mira-inbound` (se já tinha mudado)
5. Edges Supabase não precisam rollback · source code idêntico em ambos os repos

## Smoke test antes de etapa 8

Checklist mínimo pra validar Mira em produção antes de pausar legacy:

- [ ] Login Mira (sso ou auth) funciona
- [ ] Listar partnerships (ativas, pausadas, terminadas) renderiza
- [ ] Criar partnership via modal NewMenu salva no DB
- [ ] Detail partnership · cada tab renderiza sem digest opaco
- [ ] Emitir voucher single via modal envia WhatsApp
- [ ] Emitir voucher bulk (3-5 itens) processa fila + dispatcha
- [ ] Cap mensal: emitir acima do cap → alerta aparece, mas emite
- [ ] Disparos page: lista templates, métricas tab carrega
- [ ] Analytics B2B: ROI/Velocity/Forecast/Payback renderizam
- [ ] Voucher landing pública (`/v/[slug]`) abre OG image + CTA
- [ ] Beneficiary recebe WhatsApp ao receber voucher (E2E)
- [ ] Trigger `_b2b_dispatch_application_received` dispara em INSERT b2b_partnership_applications
- [ ] Cron `mira-voucher-validity-reminder` roda 10h SP (verificar logs)
- [ ] Cron `mira-voucher-expired-sweep` roda 02h SP (verificar logs)
- [ ] Cron `mira-voucher-post-purchase-upsell` roda 14h SP (verificar logs)

## Refs

- Sidebar legacy: [clinic-dashboard/js/nav-config.js](https://github.com/AldenQuesada/clinic-dashboard/blob/master/js/nav-config.js)
- Edges source: [clinicai-v2/supabase/functions/README.md](../../supabase/functions/README.md)
- Webhook canônico: [apps/mira/src/app/api/webhook/evolution/route.ts](../../apps/mira/src/app/api/webhook/evolution/route.ts)
- Mira pipeline debug: memory `reference_mira_pipeline_debug.md`
- B2B project state: memory `project_b2b_state.md`
