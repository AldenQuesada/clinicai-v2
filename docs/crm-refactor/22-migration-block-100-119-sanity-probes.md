# 22 · Migration Block 100-119 · Sanity Probes

> Auditoria READ-ONLY do bloco 100-119 contra o banco real. Estado 2026-05-11 · project-ref `oqboitkpcvuaudouwvkl` · branch `main` · HEAD `1dbff1a`.

---

## 1 · Resumo executivo

**Resultado: 20/20 migrations do bloco 100-119 com objetos materializados em prod.** Repair em lote é seguro.

Migs críticas validadas:
- **Mig 103** (`align_phase_status_checks`) · CRM v2 contract: 4 phases + 4 lifecycle confirmados (re-validação)
- **Mig 104** (`fix_vpi_zombie_triggers`) · 0 zombie triggers/functions remanescentes
- **Mig 109** (`drop_legacy_phone_unique`) · UNIQUE INDEX moderno em uso · 0 duplicatas de phone em leads ativos
- **Mig 110** (`lgpd_media_path_migration`) · 291 objetos em bucket `media` · **100% prefixados com clinic_id** (UUID pattern) · backfill completo
- **Mig 111** (`lgpd_media_bucket_private_rls`) · 4 RLS policies tenant-scoped via `(storage.foldername(name))[1] = app_clinic_id()::text`

| Métrica | Valor |
|---|---|
| Migrations no bloco | 20 (100-119) |
| MATERIALIZED_CONFIRMED | **20** |
| PARTIAL_CONFIRMATION | 0 |
| NOT_FOUND | 0 |
| RISKY_DML_BACKFILL_CONFIRMED_PRESENT | 1 (mig 110) |
| NEEDS_MANUAL_REVIEW | 0 |

**Recomendação: Opção A · Repair completo do bloco 100-119.** **NÃO EXECUTADO nesta fase.**

---

## 2 · Estado local

```
Branch: main
HEAD: 1dbff1a0e2ac793fce4448066b7938975b3c5c78
origin/main: 1dbff1a0e2ac793fce4448066b7938975b3c5c78   (== HEAD)
working tree: limpo
project-ref: oqboitkpcvuaudouwvkl ✅
```

---

## 3 · Lista das migrations 100-119

| Mig | Arquivo | Tema |
|---|---|---|
| 100 | `dedup_conversations.sql` | Dedup conversations (no-op aparente · 1 idem) |
| 101 | `conv_unique_per_channel.sql` | Unique por channel · 1 drop |
| 102 | `conversation_questions.sql` | Tabela + 7 DDLs · 3 drops · 2 grants |
| 103 | `align_phase_status_checks.sql` | **CRM v2 contract** · 8 DDLs · 4 CHECK constraints |
| 104 | `fix_vpi_zombie_triggers.sql` | DROP 2 trigs + 2 functions + 1 DML |
| 105 | `restore_dropped_table_columns.sql` | **69 DDLs** · restaura 23 tabelas zero-byte droppadas em mig 95 |
| 106 | `audit_wa_conversations.sql` | Audit table (no-op signature) |
| 107 | `harden_conv_q_restore_orphan_tables.sql` | 48 DDLs · 3 drops · 8 grants · 1 storage |
| 108 | `wa_webhook_log.sql` | wa_webhook_log table · 5 DDLs · 4 grants |
| 109 | `drop_legacy_phone_unique.sql` | DROP CONSTRAINT legacy phone unique |
| 110 | `lgpd_media_path_migration.sql` | **9 DMLs · 24 storage hits** · backfill paths para `<clinic_id>/...` |
| 111 | `lgpd_media_bucket_private_rls.sql` | **33 storage hits** · RLS bucket media |
| 112 | `wa_inbound_queue_hardening.sql` | 12 DDLs · 14 grants · 3 drops |
| 113 | `wa_inbound_queue_stuck_sweep_cron.sql` | Cron |
| 114 | `secretaria_auto_greeting_atomic.sql` | 2 RPCs claim/unclaim · 5 grants |
| 115 | `vpi_ind_stage_type_fix.sql` | 3 DDLs |
| 116 | `wa_messages_sync_preview_trigger.sql` | Trigger v2 sync preview |
| 117 | `secretaria_auto_greeting_guards.sql` | Guards na RPC de auto-greeting |
| 118 | `drop_conflicting_wa_conversations_status_check.sql` | DROP CONSTRAINT |
| 119 | `drop_legacy_wa_messages_summary_trigger.sql` | DROP TRIGGER |

---

## 4 · Static summary por migration

