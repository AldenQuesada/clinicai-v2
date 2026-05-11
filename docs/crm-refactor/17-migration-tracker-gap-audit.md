# 17 · Migration Tracker Gap Audit

> Auditoria READ-ONLY do drift entre `db/migrations/` local e `supabase_migrations.schema_migrations` remoto. Estado em 2026-05-10 · branch `main` · HEAD `4f28fe9` · project-ref `oqboitkpcvuaudouwvkl`.

---

## 1 · Resumo executivo

O tracker remoto do Supabase (`supabase_migrations.schema_migrations`) tem **103 versões registradas**, com a última sendo `20260800000076`. O repo local `db/migrations/` tem **148 versões**, indo até `20260800000150`.

Gap consolidado:

| Métrica | Quantidade |
|---|---|
| **Local total** | 148 |
| **Remote total** | 103 |
| **Missing remote** (local sem entry no tracker) | **86** |
| **Remote not local** (tracker tem mas sem arquivo local) | **41** |
| Overlap (local + remote) | 62 |

**Interpretação:**
- **86 migrations locais não foram registradas no tracker.** Mas o banco real provavelmente já tem os objetos (`crm_operational_view`, `lifecycle_status`, etc. existem · doc 13 confirmou). Foram aplicadas via Studio direto ou `db diff` sem completar o `repair`.
- **41 migrations no tracker não têm arquivo local.** São migs do repo `clinic-dashboard` legado (faixa `20260686000000` a `20260700000870`) que ficaram registradas quando os 2 repos compartilhavam o mesmo project Supabase.

**Risco operacional:** rodar `supabase db push` agora tentará aplicar as 86 missing remote, gerando erros `object already exists` ou alterações duplicadas. Estratégia correta é `migration repair --status applied` em lote ou por bloco.

---

## 2 · Estado local

```
$ git status --short
(working tree clean)

$ git branch --show-current
main

$ git log -3 --oneline
4f28fe9 docs(db): record crm refactor audit and lifecycle retroapply
14169cb feat(mira): implicit voucher intent for partner messages
8f32420 fix(secretaria): clear composer after successful send (UX)

$ git rev-parse HEAD
4f28fe9d279b7914e74e066a87f370a4915f8953

$ git rev-parse origin/main
4f28fe9d279b7914e74e066a87f370a4915f8953
```

**HEAD == origin/main** ✅ · working tree limpo · commit 4f28fe9 presente.

---

## 3 · Project-ref confirmado

```
$ cat supabase/.temp/project-ref
oqboitkpcvuaudouwvkl
```

✅ Confere com o que está em uso na Fase 0.5/1A. Não há mismatch.

---

## 4 · Contagem local vs remoto

| Source | Count | Comando |
|---|---|---|
| `db/migrations/*.sql` (excluindo `.down.sql`) | 148 | `find db/migrations -name "*.sql" ! -name "*.down.sql" \| sed ...` |
| `supabase migration list` (CLI) | 103 | `grep -oE "20[0-9]{12}" \| sort -u` |
| `supabase_migrations.schema_migrations` (SQL direto) | 103 | SELECT via Management API · **idêntico ao CLI** |
| Missing remote | 86 | `comm -23 local remote` |
| Remote not local | 41 | `comm -13 local remote` |
| Overlap | 62 | 148 − 86 |

---

## 5 · Lista de migrations faltantes no remoto (86)

### Bloco 001-012 (12 migrations · primeiras do clinicai-v2)

```
20260800000001 mira_discriminators
20260800000002 mira_state
20260800000003 b2b_auto_whitelist
20260800000004 mira_state_nullable_and_trigger_auth
20260800000005 custom_access_token_hook
20260800000006 voucher_dispatch_queue
20260800000007 lara_voucher_followup
20260800000008 voucher_dispatch_queue_idempotency
20260800000009 lara_followup_batch_limit
20260800000010 mira_state_cleanup_margin
20260800000011 webhook_processing_queue
20260800000012 voucher_issue_with_dedup
```

**Tema:** infra inicial Mira/B2B/voucher dispatch · julho/agosto 2026.

### Bloco 077-099 (23 migrations · refactor RLS + B2B + drops)

```
077 app_clinic_id_canonical
078 unify_clinic_id_in_policies
079 rls_with_check_blanket_fix
080 rls_blanket_lockdown
081 unify_mag_clinic_id
082 fix_b2b_voucher_to_lead_bridge
083 anatomy_quiz_dispatch_mark
084 b2b_refer_lead_safe
085 divergence_report
086 wa_messages_internal_note_delivery_status
087 p12_conversation_assignment
088 b2b_dispatch_quiet_hours
089 admin_pending_drain_and_financial_crons
090 sdr_clinic_id_wrapper
091 inbox_role_secretaria_handoff
092 wa_numbers_resolve_by_instance
093 drop_backup_tables
094 drop_legacy_dup_tables
095 drop_unused_zero_byte_tables
096 inbox_role_b2b
097 role_secretaria
098 fix_nps_zombie_trigger
099 recreate_dropped_tables
```

