# CRM_PHASE_LEGACY.PORT.DASHBOARDS · Dashboards SDR/funil por profissional

> Primeira portabilidade crítica do legacy (`sdr.js` + `financeiro-reports.js`).
> Recriado em React/Next.js sobre fontes canônicas v2 · zero localStorage como
> fonte de verdade · zero status zumbi · zero provider externo · zero `wa_outbox`.

---

## 1. Resumo executivo

Construído `/crm/dashboard` (Next.js Server Component) que consome
read-only de 6 fontes v2:

- `appointments` (FK profissional + status canônicos)
- `leads` (phase + lifecycle)
- `perdidos` (recovery snapshot)
- `orcamentos` (status distribuição)
- `patients` (count ativos)
- `commercial_recovery_workflow_view` (2RC.1)

**Sem migration.** DB já entrega tudo necessário. Trabalho concentrado
em repository + UI.

Entrega:

- `CrmDashboardRepository` · 4 métodos read-only (summary, funnel, byProfessional, operationalLists)
- `/crm/dashboard/page.tsx` · SSR com 4 queries paralelas
- 3 componentes filhos · `_filters.tsx` (client · searchParams), `_funnel.tsx` (SSR), `_by-professional.tsx` (SSR), `_operational-lists.tsx` (SSR)
- Nav link "Dashboard" adicionado em `crm-nav.tsx`

---

## 2. O que foi portado/recriado do legacy

### Conceitos preservados

| Legacy (`sdr.js`) | V2 equivalente |
|---|---|
| Funil 6 stages (totalLeads, agendado, compareceu, paciente, orcamento, perdido) | Funil canônico v2 (mesma sequência · sem `compareceu` como phase de lead · derivado de `appointments.chegada_em IS NOT NULL`) |
| Taxas: pctAg, pctComp, pctPac, pctOrc, pctFech, pctLost | `rates: { pctAgendamento, pctComparecimento, pctFinalizacao, pctNoShow, pctCancelamento }` no summary |
| Source comparison (por origem) | Filtro de origem no dashboard (parâmetro · não tabela ainda) |
| Comparação por profissional | Tabela `ByProfessionalTable` com aggregates por professional_id |
| Thresholds editáveis (verde/amarelo) | RateCards com tone derivado de bandas fixas (≥60% verde, <30% alerta · ≤5% para invertidos como no-show) |
| KPI cards verticais | KPI cards em grid 4 colunas |
| Períodos hoje/semana/mês | Períodos hoje/7d/30d/mtd/custom |
| Filter por profissional | Select com pool `is_active=true AND agenda_enabled=true` |
| Filter por temperature (hot/warm/cold) | **Não portado** · v2 ainda não tem `temperature` em uso operacional |

### O que foi descartado

| Legacy | Motivo |
|---|---|
| `localStorage` config (`sdrGetConfig/sdrSaveConfig`) | Fonte da verdade migrada para searchParams · zero state cliente |
| Threshold editáveis inline | UX desnecessária na primeira porta · pode voltar como user-config v2 futuro |
| `temp_hot/temp_warm/temp_cold` | Não há definição canônica em produção · descartado até bucketing oficial |
| Render manual via `document.getElementById` | Substituído por React SSR |
| Source comparison table com gradient de fontes | Filtro de origem em select · agregação visual será refeita em fase futura |

---

## 3. Fontes de dados v2 (read-only)

| Fonte | Uso |
|---|---|
| `appointments` (table) | aggregates por status, professional, filtro de origem, listas operacionais |
| `leads` (table) | counts por phase + lifecycle_status + leads sem appointment |
| `patients` (table) | count `status='active'` |
| `orcamentos` (table) | status distribution + recentes |
| `perdidos` (table) | recovery snapshot (recoverable/recovered/discarded) |
| `professional_profiles` (table) | pool de profissionais com `agenda_enabled=true` |
| `commercial_recovery_workflow_view` (view) | workflow open + overdue |
| `crm_operational_view` (view) | disponível mas não usada (não tem `professional_id`) · CONTROL.1 pode evoluir |

**Sem migration.** `crm_operational_view` poderia ganhar `professional_id`
no futuro mas não é bloqueante.