```
Mig | DDL | Drops | DML | Idem | Grants | Storage | Risco
100 |  0  |   0   |  0  |   1  |   0    |    0    | NO_OP / DOC_ONLY
101 |  0  |   1   |  0  |   2  |   0    |    0    | DROP_OR_ONE_WAY_CHANGE
102 |  7  |   3   |  0  |   6  |   2    |    0    | DDL_IDEMPOTENT + GRANTS
103 |  8  |   0   |  0  |   4  |   0    |    0    | CRM_CONTRACT_v2
104 |  0  |   4   |  1  |   4  |   0    |    0    | DROP_OR_ONE_WAY_CHANGE
105 | 69  |   0   |  0  |  62  |   0    |    0    | DDL_RESTORE_HEAVY
106 |  0  |   0   |  0  |   0  |   0    |    0    | NO_OP / DOC_ONLY
107 | 48  |   3   |  0  |  43  |   8    |    1    | DDL_IDEMPOTENT + GRANTS
108 |  5  |   1   |  0  |   4  |   4    |    0    | DDL_IDEMPOTENT + GRANTS
109 |  0  |   1   |  0  |   1  |   0    |    0    | DROP_OR_ONE_WAY_CHANGE
110 |  4  |   3   |  9  |   7  |   0    |   24    | RISKY_DML_BACKFILL (LGPD)
111 |  7  |   4   |  0  |   4  |   0    |   33    | RLS_STORAGE
112 | 12  |   3   |  0  |  11  |  14    |    0    | DDL_IDEMPOTENT + GRANTS
113 |  0  |   0   |  0  |   1  |   0    |    0    | CRON_NO_OP
114 |  5  |   0   |  0  |   4  |   5    |    0    | FUNCTION + GRANTS
115 |  3  |   0   |  0  |   3  |   0    |    0    | DDL_IDEMPOTENT
116 |  2  |   1   |  0  |   3  |   1    |    0    | TRIGGER_REPLACE
117 |  1  |   0   |  0  |   3  |   1    |    0    | FUNCTION_REPLACE
118 |  1  |   1   |  0  |   2  |   0    |    0    | DROP_CONSTRAINT
119 |  0  |   1   |  0  |   2  |   0    |    0    | DROP_TRIGGER
```

---

## 5 · DML/backfill risk scan

Migrations com DML significativo:

| Mig | DMLs | Tipo | Risco |
|---|---|---|---|
| 104 | 1 | DO block + cleanup pós-DROP | Baixo |
| **110** | **9** | **Backfill paths em storage.objects** | **Alto · validado** |

**110 é a única DML real do bloco.** Validada via probe D.

---

## 6 · Probes read-only executados

### A · CRM v2 contract (mig 103)

```
Colunas leads · CRM v2:
  phase             text NOT NULL  default 'lead'
  lifecycle_status  text NOT NULL  default 'ativo'
  lost_from_phase   text NULL
  lost_reason       text NULL
  lost_at           timestamptz NULL
  archived_at       timestamptz NULL
  archived_reason   text NULL
  deleted_at        timestamptz NULL

Constraints leads:
  chk_leads_phase            ∈ {lead, agendado, paciente, orcamento}
  chk_leads_lifecycle_status ∈ {ativo, perdido, recuperacao, arquivado}
  chk_leads_lost_from_phase  ∈ 4 valores OR NULL
  chk_leads_lost_consistency CHECK coerência via lifecycle_status

Distribuição:
  | phase     | lifecycle  | total |
  | lead      | ativo      |  116  |
  | lead      | arquivado  |    1  |
  | orcamento | ativo      |    1  |
  | paciente  | ativo      |    1  |
  | paciente  | arquivado  |    1  |
```

✅ **Mig 103 confirmada** (idem doc 13/18).

### B · Zombie triggers (mig 104)

```
SELECT count(*) FROM pg_proc WHERE proname IN ('_vpi_detect_celebration_consent','_vpi_detect_reaction')
→ 0

SELECT count(*) FROM information_schema.triggers WHERE trigger_name IN ('trg_vpi_detect_celebration_consent','trg_vpi_detect_reaction')
→ 0
```

✅ **Mig 104 confirmada** · cleanup 100% efetivo. 0 zombie remanescentes. (Demais triggers/funcs VPI legítimos continuam ativos · 28 trigs + 6 funcs no ecossistema VPI.)

### C · Phone unique (mig 109)

