# CRM_PHASE_2L.2 · Cloud Meta Canary Preflight Foundation

> **Data:** 2026-05-12
> **Status:** Mig 168 APPLIED · smoke PASS · edge function pronta (NÃO deployada) · zero envio real
> **HEAD inicial:** `11a4f80` · HEAD final esperado: commit local 2L.2
> **Verdict alvo:** `PASS_CRM_PHASE_2L2_APPLIED_SMOKE_OK_EDGE_DRYRUN_READY_LOCAL_COMMIT`

---

## 1 · Resumo executivo

Fundação técnica completa para canary Cloud Meta SEM envio real. Inclui:
- Mig 168 (mirror de Meta approval status em `wa_message_templates` + tabela audit `wa_cloud_meta_canary_attempts` + helper RPC)
- Edge function `wa-canary-send` em `supabase/functions/` com `dry_run=true` default, 5 gates de segurança e mascaramento de número
- Real send **bloqueado por hardcode** via env `WA_CANARY_REAL_SEND_ENABLED` (não configurada nesta fase)

Worker 71 permanece OFF. Zero chamada Meta Graph nesta fase. Zero envio real.

---

## 2 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `11a4f80edd7631a0107f1a30216ebc8a1acd78b6` |
| Working tree | limpo |
| Mig 167 (hard gate) | aplicada |
| Worker 71 | OFF ✅ |

---

## 3 · Por que 2L.2 não envia mensagem real

Defesa em profundidade · 5 gates obrigatórios para chegar ao branch real-send do edge:

1. **`WA_CANARY_REAL_SEND_ENABLED != 'true'`** · env não configurada nesta fase. Edge retorna `real_send_disabled` 403 e registra audit `blocked`.
2. **`WA_CANARY_ALLOWED_RECIPIENTS` vazia ou recipient fora** · edge retorna `allowlist_empty` ou `recipient_not_in_allowlist` 403.
3. **Template sem `meta_approval_status='approved'`** · edge retorna `template_not_approved` 403. **DB tem ZERO templates com approved hoje** (admin precisa marcar manualmente após conferência Meta Business Manager).
4. **`X-Internal-Secret` ausente ou divergente** · edge retorna `unauthorized` 401.
5. **Canal não-Cloud-Meta** · se `wa_numbers` resolvido tem `instance_id` (Evolution) sem `phone_number_id` cloud, edge retorna `channel_not_cloud_meta` 403.

Adicional · rate limit interno: 1 canary por (template, recipient) em janela de 5 minutos.

---

## 4 · Canal aprovado · Lara Cloud Meta

Auditado em fase 2L.1 (doc 66):
- `wa_numbers.label ILIKE '%Lara%'`
- `is_active = true`
- `phone_number_id IS NOT NULL` ✅
- `access_token IS NOT NULL` ✅
- `business_account_id IS NOT NULL` ✅ (WABA aprovada)

Edge function default-resolve para "Lara" via `body.wa_number_label_hint = 'Lara'`.

---

## 5 · Mih banida · excluída do caminho

Edge function bloqueia explicitamente Evolution-only channels:

```ts
if (waNum.instance_id && (!waNum.phone_number_id || !waNum.access_token)) {
  // logAttempt blocked: 'channel_not_cloud_meta'
  return err('channel_not_cloud_meta', 403)
}
```

Mesmo que `wa_numbers.is_active=true` para Mih, ela é Evolution-only · canary nunca usa.

---

## 6 · Mig 168 · DDL aplicada

### 6.1 · ALTER `wa_message_templates` (6 colunas + 1 jsonb)

| Coluna | Tipo | Default |
|---|---|---|
| `meta_approval_status` | text | NULL · CHECK em (approved, pending, rejected, paused, disabled, unknown, NULL) |
| `meta_approval_checked_at` | timestamptz | NULL |
| `meta_template_name` | text | NULL (case-sensitive na Meta) |
| `meta_language` | text | NULL (BCP-47, ex: `pt_BR`) |
| `meta_category` | text | NULL |
| `meta_rejection_reason` | text | NULL |
| `meta_payload` | jsonb NOT NULL | `'{}'` |

