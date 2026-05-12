# CRM_PHASE_2G.2 · Internal Alerts UI + Cron

> **Data:** 2026-05-12
> **Status:** ENTREGA VERTICAL · cron ativo + UI bell wired · zero envio real
> **HEAD inicial:** `c1f408d` · HEAD final esperado: commit local
> **Verdict alvo:** `PASS_CRM_PHASE_2G2_UI_AND_CRON_READY_LOCAL_COMMIT`

---

## 1 · Resumo executivo

Fecha o pacote vertical de **alertas internos Secretaria/Mirian**:

- **Cron 91** (`agenda-alert-not-confirmed-tick`) ativo · roda diário 08:00 BRT chamando `_appointment_not_confirmed_alert_tick()` (mig 161 · sem WhatsApp · dry).
- **UI bell** plugada no Topbar (`AppHeaderThin`) com badge unread + dropdown listando até 50 alertas + ação "marcar como lido".
- **Hook `useAppointmentInternalAlerts`** consome `appointment_internal_alerts` via `createBrowserClient` + RLS multi-tenant · polling 30s.
- **Worker 71 segue OFF** · ban gate 2L preservado · zero envio WhatsApp/Evolution/Meta.

---

## 2 · Estado inicial

| Item | Valor |
|---|---|
| Branch | `main` |
| HEAD | `c1f408d773dd83225ebcb2359b218adc4528220a` |
| HEAD == origin/main | ✅ |
| Mig 161 tracker | registrado |
| Tabela `appointment_internal_alerts` | total=0 (0 unread) |
| Crons antes | 12 ON · **71 OFF** · 72 ON · 89 ON · 90 ON |

---

## 3 · Cron 91 criado

| Item | Valor |
|---|---|
| Job ID | **91** |
| Nome | `agenda-alert-not-confirmed-tick` |
| Schedule UTC | `0 11 * * *` (08:00 BRT) |
| Comando | `SELECT public._appointment_not_confirmed_alert_tick();` |
| Active | `true` |

Comando executado:
```sql
SELECT cron.schedule(
  'agenda-alert-not-confirmed-tick',
  '0 11 * * *',
  $cmd$SELECT public._appointment_not_confirmed_alert_tick();$cmd$
);
```
→ retorno: `[{"jobid_not_confirmed":91}]` (HTTP 201)

Primeira execução natural: amanhã 08:00 BRT (13/05).

**Worker 71 segue OFF** · cron 91 só gera rows em `appointment_internal_alerts` · zero `wa_outbox` · zero envio real.

---

## 4 · UI bell · arquitetura

### Hook · `useAppointmentInternalAlerts`
- **Arquivo:** `apps/lara/src/hooks/useAppointmentInternalAlerts.ts`
- **Padrão:** `createBrowserClient` + SELECT direto (RLS multi-tenant filtra `clinic_id`)
- **Query:** `SELECT * FROM appointment_internal_alerts WHERE is_read=false ORDER BY created_at DESC LIMIT 50`
- **Polling:** 30s via `setInterval`
- **markAsRead:** RPC `appointment_internal_alert_mark_read(uuid)` · otimismo (remove da lista local) · refetch on fail
- **Return:** `{ items, unreadCount, isLoading, error, refresh, markAsRead }`

### Componente · `AlertBell`
- **Arquivo:** `apps/lara/src/components/AlertBell.tsx`
- **Estrutura:**
  - `<button>` com `<Bell />` lucide-react `w-4 h-4`
  - Badge vermelho absoluto top-right · mostra `unreadCount` (9+ se > 9)
  - Click → dropdown 380px wide · até 50 itens
  - Cada item: ícone do tipo + label kind + paciente + data/hora + profissional + criado_em + botão check (mark_read)
  - Click fora do dropdown → fecha
- **Labels canônicos:**
  | kind | label |
  |---|---|
  | `not_confirmed_d_minus_1` | "Não confirmou (amanhã)" |
  | `not_confirmed_d_zero` | "Não confirmou (hoje)" |
  | `arrival` | "Paciente chegou" |
  | `next_patient` | "Próximo paciente" |
  | `attention_required` | "Atenção necessária" |

### Integração Topbar · `AppHeaderThin.tsx`
- **Linha 78** (após `<NotificationToggle />`, antes `<Link Painel CRM>`)
- Sem props · self-contained (usa `createBrowserClient` interno)
- A11y: `title` + `aria-label` + `aria-expanded` + `aria-haspopup`

---

## 5 · Banco · contratos consumidos

Sem nova migration nesta fase. Usa exclusivamente:

| Objeto | Origem | Consumo |
|---|---|---|
| `appointment_internal_alerts` (table) | mig 161 (2G) | SELECT via supabase-js + RLS |
| `appointment_internal_alert_mark_read(uuid)` | mig 161 (2G) | RPC via supabase-js |
| `_appointment_not_confirmed_alert_tick()` | mig 161 (2G) | chamado por cron 91 (job criado nesta fase) |

---

## 6 · Backend / actions

Nada novo nesta fase. `AppointmentRepository.createArrivalInternalAlert` continua disparado por `attendAppointmentAction` (fase 2G original).

A criação do cron 91 é a única adição operacional no banco.

---

## 7 · Frontend · arquivos novos / modificados