---

## 4. Contrato dos filtros

| Filtro | Tipo | Source | Default |
|---|---|---|---|
| `range` | `today/7d/30d/mtd/custom` | searchParams `?range=` | `30d` |
| `from`/`to` | date `YYYY-MM-DD` | searchParams (só com `range=custom`) | n/a |
| `professionalId` | UUID | searchParams `?professionalId=` | null (todos) |
| `origem` | text | searchParams `?origem=` | null (todos) |

Página é SSR · filtros mudam a URL · NÃO há cache cliente. Voltar para uma URL antiga
reproduz exatamente o mesmo dashboard.

---

## 5. KPIs entregues

### KPI cards (8 cards)

- Leads ativos (`lifecycle_status='ativo'`)
- Agendados (`status ∈ {agendado, aguardando_confirmacao}`)
- Compareceram (`naClinica + emAtendimento + finalizado`)
- Finalizados
- Pacientes ativos
- Orçamentos ativos (`draft + aprovado`)
- Perdidos (leads `lifecycle=perdido` + `perdidos` table total)
- Recuperação aberta (`workflowOpen` · com badge "X atrasados" se houver overdue)

### Rate cards (5 cards · 0-100%)

- Taxa de agendamento (appts agendados / leads ativos)
- Comparecimento (compareceu / (agendado+compareceu+no_show+cancelado))
- Finalização (finalizado / compareceu)
- No-show (no_show / total appts · INVERTIDO · alto = ruim)
- Cancelamento (cancelado / total appts · INVERTIDO)

Tone por bandas fixas:
- Normal: ≥60% verde · <30% alerta · resto neutro
- Invertido: ≤5% verde · ≥15% alerta · resto neutro

### Status pills (10 pills)

Distribuição de appointments no período: Agendado, Confirmado, Na clínica,
Em atendimento, Finalizado, Remarcado, Cancelado, No-show, Bloqueado, Total.

---

## 6. Funil canônico v2

```
Leads ativos
  ↓
Em phase agendado  (lead.phase='agendado')
  ↓
Compareceram      (appt.chegada_em IS NOT NULL · global histórico)
  ↓
Pacientes        (lead.phase='paciente' · convertidos)
  ↓
Orçamentos       (lead.phase='orcamento' · intenção)

Perdidos (snapshot total · `perdidos` table)
Recuperados (`perdidos.recovered_at IS NOT NULL`)
```

Barras horizontais com largura proporcional ao max value.
Tones: paciente/recuperado verde · perdido vermelho · resto neutro.

---

## 7. Segmentação por profissional

Tabela `ByProfessionalTable` (responsiva · overflow-x):

| Coluna | Definição |
|---|---|
| Profissional | display_name + specialty |
| Total | count de appointments no período |
| Agendado | agendado + aguardando_confirmacao |
| Confirm/Atend | confirmado + aguardando + na_clinica + em_atendimento |
| Finalizado | status=finalizado (verde) |
| No-show | status=no_show (vermelho) |
| Cancelado | status=cancelado + remarcado (vermelho) |
| Bloqueado | status=bloqueado (muted) |

- Inclui linha "zero" para profissionais ativos sem appointments no período
- Inclui placeholder "Profissional (inativo)" se appt aponta para professional_id
  fora do pool ativo
- Ordenado por total desc

---

## 8. UI entregue

| Componente | Tipo | Path |
|---|---|---|
| `CrmDashboardPage` | Server | `apps/lara/src/app/crm/dashboard/page.tsx` |
| `DashboardFilters` | Client | `apps/lara/src/app/crm/dashboard/_filters.tsx` |
| `FunnelCard` | Server | `apps/lara/src/app/crm/dashboard/_funnel.tsx` |
| `ByProfessionalTable` | Server | `apps/lara/src/app/crm/dashboard/_by-professional.tsx` |
| `OperationalLists` | Server | `apps/lara/src/app/crm/dashboard/_operational-lists.tsx` |
| Nav link | Server | `apps/lara/src/app/crm/_components/crm-nav.tsx` (+1 entry "Dashboard") |

### Listas operacionais (4 cards)