**Default seguro:** todos NULL · nenhum template marcado approved automaticamente. Admin deve preencher manualmente após conferência no Meta Business Manager (sem chamar Graph API).

Index parcial: `idx_wa_template_meta_approved_active ON (clinic_id, meta_approval_status, active) WHERE meta_approval_status='approved' AND active=true`.

### 6.2 · TABLE `wa_cloud_meta_canary_attempts`

| Coluna | Notas |
|---|---|
| `id` uuid PK | gen_random_uuid() |
| `clinic_id` uuid | tenant · nullable (canary global) |
| `wa_number_id` uuid FK | ON DELETE SET NULL |
| `template_id` uuid FK | ON DELETE SET NULL |
| `template_name`, `template_language` | snapshot |
| `recipient_hash` text NOT NULL | sha256 hex · CHECK length >= 16 |
| `recipient_last4` text | CHECK length=4 + regex digit |
| `dry_run` boolean NOT NULL | default true |
| `status` text NOT NULL | CHECK in (dry_run, blocked, sent, delivered, failed, timeout) |
| `block_reason`, `error_message` | audit |
| `provider_message_id` | provider response |
| `request_payload_masked`, `response_payload_masked` | jsonb NOT NULL · masked (sem token, sem número completo) |
| `created_by` uuid | actor |
| `created_at`, `updated_at` | timestamps |

**Garantias:**
- NUNCA armazena número completo · CHECK constraint + audit no edge
- RLS multi-tenant · authenticated SELECT same-clinic
- Sem policy INSERT/UPDATE/DELETE para authenticated · audit imutável
- service_role faz INSERT via edge

3 indexes: `(clinic_id, created_at DESC)`, `(status, created_at DESC)`, `(recipient_hash, created_at DESC)`.

### 6.3 · Helper RPC `wa_cloud_meta_canary_log`

15 params · SECURITY DEFINER · search_path blindado · GRANT EXECUTE só para service_role.

Validações inline:
- `recipient_hash` obrigatório (min 16 chars)
- `status` enum check
- Insert atômico

---

## 7 · Template approval mirror

Coluna `meta_approval_status` permite que sistema (edge ou outras RPCs futuras) decida elegibilidade **sem chamar Meta Graph API**. Reduz latência + evita rate limit Meta.

**Fluxo recomendado para popular:**
1. Admin acessa Meta Business Manager
2. Confere status de cada template
3. Roda update manual em SQL Editor:
```sql
UPDATE public.wa_message_templates
   SET meta_approval_status = 'approved',
       meta_approval_checked_at = now(),
       meta_template_name = '<exact_name_no_meta>',
       meta_language = 'pt_BR'
 WHERE slug = '<seu_slug>';
```

**Hoje:** zero templates com approved. `can_open_2l3 = false` no validation flag até admin preencher pelo menos um.

---

## 8 · Canary audit table

Toda tentativa (dry_run, blocked, sent, failed, timeout) é loggada em `wa_cloud_meta_canary_attempts`.

**Mascaramento aplicado:**
- Recipient: sha256 hex (64 chars) + last4 only
- Tokens em payload: substituídos por `<redacted>` via `maskPayloadForAudit()`
- Phone fields em payload: `'masked:****'`
- Strings >200 chars: truncadas

---

## 9 · Edge function `wa-canary-send`

[supabase/functions/wa-canary-send/index.ts](../../supabase/functions/wa-canary-send/index.ts)

**Contrato:**
```
POST /functions/v1/wa-canary-send
Headers: X-Internal-Secret: <WA_CANARY_INTERNAL_SECRET>
Body: {
  template_id?: uuid | template_name?: string,
  recipient_e164: "5544999999999",
  dry_run?: boolean (default true),
  force_send?: boolean (default false),
  canary_reason: string (min 5 chars),
  wa_number_label_hint?: "Lara"
}
```