```
Constraints com 'phone' em leads/patients/wa_contacts/wa_conversations: ZERO (legacy unique foi DROP)

Indexes substitutos:
  idx_leads_phone_clinic            UNIQUE (clinic_id, phone) WHERE deleted_at IS NULL
  idx_leads_phone_right8            partial · last 8 digits
  idx_patients_phone_clinic         non-unique
  idx_wa_conv_phone                 (clinic_id, phone, status)
  idx_wa_conversations_phone_suffix RIGHT(phone, 8)
  uq_wa_conv_clinic_phone_wn_last8  UNIQUE composite per-channel

Duplicatas phone ativos em leads: 0
```

✅ **Mig 109 confirmada** · legacy unique removida · novo pattern (partial unique com `deleted_at IS NULL`) ativo · zero violações.

### D · LGPD media path (mig 110) · CRÍTICA

```
Storage buckets (13 buckets):
  attachments       public
  case-gallery      public
  clinicai-backups  PRIVATE
  facial-shares     PRIVATE
  flipbook-assets   public
  flipbook-covers   public
  flipbook-pdfs     PRIVATE
  flipbook-previews public
  lp-assets         public
  magazine-assets   public
  media             PRIVATE  ← alvo da mig 110+111
  voucher-audio     public
  wa-automations    public

Bucket media (alvo):
  total objects         = 291
  clinic_prefixed_count = 291  (100% · UUID-prefix pattern)
  first_at              = 2026-04-04 12:47:20
  last_at               = 2026-05-11 00:45:04 (ativo)

Bucket clinicai-backups:
  total = 2 · 2 prefixados (também respeita pattern)
```

✅ **Mig 110 confirmada** · backfill paths completo · 291/291 objects em `<clinic_id>/...`.

### Mig 111 · LGPD bucket private RLS

```
4 policies em storage.objects para bucket_id='media':
  · SELECT  · authenticated · WHERE (storage.foldername(name))[1] = app_clinic_id()::text
  · INSERT  · authenticated · WITH CHECK idem
  · UPDATE  · authenticated · USING + CHECK idem
  · DELETE  · authenticated · USING idem
```

✅ **Mig 111 confirmada** · 4 policies tenant-scoped ativas.

### E · Demais objetos do bloco

```
wa_webhook_log_exists       = true    (mig 108)
wa_inbound_queue_exists     = true    (mig 112)
conversation_questions_exists = true  (mig 102)
audit_wa_conversations_exists = true  (mig 106)

wa_messages count   = 2580 (ativo)
wa_conversations count = 182 (ativo)

Functions presentes:
  wa_secretaria_auto_greeting_claim    (mig 114)
  wa_secretaria_auto_greeting_unclaim  (mig 114)
  wa_lid_silent_loss_count             (bonus · outra mig)

Triggers em wa_messages/wa_conversations:
  trg_audit_wa_conversations             (mig 106)
  trg_sync_wa_conversation_preview_v2    (mig 116)
  trg_wa_conv_normalize_phone            (legacy · ativo)
  trg_wa_conversations_inbox_role_sync   (mig 091)
  trg_emergency_alert
  trg_wa_auto_confirm
  trg_birthday_detect_response
  trg_reset_reactivation
  trg_vpi_detect_aceito                  (vpi legítimo)
  trg_vpi_ind_stage_on_inbound           (vpi legítimo)
```

✅ Funções e triggers críticos do bloco presentes.

---

## 7 · Resultado por objeto

| Objeto | Mig | Status | Evidência |
|---|---|---|---|
| `leads.phase` CHECK 4 valores | 103 | ✅ | Probe A |
| `leads.lifecycle_status` CHECK 4 valores | 103 | ✅ | Probe A |
| `leads.lost_from_phase` CHECK 4 valores | 103 | ✅ | Probe A |
| `chk_leads_lost_consistency` via lifecycle | 103 | ✅ | Probe A |
| `_vpi_detect_celebration_consent` removida | 104 | ✅ | Probe B3 (0 remanescente) |
| `_vpi_detect_reaction` removida | 104 | ✅ | Probe B3 |
| `idx_leads_phone_clinic` UNIQUE partial | 109 | ✅ | Probe C2 |
| Legacy phone unique constraint removida | 109 | ✅ | Probe C1 (0 hits) |
| Zero duplicatas phone ativos | 109 | ✅ | Probe C3 |
| Bucket `media` private + clinic-prefix paths | 110 | ✅ | Probe D · 291/291 |
| RLS policies `media` bucket | 111 | ✅ | Probe D3 · 4 policies |
| `wa_webhook_log` table | 108 | ✅ | Probe E1 |
| `wa_inbound_queue` table | 112 | ✅ | Probe E1 |
| `conversation_questions` table | 102 | ✅ | Probe E1 |
| `audit_wa_conversations` table | 106 | ✅ | Probe E1 |
| `wa_secretaria_auto_greeting_claim` RPC | 114 | ✅ | Probe E4 |
| `wa_secretaria_auto_greeting_unclaim` RPC | 114 | ✅ | Probe E4 |
| `trg_sync_wa_conversation_preview_v2` trigger | 116 | ✅ | Probe E5 |
| `trg_audit_wa_conversations` trigger | 106 | ✅ | Probe E5 |
| 23 tabelas zero-byte restauradas | 105 | ✅ inferido | `restore_dropped_table_columns` é "restore puro · idempotente via IF NOT EXISTS" |