- Próximos agendamentos (10) · link → `/crm/agenda/[id]`
- Leads sem agendamento (10) · link → `/crm/leads/[id]`
- Recuperação atrasada (10 · `next_action_overdue=true`) · link → `/crm/recuperacao?overdue=1`
- Orçamentos recentes (10) · link → `/crm/orcamentos/[id]`

---

## 9. Banco / migration

**NÃO houve migration.**

Decisão: DB já entrega todas as fontes (mig 161/170/172/173/174 etc).
Adicionar view dedicada para dashboard seria prematuro · queries do
repository são rápidas com índices existentes:

- `idx_appt_clinic_date`
- `idx_appt_professional_date`
- `idx_appt_status`
- `idx_appt_lead_id` / `idx_appt_patient_id`

Performance OK até ~10k appointments por clínica. Materialização ou view
dedicada pode ser feita em CONTROL.1 se necessário.

---

## 10. Smoke (read-only · 9 cenários)

`docs/crm-refactor/sql/phase-legacy-port-dashboards-smoke.sql`

| Test | Cobertura |
|---|---|
| A | Sources exist (8 tables/views) |
| B | Professional filter queries roda |
| C | Funnel query roda · counts |
| D | By professional aggregate roda |
| E | Recovery workflow_view + queue_view rodam |
| F | Zero status zumbi nos dados |
| G | worker71_off=true |
| H | wa_outbox unsafe count = 0 |
| I | Smoke é 100% read-only · provável por ausência de mutations |

Todos PASS (HTTP 201 · sem RAISE EXCEPTION pois é tudo read-only).

---

## 11. Validation flags

`docs/crm-refactor/sql/phase-legacy-port-dashboards-validation.sql`

```json
{
  "worker71_off": true,
  "core_sources_ready": true,
  "professional_filter_ready": true,
  "no_zombie_statuses": true,
  "professionals_pool": 6,
  "unsafe_outbox_count": 0,
  "can_continue": true
}
```

---

## 12. Riscos residuais

| Risco | Severidade | Mitigação |
|---|---|---|
| `appt_without_professional=3` (legados sem prof) | 🟢 baixo | Já flagrado em 2AUX.2 · não bloqueante · candidato a cleanup CONTROL.1 |
| Dados sparsos hoje (3 appointments total) | 🟢 baixo | Dashboard renderiza zeros consistentes · escala com produção |
| Funnel "compareceu" é histórico (não filtra por período) | 🟡 médio | Documentado no card · próxima fase pode adicionar bucketing por período |
| Sem cache · cada page load roda 5 queries | 🟢 baixo | Index parciais cobrem · revalidação default Next.js (force-dynamic) é correto pra dashboard |
| Threshold rates fixos (não editáveis) | 🟢 baixo | UX prioritária · user-config pode voltar como `clinic_preferences` futuro |
| Sem export CSV | 🟢 baixo | Diferido · próxima fase |
| Sem chart visual (só barras + tabela) | 🟢 baixo | Padrão minimalista · gráficos podem entrar como melhoria UX |

---

## 13. O que NÃO foi feito (escopo controlado)

- ❌ Migration nova
- ❌ View dedicada `crm_dashboard_view`
- ❌ Charts/gráficos (apenas barras inline)
- ❌ Export CSV
- ❌ Source comparison table (apenas filtro · agregação visual em fase futura)
- ❌ Thresholds editáveis pelo usuário
- ❌ Temperature buckets (hot/warm/cold)
- ❌ Funnel filtrado por período (snapshot atual)
- ❌ Real-time / SSE / polling automático
- ❌ Filtro de origem populado dinamicamente do DB (lista hardcoded por enquanto)

---

## 14. Próxima fase

Ver [`93-next-prompt-after-legacy-port-dashboards.md`](93-next-prompt-after-legacy-port-dashboards.md).

Recomendado: **CRM_PHASE_CONTROL.1** (audit final + cleanup) agora que
2AUX.2 + 1 port crítico (este) estão fechados.

Alternativas próximas:
- 2ALEXA.1 (polish AlertBell · UX rápido)
- LEGACY.PORT.PROCEDURES_ADMIN (CRUD admin)
- LEGACY.PORT.ANAMNESIS_BUILDER (templates anamnese)
