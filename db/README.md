# Database · clinicai-v2

Schema do clinicai-v2 vive em **dois lugares por design**:

1. **Tabelas legadas** (leads, wa_conversations, wa_messages, clinic_data, _ai_budget, etc) → vivem no repo canônico [clinic-dashboard/supabase/migrations](../../clinic-dashboard/supabase/migrations/). São **compartilhadas** entre o painel CRM antigo (vanilla JS) e o clinicai-v2 (Next.js). Fonte da verdade: clinic-dashboard.

2. **Tabelas/RPCs novos do clinicai-v2** (inbox_notifications, _ai_budget extension, wa_numbers Cloud API resolver) → ficam **aqui em `db/migrations/`** com `.up.sql` + `.down.sql` pareados.

## Por que duplicar as migs aqui?

Reprodutibilidade. Se você precisar levantar o clinicai-v2 num ambiente novo (staging, outra Supabase, dev local), aplicar **só** os arquivos desta pasta sobre um schema base reproduz o estado esperado. Sem essa cópia, você dependeria de ter o clinic-dashboard montado primeiro · não escala pra Mira/outras apps.

## Migrations atuais (carregadas em prod)

| Mig | Up | Down | Conteúdo |
|---|---|---|---|
| 847 | [`20260700000847_clinicai_v2_inbox_notifications.sql`](migrations/20260700000847_clinicai_v2_inbox_notifications.sql) | [`.down.sql`](migrations/20260700000847_clinicai_v2_inbox_notifications.down.sql) | Tabela `inbox_notifications` + RPC `inbox_notification_create` · usada pra cross-app sino-badge no CRM antigo quando Lara nova dispara handoff/rate-limit |
| 848 | [`...848_clinicai_v2_ai_budget.sql`](migrations/20260700000848_clinicai_v2_ai_budget.sql) | [`.down.sql`](migrations/20260700000848_clinicai_v2_ai_budget.down.sql) | Tabela `_ai_budget` (clinic/dia · cost USD), view `v_ai_budget_today`, RPC `ai_budget_increment` |
| 849 | [`...849_clinicai_v2_wa_numbers_cloud_api.sql`](migrations/20260700000849_clinicai_v2_wa_numbers_cloud_api.sql) | [`.down.sql`](migrations/20260700000849_clinicai_v2_wa_numbers_cloud_api.down.sql) | Estende `wa_numbers` com `phone_number_id` (Meta Cloud) · RPC `wa_numbers_resolve_by_phone_number_id` (multi-tenant ADR-028) |

## Aplicar uma migration nova

1. Crie `db/migrations/202<YYYY>...<seq>_clinicai_v2_<feature>.sql` seguindo o template do GOLD-STANDARD (header explicativo, idempotente, sanity check no final, `NOTIFY pgrst, 'reload schema'` se DDL de RPC).
2. Crie o `.down.sql` correspondente (regra GOLD #5 · DDL de schema obrigatório down).
3. Aplique via pooler (ver `clinic-dashboard/docs/DEPLOYMENT.md`).
4. Copie a mig + .down também pra `clinic-dashboard/supabase/migrations/` se a tabela for compartilhada (para o canônico ficar em sync).

## Tabelas legadas que o clinicai-v2 lê/escreve (não migradas aqui)

Documentadas pra audit · não copie pra cá:

- `leads`, `clinics`, `clinic_data` (settings JSON)
- `wa_conversations`, `wa_messages`, `wa_message_templates`, `wa_numbers`
- `_ai_budget` (extensão na 848 acima)
- `inbox_notifications` (criada na 847 acima)

Schema canônico delas: rodar `agenda_invariants_check()` + `b2b_mira_invariants_check()` em prod.

## Reset/rollback de uma mig específica

```bash
# Aplicar down da mig 849:
psql "$DATABASE_URL" -f db/migrations/20260700000849_clinicai_v2_wa_numbers_cloud_api.down.sql
```

⚠️ Antes de rodar `.down.sql` em prod, valide soak em staging primeiro · rollback pode ser destrutivo.