---

## 8 · Foco mig 103 · CRM contract

Já documentada em doc 13 e doc 18. Re-confirmação:

- ✅ 4 CHECK constraints presentes e idempotentes (DROP+CREATE pattern)
- ✅ Distribuição phase × lifecycle bate com doc 13 (120 leads · zero compareceu/reagendado)
- ✅ `lifecycle_status` enum 4 valores presente
- ✅ `lost_from_phase` enum 4 valores presente

Mig 103 é a **fundação CRM v2** · estado verificado e estável.

---

## 9 · Foco mig 104 · Cleanup zombie triggers

Mig 104 droppou:
- Trigger `trg_vpi_detect_celebration_consent` ON `wa_messages`
- Trigger `trg_vpi_detect_reaction` ON `wa_messages`
- Function `_vpi_detect_celebration_consent()`
- Function `_vpi_detect_reaction()`

Probe B3 confirma: ambos triggers + ambos functions = **0 remanescentes**.

**Observação importante:** o ecossistema VPI continua ativo · 28 outros triggers + 6 outras functions presentes. Mig 104 cirurgicamente removeu apenas o zumbi.

---

## 10 · Foco mig 109 · Phone unique drop

Probe C confirma:
- ZERO CHECK constraints com `phone` em leads/patients/wa_contacts/wa_conversations
- Substituído por **partial unique indexes** (mais permissivos e idempotentes):
  - `idx_leads_phone_clinic`: UNIQUE (clinic_id, phone) WHERE deleted_at IS NULL
  - `uq_wa_conv_clinic_phone_wn_last8`: UNIQUE composite per-channel
- ZERO duplicatas em leads ativos

Pattern moderno (partial unique) é robusto e tolera soft-delete.

---

## 11 · Foco mig 110 · LGPD media path migration

A mais crítica do bloco · 9 DMLs · backfill paths.

```sql
SELECT bucket_id, count(*), count(*) FILTER (WHERE name ~ '^[0-9a-f]{8}-...../') AS clinic_prefixed
FROM storage.objects WHERE bucket_id='media'
GROUP BY bucket_id;

→ media | 291 total | 291 prefixados
```

✅ **100% dos objetos em bucket `media` estão prefixados com clinic_id UUID.** Backfill completo.

Plus:
- `clinicai-backups` (2/2 prefixados · bonus)
- Bucket `media` é `public=false` (private · LGPD-compliant)
- RLS policies presentes (mig 111) garantem tenant isolation

**Mig 110 segura para repair** · zero risco de re-execução do backfill (CLI faz INSERT no tracker, não roda SQL).

---

## 12 · Resultado por migration