| Arquivo | Tipo |
|---|---|
| `apps/lara/src/hooks/useAppointmentInternalAlerts.ts` | A (novo · ~120 linhas) |
| `apps/lara/src/components/AlertBell.tsx` | A (novo · ~220 linhas · client component) |
| `apps/lara/src/components/AppHeaderThin.tsx` | M (+2 linhas · import + `<AlertBell />`) |

Outros 0 arquivos TS tocados. Build limpo · typecheck 0 erros.

---

## 8 · Smoke read-only

Arquivo: [docs/crm-refactor/sql/phase-2g2-cron-and-ui-smoke.sql](sql/phase-2g2-cron-and-ui-smoke.sql)

Resultado das 8 flags finais:

| Flag | Valor |
|---|---|
| `worker71_off` | **true** ✅ |
| `cron_91_active` | **true** ✅ |
| `cron_91_schedule_ok` (`0 11 * * *`) | **true** ✅ |
| `cron_91_command_ok` (`SELECT public._appointment_not_confirmed_alert_tick();`) | **true** ✅ |
| `alert_fns_complete` (4/4) | **true** ✅ |
| `mark_read_exec_by_authenticated` | **true** ✅ |
| `unsafe_outbox_count` | 0 ✅ |
| `no_send_cron_active` | true ✅ |

UI smoke é manual (`/dashboard` no browser logado · verificar bell + dropdown + mark-read · próxima validação por humano em browser).

---

## 9 · Validation SQL

Os blocos da fase 2G (`phase-2g-internal-alerts-validation.sql`) continuam relevantes. Esta fase adiciona o `phase-2g2-cron-and-ui-smoke.sql` focado em cron 91 + contrato UI.

---

## 10 · Segurança

- ❌ Zero ativação job 71 · gate inegociável preservado
- ❌ Zero envio WhatsApp/Evolution/Meta
- ❌ Zero `wa_outbox` insert
- ❌ Zero alteração env/secrets
- ❌ Zero deploy
- ❌ Zero migration nova (só `cron.schedule` foi chamado · cria row em `cron.job`)
- ✅ RLS herdado de mig 161 protege multi-tenant na query do hook
- ✅ `mark_read` RPC valida `clinic_id = app_clinic_id()` + `is_read=false` antes de UPDATE
- ✅ Otimismo do UI revertido em refetch se RPC falha

---

## 11 · Limitações

1. **Realtime** não usado (decisão consciente · polling 30s é simples · 2G.3 pode adicionar `supabase.channel.on('postgres_changes', ...)`)
2. **Página dedicada `/alerts`** não criada · dropdown da bell cobre o caso de uso operacional (50 unread)
3. **Toast de confirmação** ao marcar como lido · otimismo silencioso (não usa lib de toast · projeto não tem `sonner`/`react-hot-toast`)
4. `next_patient` e `attention_required` continuam declarados no CHECK enum mas sem tick fn (CRM_PHASE_2G.3)
5. UI smoke é manual · não automatizado (não há Playwright no projeto)

---

## 12 · Rollback operacional

### Pause do cron 91
```sql
-- READ FIRST · NÃO EXECUTAR sem autorização
SELECT cron.alter_job(91, active := false);
```

### Remoção completa do cron
```sql
SELECT cron.unschedule(91);
-- ou: SELECT cron.unschedule('agenda-alert-not-confirmed-tick');
```

### Frontend revert
Remover:
- `apps/lara/src/hooks/useAppointmentInternalAlerts.ts` (file)
- `apps/lara/src/components/AlertBell.tsx` (file)
- Linha `<AlertBell />` em `AppHeaderThin.tsx`
- Import `AlertBell` em `AppHeaderThin.tsx`

**Worker 71 OFF é o gate principal.** Mesmo se UI bell quebrar, nada vaza pra envio real.

---

## 13 · Próxima fase recomendada

### CRM_PHASE_2G.3 · alertas adicionais + realtime (próxima vertical)
- Tick fns para `next_patient` (reaproveita `min_before` mas grava em internal alerts)
- Tick fn para `attention_required` (scan de appts com dados faltando)
- Cron 92/93 para essas ticks
- Supabase Realtime channel pra bell (substituir polling 30s)
- Page `/alerts` opcional (histórico completo · read e unread)

### Alternativas paralelas
- CRM_PHASE_2K · `d_after` pós-consulta (gap P0 da auditoria 2E)
- CRM_PHASE_2H · frontend state alignment (hardcodes + view consumer)
- CRM_PHASE_2L.1 · audit ban resolution

---

## 14 · Histórico

- 2026-05-12 · Mig 161 aplicada (CRM_PHASE_2G · `c1f408d`)
- 2026-05-12 · Cron 91 criado · UI bell wired · este doc (CRM_PHASE_2G.2)
- Próxima fase 2G.3 pendente

---

## 15 · Confirmações negativas

- ❌ Zero ativação job 71
- ❌ Zero envio WhatsApp/Evolution
- ❌ Zero call Meta/provider
- ❌ Zero migration nova aplicada
- ❌ Zero `db push` / `migration repair`
- ❌ Zero alteração env/secrets
- ❌ Zero deploy
- ❌ Zero write em produção fora da criação do cron 91
- ❌ Zero alteração `wa_outbox` / `agenda_alerts_log` / `inbox_notifications` dados
- ❌ Zero realtime/SSE adicionado (polling 30s · simplicidade)
- ✅ Typechecks passaram: `@clinicai/lara` 0 erros