**Fluxo:**
1. Method check (POST only)
2. **Auth** · `x-internal-secret` (timing-safe compare)
3. **Parse body** · valida recipient_e164, canary_reason, template_id|name
4. **sha256 hash** do recipient + last4
5. **Gate real send** · se `dry_run=false` ou `force_send=true` e env flag `false`: log blocked + return 403
6. **Allowlist** · se vazia ou recipient fora: log blocked + return 403
7. **Resolver canal** · query `wa_numbers ILIKE label_hint AND is_active=true`
8. **Bloquear Evolution** · se sem `phone_number_id`/`access_token`: log blocked + return 403
9. **Resolver template** · por id ou name+active
10. **Validar template** · `active=true` E `meta_approval_status='approved'` E `meta_template_name` + `meta_language` set
11. **Rate limit** · 1 attempt por (template, recipient) em 5 min
12. **Montar payload Cloud Meta** (`messaging_product`, `to`, `type=template`, ...)
13. **Branch DRY-RUN** · log audit `dry_run` · NÃO chama Meta · return 200 com hint
14. **Branch REAL SEND** · fetch `https://graph.facebook.com/v21.0/{phone_number_id}/messages` · log `sent` ou `failed`

**Nunca logado em texto plano:**
- `access_token`
- recipient_e164 completo
- payload tokens/secrets

---

## 10 · Kill switch

**Imediato (qualquer momento):**
```sql
-- Desabilita real send mesmo com flag env
UPDATE pg_settings ... NO · use env removal
```

Ou via cron/edge:
- Remover env `WA_CANARY_REAL_SEND_ENABLED` no Supabase dashboard
- Edge volta a bloquear automaticamente

**Auditável:**
```sql
SELECT count(*) FROM public.wa_cloud_meta_canary_attempts
 WHERE status='sent' AND created_at >= now() - interval '24 hours';
-- Se > 0 sem autorização, kill switch + audit
```

---

## 11 · Allowlist

Env `WA_CANARY_ALLOWED_RECIPIENTS` (comma-separated E.164 list, sem `+`).

Exemplo conceitual (NÃO configurar nesta fase):
```
WA_CANARY_ALLOWED_RECIPIENTS=5544999999999,5511988887777
```

Edge function:
- Normaliza recipient via `String(raw).replace(/\D/g, '')`
- Compara contra lista normalizada
- Recipient fora: 403 blocked

---

## 12 · Rate limit

Edge function:
```ts
const { count } = await sb
  .from('wa_cloud_meta_canary_attempts')
  .select('id', { count: 'exact', head: true })
  .eq('template_id', tpl.id)
  .eq('recipient_hash', recipientHash)
  .gte('created_at', new Date(Date.now() - 5 * 60 * 1000).toISOString())

if ((count ?? 0) >= 1) return err('rate_limited_5min', 429)
```

1 attempt por (template, recipient) em janela 5min. Evita spam canary durante testes.

---

## 13 · Dry-run behavior

`dry_run=true` (default):
- ✅ Faz auth check + parse + validation completa
- ✅ Resolve canal + template
- ✅ Aplica todos os gates (allowlist, approved, rate limit)
- ✅ Monta payload Cloud Meta
- ❌ **NÃO chama Graph API**
- ✅ Loga audit row com `status='dry_run'`
- ✅ Retorna 200 com `would_call` URL e hint

`dry_run=false` AND env flag false:
- ❌ Bloqueia em gate 5 (real_send_disabled)
- ✅ Loga audit `blocked`
- ❌ NÃO segue para fetch Graph

`dry_run=false` AND env flag true · **fora do escopo 2L.2**:
- Apenas habilitado em CRM_PHASE_2L.3 com autorização explícita

---

## 14 · O que falta para 2L.3

Checklist obrigatório para canary real:
1. ✅ Mig 168 aplicada (template mirror + audit table)
2. ✅ Edge function commitada no repo
3. ⏳ Edge function **deployed** (não nesta fase)
4. ⏳ `WA_CANARY_INTERNAL_SECRET` configurada no Supabase dashboard
5. ⏳ `WA_CANARY_ALLOWED_RECIPIENTS` configurada com 1 número interno
6. ⏳ `WA_CANARY_REAL_SEND_ENABLED=true` configurada (gate final)
7. ⏳ Pelo menos 1 template com `meta_approval_status='approved'` populado após conferência Meta Business Manager
8. ⏳ Autorização explícita do usuário para envio canary
9. ⏳ Documentação do kill switch operacional
10. ⏳ Monitoramento setup (delivery receipts via webhook)