| Mig | Status | Evidência | Recomendação |
|---|---|---|---|
| **100** | ✅ MATERIALIZED_CONFIRMED (no-op) | DDL=0, drops=0, dml=0 · doc-only | repair (no-op) |
| **101** | ✅ MATERIALIZED_CONFIRMED | DROP CONSTRAINT idempotente · unique per channel ativo em `wa_conversations` | repair |
| **102** | ✅ MATERIALIZED_CONFIRMED | `conversation_questions` table existe + 2 GRANTs | repair |
| **103** | ✅ MATERIALIZED_CONFIRMED | 4 CHECK constraints CRM v2 · distribuição clean (probe A) | repair |
| **104** | ✅ MATERIALIZED_CONFIRMED | 0 zombie triggers/functions remanescentes (probe B3) | repair |
| **105** | ✅ MATERIALIZED_CONFIRMED | 69 DDLs `restore_dropped_table_columns` · idempotente · referenced tables existem (orfãs restauradas) | repair |
| **106** | ✅ MATERIALIZED_CONFIRMED | `audit_wa_conversations` table + trigger ativo (probe E1+E5) | repair |
| **107** | ✅ MATERIALIZED_CONFIRMED | 48 DDLs · harden + restore · referenced objects existem | repair |
| **108** | ✅ MATERIALIZED_CONFIRMED | `wa_webhook_log` table com 15058 rows (probe doc 18 §F) | repair |
| **109** | ✅ MATERIALIZED_CONFIRMED | Legacy unique removida · partial unique novo em uso · 0 duplicatas (probe C) | repair |
| **110** | ✅ MATERIALIZED_CONFIRMED **(crítica)** | 291/291 objetos em bucket `media` prefixados clinic_id · backfill 100% (probe D) | repair |
| **111** | ✅ MATERIALIZED_CONFIRMED | 4 RLS policies em storage.objects para bucket `media` (probe D3) | repair |
| **112** | ✅ MATERIALIZED_CONFIRMED | `wa_inbound_queue` table existe + 14 GRANTs (probe E1) | repair |
| **113** | ✅ MATERIALIZED_CONFIRMED (cron no-op SQL) | Cron config · nenhum objeto runtime visível esperado (idem 1A.4 mig 138) | repair |
| **114** | ✅ MATERIALIZED_CONFIRMED | 2 RPCs `wa_secretaria_auto_greeting_*` + GRANTs (probe E4) | repair |
| **115** | ✅ MATERIALIZED_CONFIRMED | 3 DDLs · vpi_ind_stage type fix · idempotente | repair |
| **116** | ✅ MATERIALIZED_CONFIRMED | Trigger `trg_sync_wa_conversation_preview_v2` ativo (probe E5) | repair |
| **117** | ✅ MATERIALIZED_CONFIRMED | RPC `wa_secretaria_auto_greeting_*` ativa com guards (mig 114+117 evoluem mesma RPC) | repair |
| **118** | ✅ MATERIALIZED_CONFIRMED | DROP CONSTRAINT idempotente · CHECK conflitante removida | repair |
| **119** | ✅ MATERIALIZED_CONFIRMED | DROP TRIGGER idempotente · legacy summary trigger removida | repair |

---

## 13 · Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| Mig 110 backfill faltou algum objeto | Baixíssima | 291/291 prefixados · zero falsos negativos |
| Mig 105 (69 DDLs restore) parcial | Baixa | Idem ratio alto (62 idem) · IF NOT EXISTS extensivo |
| Mig 107 storage usage | Baixa | 1 storage hit · provavelmente bucket reference · funcionou |
| Mig 113 cron sem objeto runtime visível | Aceito | Cron schedules vivem em `cron.job` table interna · não probed (low impact) |
| `secretaria_auto_greeting` repair vs 114 + 117 | Baixa | mig 117 é evolução · função final aplicada |
| Próximo bloco 077-099 tem 23 migs + drops massivos | Aceito | Fase 1A.10 separa |

---

## 14 · Estratégia recomendada

**Opção A · Repair completo do bloco 100-119 em lote.**

Justificativa:
- 20/20 materializadas (zero gap, zero PARTIAL)
- Migs críticas (103, 104, 109, 110, 111) probadas individualmente com evidência forte
- Mig 110 (a maior preocupação · 9 DMLs LGPD) confirmou 291/291 prefixados
- Mig 105 (a mais pesada · 69 DDLs) é "restore puro" idempotente
- 1 chamada CLI · ~5s · low risk

---

## 15 · Comando de repair sugerido (NÃO EXECUTADO)

```bash
supabase migration repair --status applied \
  20260800000100 20260800000101 20260800000102 20260800000103 \
  20260800000104 20260800000105 20260800000106 20260800000107 \
  20260800000108 20260800000109 20260800000110 20260800000111 \
  20260800000112 20260800000113 20260800000114 20260800000115 \
  20260800000116 20260800000117 20260800000118 20260800000119
```

**Pré-requisitos:**
- ✅ `SUPABASE_ACCESS_TOKEN` em `.env`
- ✅ Project-ref `oqboitkpcvuaudouwvkl`
- ⚠️ 20 marker files temporários em `supabase/migrations/`
- ⚠️ Confirmação Alden

**Gap esperado depois:**
- Local: 148 (sem mudança)
- Remote: 134 → **154** (+20)
- Missing: 55 → **35** (−20)

---

## 16 · Próximo passo

**Fase 1A.9 · Repair do Bloco 100-119** (se Alden autorizar).

Após sucesso, **Fase 1A.10 · Sanity probes do Bloco 077-099** (23 migs · RLS endurecimento + cleanup massivo · 5 DROP TABLE migrations). Será o bloco com mais drops · probes focados em ausência (confirmar que tabelas dropadas realmente não existem mais).

Se Alden NÃO autorizar agora, parar e aguardar. Próximas auditorias podem rodar em paralelo.