**Tema:** segurança (RLS endurecimento), cleanup de schema legado, infra de roles.

### Bloco 100-119 (20 migrations · CRM canonical + LGPD media)

```
100 dedup_conversations
101 conv_unique_per_channel
102 conversation_questions
103 align_phase_status_checks   ← já documentada na auditoria
104 fix_vpi_zombie_triggers
105 restore_dropped_table_columns
106 audit_wa_conversations
107 harden_conv_q_restore_orphan_tables
108 wa_webhook_log
109 drop_legacy_phone_unique
110 lgpd_media_path_migration    ← 9 DMLs
111 lgpd_media_bucket_private_rls
112 wa_inbound_queue_hardening
113 wa_inbound_queue_stuck_sweep_cron
114 secretaria_auto_greeting_atomic
115 vpi_ind_stage_type_fix
116 wa_messages_sync_preview_trigger
117 secretaria_auto_greeting_guards
118 drop_conflicting_wa_conversations_status_check
119 drop_legacy_wa_messages_summary_trigger
```

**Tema:** CRM canonical state machine (103), LGPD media migration (110-111-122), webhook hardening.

### Bloco 120-139 (20 migrations · views + B2B + identidade WA)

```
120 wa_messages_composite_fk_clinic
121 wa_messages_select_rls_hide_deleted
122 lgpd_media_bucket_private_final_cleanup
123 drop_dead_wa_columns       ← 3 DROP COLUMN
124 enable_secretaria_role
125 secretaria_role_permissions    ← ddl=2 idem=0
126 create_wa_conversations_operational_view
127 wa_identity_architecture    ← 7 DMLs
128 create_wa_webhook_log_audit_view
129 create_wa_webhook_event_audit_view
130 harden_wa_conversations_operational_view_internal_numbers
131 b2b_voucher_audio_queue   ← ddl=44, idem=28
132 b2b_log_outbound_message_scope   ← 4 DMLs, 7 grants
133 wa_chat_mirror
134 wa_chat_mirror_cron
135 wa_chat_mirror_rls
136 wa_context_defaults
137 orcamento_followup_non_sdr_guard
138 restore_mira_channels_to_secretaria
139 b2b_voucher_dispatch_events
```

**Tema:** views operacionais, identidade WA arch, B2B ledger.

### Bloco 140-150 (11 migrations · recentes + 150 retroapply)

```
140 b2b_comm_dispatch_payload_voucher_id
141 b2b_invoke_edge_authorization_header
142 b2b_comm_dispatch_delivery_policy
143 wa_messages_reply_to_provider_msg_id
144 wa_messages_payload_jsonb
145 secretaria_default_label
146 secretaria_alden_operational_owner
147 secretaria_owner_normalization_fix
148 wa_assignment_events_view
149 wa_assignment_events_view_grants
150 crm_lifecycle_and_operational_view_retroapply   ← criada hoje, ainda não aplicada
```

**Tema:** B2B delivery polish, secretaria fixes, mig 150 (retroapply auditoria).

---

## 6 · Remote not local (41 migrations · clinic-dashboard legado)

Faixas:

```
20260686000000  (1 mig)
20260700000798..815  (17 migs sequenciais)
20260700000835..846  (12 migs)
20260700000860..870  (11 migs)
```

**Interpretação:** essas migs vivem em `Documents/clinic-dashboard/supabase/migrations/` (repo paralelo · vide doc 12). Foram aplicadas quando os 2 repos compartilhavam o mesmo project Supabase. **Não afetam o repo clinicai-v2** · podem ser ignoradas no escopo deste audit.

Se o objetivo for higienizar 100% o tracker, **seria necessário ou:** (a) trazer essas migs `.sql` para `db/migrations/` do clinicai-v2 (cópia · mas viraria duplicação se clinic-dashboard ainda escreve no mesmo banco), ou (b) deixar como histórico aceito (o tracker registra migs aplicadas mas o repo só versiona o que é de responsabilidade do v2). Recomendação: **opção b** (histórico aceito).

---

## 7 · Static scan · risco por padrão

Resultados da varredura estática (rg em hits perigosos + idempotência) das 86 missing:

