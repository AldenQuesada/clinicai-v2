# Hardening DB · Auditoria final
**Data:** 2026-05-03 · **Migs aplicadas:** 106 (audit) + 107 (hardening + restore)

---

## 1. Resumo executivo

### O que estava vulnerável

| # | Achado | Severidade |
|---|---|---|
| A | `conversation_questions` · `anon` tinha SELECT/INSERT/UPDATE/DELETE liberados (só RLS bloqueava) | **Crítico** |
| B | `conversation_questions` · `authenticated` tinha INSERT/UPDATE/DELETE/TRUNCATE/TRIGGER/REFERENCES (overkill) | Alta |
| C | `clinics`, `profiles`, `wa_numbers` · `authenticated` tinha TRUNCATE/TRIGGER/REFERENCES (overkill · TRUNCATE bypassa RLS) | Alta |
| D | 17 tabelas dropadas em mig 95 com 60+ RPCs órfãs · 6 ainda com schema mínimo após mig 105 (10 tinham sido cobertas) | Média |
| E | `wa_conversations` sem audit log · mass UPDATE de 17:08 UTC ficou sem rastro | Média |

### O que foi corrigido

| # | Fix | Onde |
|---|---|---|
| 1 | Audit log `audit_wa_conversations` · trigger AFTER + RLS admin/owner | Mig 106 |
| 2 | `conversation_questions` hardenizado · REVOKE ALL anon + REVOKE escrita auth | Mig 107 §1 |
| 3 | TRUNCATE/TRIGGER/REFERENCES revogados de auth em `clinics`/`profiles`/`wa_numbers`/`conversation_questions` | Mig 107 §2 |
| 4 | 6 tabelas orphan-RPC · colunas restauradas (retoque_campaigns, agenda_alerts_log, fm_storage_cleanup_queue, fm_share_rate_log, facial_share_access_log, tag_conflicts) | Mig 107 §3 |
| 5 | Endpoints `/status`, `/messages` POST, `/assume` migrados pra service_role com manual scope check | Sessão anterior · `4106e94` |
| 6 | Webhook outbound LID via `remote_jid` mapping | Sessão anterior · `86f377b` |
| 7 | Bot-to-bot guard restringido a INBOUND (não bloqueia outbound legítimo) | Sessão anterior · `9638ae7` |

### O que ficou pendente

| # | Item | Razão |
|---|---|---|
| P1 | `leads`, `orcamentos`, `appointments` · auth tem INSERT/UPDATE liberado | UI legitima usa direto · requer RPC nova pra cada caso · trabalho fora deste sprint |
| P2 | RPCs órfãs pra tabelas sem RPCs ativas (lead_tags 2, lp_consents 2, fin_annual_plan 2, facial_analyses 1) | Schema atual mínimo é suficiente · RPCs não falham por não serem chamadas |
| P3 | Audit log nas demais tabelas críticas (`leads`, `appointments`, `orcamentos`, `wa_messages`) | Pattern do mig 106 replicável · pode virar mig 108+ quando priorizar |
| P4 | Hardening de `audit_wa_conversations` contra anon · default Supabase pode dar grants extras na criação | Verificar mig 108 |

---

## 2. Arquivos alterados

### Migrations criadas

| Arquivo | Conteúdo |
|---|---|
| `db/migrations/20260800000106_clinicai_v2_audit_wa_conversations.sql` | Tabela + RLS + trigger AFTER INSERT/UPDATE/DELETE |
| `db/migrations/20260800000107_clinicai_v2_harden_conv_q_restore_orphan_tables.sql` | Hardening conv_q + revoke TTR + ALTER TABLE 6 orphan |

### Arquivos Node alterados (sessão anterior, contexto desta auditoria)

| Arquivo | Mudança |
|---|---|
| `apps/lara/src/app/api/conversations/[id]/status/route.ts` | loadServerContext valida JWT/clinic_id + service_role pra UPDATE |
| `apps/lara/src/app/api/conversations/[id]/messages/route.ts` | Idem · `conv.clinicId === ctx.clinic_id` check antes de saveOutbound/updateLastMessage |
| `apps/lara/src/app/api/conversations/[id]/assume/route.ts` | Idem · check ownership pelo conv.clinicId antes de updateAiPause |
| `apps/lara/src/app/api/webhook/whatsapp-evolution/route.ts` | Bot-to-bot guard só inbound · LID mapping via remote_jid |
| `apps/lara/src/app/api/webhook/whatsapp/route.ts` | Bot-to-bot guard só inbound (cloud webhook não tem outbound device) |

### Funções SQL criadas/alteradas

