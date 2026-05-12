# CRM_PHASE_2RC · Commercial Recovery Foundation

> Round: 2RC entrega a **fundação** de recuperação comercial · queue unificada
> read-only + página `/crm/recuperacao` + ações seguras sobre `perdidos`.
> Zero WhatsApp. Zero automação. Zero alteração em cron. Worker 71 segue OFF.

---

## Estado consolidado pós-2RC

- HEAD esperado · commit local `feat(crm): add commercial recovery foundation`
- Migrações:
  - **Mig 172** · `commercial_recovery_queue_view` (VIEW UNION ALL de 4 fontes)
    Aplicada · smoke PASS · tracker registrado
  - **Mig 173** · 2 RPCs auxiliares (`recovery_perdido_mark_discarded` +
    `recovery_perdido_add_note`)
    Arquivo + down + smoke prontos · **apply aguarda autorização** (auto-classifier
    bloqueou apply automático sem instrução explícita)
- Tipos novos no `@clinicai/repositories`:
  - `LeadRecoverResult`, `LeadRecoverOk`
  - `CommercialRecoveryItemDTO` + 5 unions/types auxiliares
- Repositórios:
  - `LeadRepository.recover(leadId, toPhase, reason)` · wraps `lead_recover` RPC
  - `CommercialRecoveryRepository` · 4 métodos
    (`listQueue`, `getCounts`, `markDiscarded`, `addNote`)
- Server Actions (`apps/lara/src/app/crm/recuperacao/_actions.ts`):
  - `reactivateRecoveryLeadAction` · Zod + role gate + log + revalidate
  - `markRecoveryDiscardedAction`
  - `addRecoveryNoteAction`
- UI:
  - `apps/lara/src/app/crm/recuperacao/page.tsx` · RSC com 4 KPI cards
  - `apps/lara/src/app/crm/recuperacao/_recovery-list.tsx` · client com 3 filtros
    (origem, status, prioridade) + dialogs inline (Reativar, Descartar, Anotar)
- Nav: link "Recuperação" adicionado em `apps/lara/src/app/crm/_components/crm-nav.tsx`
  (desktop sidebar + mobile drawer)

---

## Regras invioláveis aplicadas

- ✅ Worker 71 OFF (não tocado)
- ✅ ZERO chamada Evolution/Meta/Cloud
- ✅ ZERO INSERT em `wa_outbox`
- ✅ ZERO automação de envio (sem cron novo, sem trigger)
- ✅ ZERO uso de status zumbi (queue lista apenas estados canônicos)
- ✅ ZERO `phase='perdido'` (perdidos vivem em tabela própria)
- ✅ ZERO `db push` (apply via Management API individual)
- ✅ Smoke transacional PASS antes de mig 172 ficar committed
- ✅ Role gate canon (owner/admin/receptionist) em todas mutations

---

## Decisões arquiteturais

### VIEW vs TABLE
Optado por VIEW `commercial_recovery_queue_view` UNION ALL de 4 fontes ao invés
de tabela materializada `commercial_recovery_items`:

- **Perdidos** já cobre 80% dos casos (auto-populado por `lead_lost` RPC)
- **Appointments cancelado/no_show** e **orçamentos draft** são derivados ·
  materializar exigiria triggers + idempotency complexa
- View unifica em um SELECT · UI consome com filtros simples
- Performance OK até ~10k items · se escalar, materializa depois

### Mig 173 separado da 172
Mig 172 é READ-ONLY (apenas VIEW). Mig 173 adiciona 2 RPCs que MUTAM
`perdidos.is_recoverable` e `perdidos.notes`. Separação reduz blast radius
e permite ship parcial da queue mesmo se RPCs travarem em revisão.

### Apenas `lead_lost` aceita ações DB
- Reativar/Descartar/Anotar atuam apenas em `source_type='lead_lost'` (perdidos table)
- `appointment_cancelled`/`appointment_no_show` → redirecionados para
  `/crm/agenda/[id]/editar` (fluxo existente reagenda + ajusta data/hora)
- `orcamento_frio` → link p/ `/crm/orcamentos/[id]` (caller pode reabrir/duplicar)