| Categoria | Quantidade | Comentário |
|---|---|---|
| ddl = idem (plenamente idempotentes) | 11 | Usam `IF NOT EXISTS` / `IF EXISTS` / `CREATE OR REPLACE` em proporção 1:1 |
| ddl > idem (parcialmente · alguns objetos sem proteção) | 71 | DDL sem `IF NOT EXISTS` ⇒ pode falhar em rerun, mas em prod já está aplicado |
| ddl < idem (ainda mais idempotentes que DDLs) | 4 | Usa `CREATE OR REPLACE FUNCTION` várias vezes |
| ddl = 0 (no-op / só comentários) | 2 | Provável documentação |

**Migrations com DML não-trivial (INSERT/UPDATE/DELETE):** 19

| Mig | DMLs | Tema | Risco rerun |
|---|---|---|---|
| 002 | 6 | mira_state | Alto (INSERT seed) |
| 003 | 1 | b2b_auto_whitelist | Baixo |
| 004 | 1 | mira_state_nullable | Baixo |
| 006 | 1 | voucher_dispatch_queue | Baixo |
| 010 | 3 | mira_state_cleanup_margin | Médio |
| 011 | 1 | webhook_processing_queue | Baixo |
| 012 | 1 | voucher_issue_with_dedup | Baixo |
| 082 | 1 | fix_b2b_voucher_to_lead_bridge | Baixo |
| 084 | 2 | b2b_refer_lead_safe | Baixo |
| 088 | 1 | b2b_dispatch_quiet_hours | Baixo |
| 104 | 1 | fix_vpi_zombie_triggers | Baixo + 1 DROP TABLE |
| 110 | **9** | **lgpd_media_path_migration** | **Alto** (backfill paths · não pode rerodar) |
| 124 | 1 | enable_secretaria_role | Baixo |
| 125 | 1 | secretaria_role_permissions | Baixo |
| 127 | **7** | **wa_identity_architecture** | **Alto** (backfill identity) |
| 131 | 2 | b2b_voucher_audio_queue | Baixo |
| 132 | 4 | b2b_log_outbound_message_scope | Médio |
| 141 | 1 | b2b_invoke_edge_authorization_header | Baixo |
| 142 | 1 | b2b_comm_dispatch_delivery_policy | Baixo |

**Migrations com DROP TABLE:** 6 (093, 094, 095, 098, 099, 104). A mig 095 dropa 23 tabelas zero-byte · em prod já executou.

**Migrations com DROP COLUMN:** 1 (mig 123 · 3 colunas).

**Conclusão:** as DDLs e DMLs são todas de execução única-vez no banco. Reaplicar via `db push` falharia em quase todas (rerun de INSERT seed, DROP TABLE quando tabela já foi removida, ALTER TABLE quando coluna não existe mais). Por isso **a estratégia correta é `migration repair --status applied`** (que não executa SQL · apenas registra como aplicado no tracker).

---

## 8 · Estratégia recomendada

### Opção A · Repair em lote de TODAS as 86 missing

```bash
supabase migration repair --status applied \
  20260800000001 20260800000002 ... 20260800000150
```

- **Pró:** rápido · resolve o gap inteiro
- **Contra:** assume que TODAS as 86 estão materializadas no banco (precisamos confirmar)
- **Risco:** se alguma das 86 não estiver aplicada em prod, o tracker mente · próximo `db push` ainda não vai pegar
- **Confiança necessária:** alta (probes por objeto)

### Opção B · Repair por bloco (recomendado)

Aplicar em 4 lotes com sanity probe entre cada:

1. **Bloco 001-012** (12 migs · infra Mira/B2B inicial)
   - Probe: `SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name IN ('mira_state', 'b2b_auto_whitelist_phones', 'webhook_processing_queue', 'voucher_dispatch_queue')`
   - Se todas existem: `supabase migration repair --status applied 20260800000001 ... 20260800000012`

2. **Bloco 077-099** (23 migs · RLS endurecimento + cleanup)
   - Probe: testar 3-4 funções/tabelas chave (`app_clinic_id`, `b2b_refer_lead_safe`, ausência de `_backup_*`)
   - Se OK: repair

3. **Bloco 100-119** (20 migs · CRM canonical + LGPD)
   - Probe: confirmar CRM tables canonical (já confirmado no doc 13) + LGPD media bucket privado
   - Se OK: repair

4. **Bloco 120-139** (20 migs · views + B2B + identidade)
   - Probe: confirmar views `wa_conversations_operational_view`, `wa_webhook_log_audit_view`, `b2b_voucher_dispatch_events`
   - Se OK: repair

5. **Bloco 140-150** (11 migs · recentes + 150 retroapply)
   - Probe: confirmar `secretaria_*` views recentes + `crm_operational_view` (já confirmado · doc 13)
   - Se OK: repair (inclui mig 150)