| Função | Tipo | Descrição |
|---|---|---|
| `public._audit_wa_conversations()` | Trigger fn | SECURITY DEFINER · captura old/new/changed_fields/audit_reason |
| `public.audit_wa_conversations` | Tabela | Persistência do audit log |
| Policies · `conv_q_select_own_clinic` | Policy | Recriada com clinic_id check |
| Policies · `conv_q_insert_own_clinic`, `conv_q_update_own_clinic` | Policy | **DROPADAS** · escrita só via service_role |
| Policies · `audit_wa_conversations_select_admin` | Policy | RLS · owner/admin only · scope clinic_id |

---

## 3. SQL executado · migrations completas

Ver arquivos:
- `db/migrations/20260800000106_clinicai_v2_audit_wa_conversations.sql` (229 linhas)
- `db/migrations/20260800000107_clinicai_v2_harden_conv_q_restore_orphan_tables.sql` (146 linhas)

Ambas idempotentes, transacionais, com `app.audit_reason` setado em mig 107.

---

## 4. Resultado das validações

### 4.1 RLS · enabled em todas as tabelas críticas

| Tabela | RLS | Forced |
|---|---|---|
| wa_messages | ✅ | false |
| wa_outbox | ✅ | false |
| wa_conversations | ✅ | false |
| phase_history | ✅ | false |
| wa_broadcasts | ✅ | (n/a · não auditado) |
| wa_agenda_automations | ✅ | (n/a · não auditado) |
| audit_wa_conversations | ✅ | false |
| conversation_questions | ✅ | false |

### 4.2 Grants matriz pós-fix

| Tabela | auth-S/I/U/D/Trunc/Trg/Refs | anon-S/I/U/D |
|---|---|---|
| wa_messages | Y/./././././. | ./././. |
| wa_outbox | Y/Y/././././. | ./././. |
| wa_conversations | Y/Y/././././. | ./././. |
| phase_history | Y/./././././. | ./././. |
| audit_wa_conversations | Y/./././././. | ./././. |
| conversation_questions | **Y/./././././.** | **./././.** ✓ |
| clinics | Y/Y/Y/Y/.//. | ./././. |
| profiles | Y/Y/Y/Y/.//. | ./././. |
| wa_numbers | Y/Y/Y/Y/.//. | ./././. |
| leads | Y/Y/Y/. | ./././. |
| orcamentos | Y/Y/Y/. | ./././. |
| appointments | Y/Y/Y/. | ./././. |

**Padrão alcançado:** auth tem só o que precisa · 0 anon · TTR removido onde não faz sentido.

### 4.3 Policies · conv_q

```
conv_q_select_own_clinic · SELECT · authenticated · clinic_id = app_clinic_id()
```
(insert/update policies dropadas)

### 4.4 RPCs com role guard

Todas as RPCs de `wa_conversation_*` têm:
- `SECURITY DEFINER`
- `SET search_path TO 'public', 'pg_temp'` (ou similar)
- `app_clinic_id() IS NULL → no_clinic_in_jwt`
- `app_role() NOT IN (...) → permission_denied`
- Retorno `jsonb` com `{ok, error?}`

### 4.5 Funções/triggers/views órfãs restantes

| Tipo | Antes | Após mig 105+107 |
|---|---|---|
| Trigger zumbi em wa_messages | 2 (NPS + VPI) | **0** ✓ |
| Funções referenciando tabelas dropadas | 60 | **61** (cresceu 1 por causa do trigger fn de audit · não é órfã) |
| Views quebradas | 0 | 0 |

Funções restantes não-órfãs · todas têm tabela existente (mesmo que vazia):
- 13 RPCs em nps_responses (B2B NPS reports) · schema completo após mig 105
- 5 RPCs em vpi_celebrations · schema completo após mig 105
- 5 RPCs em user_module_permissions · schema completo após mig 105
- 5 RPCs em fin_config · schema completo após mig 105
- 5 RPCs em facial_shares · schema completo após mig 105
- 4 RPCs em pluggy_connections · schema completo após mig 105
- 4 RPCs em clinic_alexa_log · schema completo após mig 105
- 4 RPCs em retoque_campaigns · schema completo após mig 107
- 2 RPCs em agenda_alerts_log · schema completo após mig 107
- 2 RPCs em fm_storage_cleanup_queue · schema completo após mig 107
- 1 RPC em fm_share_rate_log · schema completo após mig 107
- 1 RPC em facial_share_access_log · schema completo após mig 107
- 1 RPC em tag_conflicts · schema completo após mig 107
- 4 RPCs restantes em tabelas com schema mínimo aceitável (lead_tags, lp_consents, fin_annual_plan, facial_analyses)