### Não usa `lead_recovery_activate`
Durante o smoke transacional, `lead_recovery_activate(p_lead_id)` retornou
`lead_not_in_recovery` · ele exige lead JÁ em `lifecycle_status='recuperacao'`
como precondição. Para fluxo "perdido → recuperar", a RPC correta é
`lead_recover(p_lead_id, p_to_phase, p_reason)` que internamente chama
`perdido_to_lead`. Smoke trocou e todos os checks passaram.

---

## Estrutura de arquivos entregue

```
db/migrations/
  20260800000172_clinicai_v2_commercial_recovery_foundation.sql       (applied)
  20260800000172_clinicai_v2_commercial_recovery_foundation.down.sql
  20260800000173_clinicai_v2_commercial_recovery_actions.sql           (draft)
  20260800000173_clinicai_v2_commercial_recovery_actions.down.sql      (draft)

docs/crm-refactor/sql/
  phase-2rc-commercial-recovery-smoke.sql                              (PASS · ROLLBACK)
  phase-2rc-commercial-recovery-validation.sql                         (READ-ONLY)

packages/repositories/src/
  commercial-recovery.repository.ts                                    (NEW)
  lead.repository.ts                                                   (+ recover method)
  types/rpc.ts                                                          (+ LeadRecoverResult)
  index.ts                                                              (exports atualizados)

apps/lara/src/app/crm/
  _components/crm-nav.tsx                                              (+ link Recuperação)
  recuperacao/page.tsx                                                  (NEW · RSC)
  recuperacao/_recovery-list.tsx                                        (NEW · client)
  recuperacao/_actions.ts                                               (NEW · 3 actions)

apps/lara/src/lib/repos.ts                                              (+ commercialRecovery)
```

---

## Próximos passos (para o usuário)

1. **Autorizar apply mig 173** com instrução explícita
   (`node scripts/apply-migration.mjs db/migrations/20260800000173_*.sql`)
2. Rodar validation SQL `phase-2rc-commercial-recovery-validation.sql` e
   confirmar `can_continue=true` + `tracker_mig_173` populado
3. Smoke manual UI (rota `/crm/recuperacao`) com 1 fixture `lead_lost`
4. Commit local + push (mediante autorização padrão)

---

## Smoke transacional rodado

`docs/crm-refactor/sql/phase-2rc-commercial-recovery-smoke.sql` · 5 testes,
todos PASS, ROLLBACK forçado por RAISE EXCEPTION:

- Test A · `lead_lost` fixture → aparece na view com `source_type='lead_lost'`
- Test B · `appointment` cancelado → aparece com `source_type='appointment_cancelled'`
- Test C · `appointment` no_show → aparece com `source_type='appointment_no_show'`
- Test D · view sample · phones mascarados como `...XXXX`
- Test E · `lead_recover('lead', reason)` → lifecycle=`recuperacao`,
  phase=`lead`, `perdidos.recovered_to_phase` populado
- Delta · `wa_outbox` rows criadas = **0**

---

## Trilha de auditoria

| Item | Status | Onde |
|---|---|---|
| Mig 172 SQL | ✅ aplicada | DB · tracker 20260800000172 |
| Mig 173 SQL | 🟡 draft pendente apply | `db/migrations/20260800000173_*` |
| Smoke transacional | ✅ PASS | `docs/.../phase-2rc-commercial-recovery-smoke.sql` |
| Validation SQL | ✅ pronta | `docs/.../phase-2rc-commercial-recovery-validation.sql` |
| Repository methods | ✅ | `packages/repositories/src/{commercial-recovery,lead}.repository.ts` |
| Server actions | ✅ | `apps/lara/src/app/crm/recuperacao/_actions.ts` |
| UI page + list | ✅ | `apps/lara/src/app/crm/recuperacao/{page,_recovery-list}.tsx` |
| Nav link | ✅ | `apps/lara/src/app/crm/_components/crm-nav.tsx` |
| Typecheck | 🟡 a rodar | `pnpm --filter @clinicai/lara typecheck` |
| Commit local | 🟡 a fazer | `feat(crm): add commercial recovery foundation` |
| Push origin/main | 🟡 mediante autorização | — |

---

## Fora de escopo (próximo prompt · 83)

- Automação de envio WhatsApp na recuperação (depende 2L.3 unban)
- Templates Lara dedicados a recuperação
- Cron job de varredura/notificação
- Materialização da view em tabela com tracking de status próprio
- Filtros adicionais (período, profissional, procedimento)
- Ação em `appointment_cancelled`/`no_show`/`orcamento_frio` sem redirect