`can_open_2l3` validation flag retorna true só quando 5 e 7 ok.

---

## 15 · Smoke transacional · resultado

```
SMOKE_RESULT_2L2:
  baseline: worker71_off=true, canary_attempts_total=0, templates_total=42

  A · template unknown não é candidato ✅
  B · template approved É candidato ✅
  C · template rejected não é candidato ✅
  approved_smoke_count: 1 (só o approved fixture)

  D · dry_run audit log:
     status='dry_run', dry_run=true, last4='9999', hash_len=64
     masking_ok=true ✅ (sha256 + last4 correct)

  E · blocked audit log:
     status='blocked', block_reason='template_not_approved', dry_run=false ✅

  F · invalid status caught:
     'canary_log: status inválido INVALID_STATUS' ✅

  G · invalid hash caught (< 16 chars):
     'canary_log: recipient_hash obrigatório (min 16 chars)' ✅

  worker71_off_still: true ✅
  wa_outbox_delta: 0 ✅
```

ROLLBACK forçado · zero dado persistente.

[Arquivo smoke](sql/phase-2l2-cloud-meta-canary-preflight-smoke.sql) | [Validation](sql/phase-2l2-cloud-meta-canary-preflight-validation.sql)

---

## 16 · Validation flags esperadas

| Flag | Esperado |
|---|---|
| worker71_off | true |
| meta_status_columns_ready | true |
| canary_audit_ready | true |
| canary_log_fn_ready | true |
| approved_template_count | 0 (admin deve popular antes de 2L.3) |
| queued_count | 0 |
| pending_count | 0 |
| unsafe_outbox_count | 0 |
| lara_cloud_ready | true |
| tracker_mig_168 | "20260800000168" |
| canary_real_send_allowed | **false** |
| **can_open_2l3** | **false** (até admin marcar approved template) |

---

## 17 · Rollback

```bash
# 1. DROP mig 168
SUPABASE_ACCESS_TOKEN=... node scripts/apply-migration.mjs \
  db/migrations/20260800000168_clinicai_v2_cloud_meta_canary_preflight.sql --down

# 2. Remover tracker
DELETE FROM supabase_migrations.schema_migrations WHERE version='20260800000168';

# 3. Edge function · simplesmente não deploy
```

`git revert` cobre cleanup do edge function file.

---

## 18 · Riscos residuais

1. **Admin pode marcar `meta_approval_status='approved'` manualmente sem ter validado realmente na Meta** · mitigação: documentar checklist de validação + auditar `meta_approval_checked_at` periodicamente.
2. **Edge function deploy acidental** · supabase CLI tem `functions deploy` que poderia ser executado sem revisão. Mitigação: 2L.2 não deploya · CI/manual review obrigatório.
3. **`WA_CANARY_REAL_SEND_ENABLED=true` sem allowlist configurada** · edge bloquearia, mas log audit ainda gera row. Mitigação: validation flag `can_open_2l3` antes de habilitar.
4. **Rate limit 5min é por (template, recipient)** · burst entre templates diferentes ainda possível. Mitigação: monitoramento global de canary count/hora pós-2L.3.
5. **Recipient hash sha256 sem salt** · não impede revelação se base for vazada e atacante tiver lista de números provável. Mitigação: adicionar salt em fase posterior se necessário (LGPD compliance).

---

## 19 · Veredito

`PASS_CRM_PHASE_2L2_APPLIED_SMOKE_OK_EDGE_DRYRUN_READY_LOCAL_COMMIT`

Foundation completa. Próximo passo: **CRM_PHASE_2L.3 · Internal Cloud Meta Canary Send** com autorização explícita, OU paralelizar 2J.1 (lead_lost) · 2H.1 (cleanup zumbis) · 2AUX (modal agendamento) que não dependem de WhatsApp.

Ver [69-next-prompt-after-2l2.md](69-next-prompt-after-2l2.md).