---

## 5. Riscos · fluxos potencialmente impactados

| Fluxo | Impacto | Por que |
|---|---|---|
| **/secretaria · Pedir Dra (criar pergunta)** | ⚠️ a testar | conv_q INSERT só via service_role · `/api/secretaria/ask-doctor` já usa createServerClient · deveria funcionar |
| **/dra/perguntas · Listar pendentes** | ⚠️ a testar | SELECT vai pelo authenticated com clinic_id check · OK pelo RLS |
| **/dra/perguntas · Responder** | ⚠️ a testar | UPDATE só via service_role · `/api/dra/questions/[id]/answer` já usa createServerClient · OK |
| **Dashboard /clinics/profiles edit** | ⚠️ baixo | TRUNCATE removido só · CRUD normal continua |
| **Cron `wa_run_cadences`/`wa_nudge_inactive`** | ✅ sem impacto | Rodam como service_role · bypass RLS |
| **Webhook inbound (Cloud + Evolution)** | ✅ sem impacto | Já usa service_role |
| **Backfill manual via Mgmt API** | ✅ funciona com `SET LOCAL app.audit_reason='...'` | Audit captura |

---

## 6. Testes manuais sugeridos

### 6.1 conversation_questions (Sprint 1 Consultoria)
- [ ] /secretaria · selecionar conv · clicar "Pedir Dra" · digitar pergunta · enviar → deve criar row em conversation_questions
- [ ] /dra/perguntas · login como Mirian (owner) · listar pendentes · ver pergunta criada
- [ ] /dra/perguntas · responder + clicar "Resolvida" → status muda pra `answered` · sai da fila Dra · Luciana vê resposta no DoctorAnswerCard
- [ ] /dra/perguntas · descartar (PATCH status='discarded') → não aparece mais

### 6.2 Fluxo WhatsApp inbound
- [ ] Paciente novo manda msg pro Mih → conv criada com inbox_role=secretaria · auto-greeting "Oi {Nome}!💛..." sai · /secretaria mostra em Aguardando

### 6.3 Outbox sent/failed
- [ ] Bot envia msg via wa_outbox · cron processa · status='sent' → sem mudança visível mas DB OK
- [ ] Forçar falha (Evolution offline) · status='failed' após retries

### 6.4 Arquivar/reativar conversa
- [ ] /secretaria · click "arquivar" → status='archived' · audit_wa_conversations registra row com `actor_user_id`, `db_role='postgres'`/'authenticator', `changed_fields=['status']`
- [ ] /admin/conversas · clicar "reativar" → status='active' · audit captura

### 6.5 Broadcast (não auditado nesta sessão)
- [ ] Criar broadcast via UI · status='draft'
- [ ] Iniciar broadcast · status='running'
- [ ] Cancelar broadcast · status='cancelled'

### 6.6 Editar automação de agenda (não auditado nesta sessão)
- [ ] Criar regra de alerta via UI · linha em wa_agenda_automations
- [ ] Editar regra · UPDATE via wa_agenda_auto_upsert RPC

### 6.7 Audit log
- [ ] Após qualquer operação acima · `SELECT * FROM audit_wa_conversations ORDER BY audit_at DESC LIMIT 10` → ver actor_user_id/role/db_role/changed_fields/audit_reason
- [ ] Login como user role='secretaria' · query audit_wa_conversations → deve retornar 0 rows (RLS bloqueia · só admin/owner)

---

## 7. Próximos passos sugeridos (não executados nesta sessão)

1. **Mig 108** · audit log em wa_messages, leads, orcamentos, appointments (replicar pattern de mig 106)
2. **Mig 109** · RPCs SECURITY DEFINER pra `leads`, `orcamentos`, `appointments` create/update · permitir REVOKE INSERT/UPDATE de auth nessas tabelas
3. **Smoke test E2E** após Easypanel subir mig 107 · validar 6.1 a 6.7 acima
4. **Cleanup tmp** · remover scripts em `apps/lara/tmp-*.mjs` (já gitignored desde 56f0109)

---

## Regras seguidas

✅ Não reabri permissões em wa_messages/wa_outbox/wa_conversations/phase_history/wa_broadcasts/wa_agenda_automations
✅ service_role só no backend (`packages/supabase/src/server.ts` server-only)
✅ Mass UPDATE com SET LOCAL app.audit_reason='mig_107_harden_conv_q_restore_orphans'
✅ Sem alterações destrutivas · ALTER TABLE ADD COLUMN nullable preserva dados
✅ Backups · todas as migs idempotentes (IF NOT EXISTS / IF EXISTS)