### Opção C · Repair seletivo (mais conservador)

Repair só de migs **comprovadamente** aplicadas pelos probes do doc 13:
- mig 60-65 (CRM canonical · já documentado)
- mig 103 (align_phase_status_checks · doc 13 confirma)
- mig 150 (retroapply · idempotente)

Resto fica para fase futura quando houver tempo de probe individual.

### Opção D · Pausa e cria fase de probes por objeto

Antes de qualquer repair, escrever SQL READ-ONLY que confirma existência de TODOS os objetos (tables, views, RPCs, indexes) criados em cada mig faltante. Se todos existem → repair. Se algum faltar → erro investigar antes.

---

## 9 · Comando de repair PROPOSTO (não executar agora)

**Recomendação:** Opção B · bloco-a-bloco · começando pela mig 150 (já 100% comprovada via doc 13).

### Comando proposto para o primeiro bloco (mig 150 isolada · sanity)

```bash
# NÃO EXECUTAR sem revisão Alden
supabase migration repair --status applied 20260800000150
```

### Comando proposto para Bloco 140-150 (11 migs · após probes)

```bash
# NÃO EXECUTAR sem probes prévias
supabase migration repair --status applied \
  20260800000140 \
  20260800000141 \
  20260800000142 \
  20260800000143 \
  20260800000144 \
  20260800000145 \
  20260800000146 \
  20260800000147 \
  20260800000148 \
  20260800000149 \
  20260800000150
```

### Comando proposto para repair em lote completo (Opção A · só se Alden autorizar)

```bash
# NÃO EXECUTAR sem confirmação explícita
supabase migration repair --status applied \
  $(cat /tmp/clinicai_missing_remote_migrations.txt | tr '\n' ' ')
```

(86 versões em uma chamada · CLI aceita múltiplos args)

---

## 10 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Alguma mig faltante não está realmente aplicada em prod | Baixa-Média | Probes por objeto antes de repair (Opção D ou B) |
| `migration repair` falha por versão inválida | Muito baixa | Versões batem com timestamp pattern · CLI valida |
| `migration repair` em lote demora | Baixa | API call por versão · 86 versões = ~30s |
| Mig 150 não está aplicada (foi commitada hoje sem `db push`) | **CERTEZA** | NÃO incluir 150 em repair · ou aplicar primeiro via Studio CREATE OR REPLACE |
| Mig 150 retroapply pode dar erro de DDL se algo divergir | Baixa | `.sql` é idempotente · `IF NOT EXISTS` + `CREATE OR REPLACE` cobrem |
| Repair muda audit em produção mesmo sem `db push` | Sim, por design | Aceito · é exatamente isso que queremos (registrar applied) |

---

## 11 · Confirmações ZERO

- ✅ Zero `supabase db push`
- ✅ Zero `supabase migration repair`
- ✅ Zero `supabase migration up`
- ✅ Zero SQL mutativo
- ✅ Zero banco alterado
- ✅ Zero deploy

Apenas:
- SELECT em `supabase_migrations.schema_migrations` (read-only via Management API)
- `supabase migration list` (read-only CLI)
- `find` + `rg` no repo local

---

## 12 · Próximo passo recomendado

**Fase 1A.4 · Probes por objeto + repair do Bloco 140-150**

Fluxo:

1. **Probes SQL READ-ONLY** para confirmar materialização das migs 140-149 (já confirmamos 150 via doc 13):
   - 140: existência de coluna `voucher_id` em `b2b_comm_dispatch_log.payload`
   - 141: helper `b2b_invoke_edge_with_secret` aceita Authorization header
   - 142: `b2b_comm_dispatch_delivery_policy` policy presente
   - 143: coluna `reply_to_provider_msg_id` em `wa_messages`
   - 144: coluna `payload jsonb` em `wa_messages`
   - 145-147: `wa_conversations.operational_owner` com default 'secretaria' + values fix
   - 148-149: view `wa_assignment_events_view` + GRANTs

2. Se todos os probes passarem: `supabase migration repair --status applied 20260800000140 ... 20260800000150` (lote de 11)

3. Se algum falhar: investigar caso a caso · não rodar repair

**Antes disso, decisão humana (Alden):**

- Opção B-pesquisa (Bloco 140-150 primeiro · seguro)?
- Opção A-bulk (todas as 86 de uma vez · mais rápido mas exige confiança alta)?
- Opção D-conservadora (probes por objeto em TODAS as 86 antes de qualquer repair)?

**Sem decisão da estratégia, não rodar nenhum repair.**
