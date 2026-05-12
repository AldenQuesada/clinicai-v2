# CRM_PHASE_LEGACY.PORT.WIZARD_PROCEDURES · Select FK no wizard (Trilha B1)

> Trilha B1: wizard de agendamento consome `clinic_procedimentos` ativos
> via Select canônico, com snapshot em `procedure_name`. FK
> `appointments.procedure_id` NÃO existe ainda → migration proposta criada
> mas **não aplicada**. Zero risco de schema drift.

---

## 1 · Objetivo

Eliminar o input livre de procedimento no wizard novo/editar agendamento.
Recepcionista passa a escolher um procedimento oficial da clínica (vindo
de `public.clinic_procedimentos`) com sugestão automática de duração e
preço. Fallback "Outro · procedimento manual" preserva compatibilidade
com appointments legados.

Sem migration aplicada · sem RPC nova · sem alteração de schema remoto.

---

## 2 · Contexto

| Item | Estado |
|---|---|
| Procedures Admin (mig 175) | LIVE · CRUD em `/configuracoes/procedimentos` |
| `clinic_procedimentos` ativos | 44 |
| RLS `clinic_procedimentos` | enabled · 4 policies (select/insert/update/delete) |
| Wizard novo agendamento | usa `<Input>` text-free em `procedureName` |
| Wizard editar agendamento | mesma fonte (`NewAppointmentForm` em modo `editing`) |
| `appointments.procedure_id` | **não existe** |
| `appointments.procedure_name` | text-free 200 chars |

---

## 3 · Diagnóstico do schema (preflight read-only)

```json
{
  "appointment_procedure_cols": ["procedure_name", "recurrence_procedure"],
  "appointment_fk_to_procedures": [],
  "fk_count": 0,
  "clinic_procedimentos_total": 44,
  "clinic_procedimentos_active": 44,
  "clinic_procedimentos_rls": { "enabled": true, "policy_count": 4 }
}
```

`appointments` só tem `procedure_name` (text) e `recurrence_procedure` (text).
**Zero FK** apontando para `clinic_procedimentos`/`procedimentos`/`procedures`.

`clinic_procedimentos` tem campos prontos: `nome`, `categoria`, `preco`,
`preco_promo`, `duracao_min`, `ativo`. RLS+role gate consolidados.

---

## 4 · Decisão da trilha

**Trilha B1 · entrega compatível sem migration aplicada.**

Razões:

1. Há contrato real só com `procedure_name` (text snapshot). Implementar Select
   e fingir que existe FK seria mentira arquitetural.
2. Aplicar migration `ADD COLUMN procedure_id` exige autorização explícita
   (esta fase declara `NÃO aplicar migration`).
3. UI ganha valor imediato mesmo sem FK: padroniza nomes, sugere duração e
   preço, e prepara o terreno para a próxima fase ativar a FK.

Migration proposta foi criada como
[`db/migrations/PROPOSED_appointments_procedure_fk.sql`](../../db/migrations/PROPOSED_appointments_procedure_fk.sql)
· prefixo `PROPOSED_` impede execução automática. Conteúdo:

- `ALTER TABLE appointments ADD COLUMN procedure_id uuid`
- FK `appointments_procedure_id_fkey → clinic_procedimentos(id) ON DELETE SET NULL`
- Index parcial `idx_appointments_procedure_id WHERE procedure_id IS NOT NULL`
- Bloco de backfill por match exato de nome **comentado** (não rodar sem revisão)

---

## 5 · Contrato do wizard (novo)

### 5.1 Modo canônico (padrão)

Select agrupado por categoria, com formato:

```
<categoria> ▸ <nome do procedimento> · <duração>min · <preço>
```

Comportamento ao selecionar:

- Grava `procedureId` em estado (não persiste no DB por enquanto)
- Grava `procedureName` snapshot = `procedimento.nome`
- Auto-ajusta `endTime` aplicando `addMinutes(startTime, duracao_min)` se
  `duracao_min > 0`
- Auto-preenche `value` com `preco_promo` se válido senão `preco`
  (cortesia/zero → mantém valor manual)
- Limpa erro do campo procedimento

### 5.2 Modo manual (fallback)

Disparado pela opção sentinel `__manual__` "Outro · procedimento manual (legado)".

- Mostra `<Input>` text-free preservando o snapshot atual
- Hint discreto: "Modo manual · sem vínculo com clinic_procedimentos"
- Botão "Voltar ao Select oficial" reabre o select e zera o snapshot

### 5.3 Edição de appointments legados

- Se `procedureName` legado bate com nome ativo de `clinic_procedimentos`
  (match case-insensitive trim): Select abre **pré-selecionado**.
- Se não bate: form abre em modo manual com hint
  *"Agendamento legado · valor original preservado. Mudar para Select oficial
  trocaria o snapshot."*
- Usuário pode escolher continuar manual ou trocar pelo oficial — nada é
  reescrito sem ação explícita.

### 5.4 Caso clínica sem procedimentos ativos

Form abre direto em modo manual com hint:
*"Nenhum procedimento ativo · cadastre em `/configuracoes/procedimentos` para
usar o Select canônico."*

---

## 6 · Contrato de preço/duração

Reaproveita contrato de PROCEDURES_ADMIN:

- `preco > 0`: formatado como `R$ X,XX`
- `preco_promo > 0 AND preco_promo < preco`: `R$ Y,YY (de R$ X,XX)`
- `preco = 0` ou `NULL`: `A definir`
- `duracao_min` sugerida → auto-ajusta `endTime` no wizard
- Sem cálculo financeiro novo · sem gerar orçamento · sem cobrança

---

## 7 · Comportamento para appointments legados

Conta de "órfãos" (rows com `procedure_name` que não bate com nenhum nome
ativo do catálogo) é exposta no validation SQL como
`appointments_procedure_name_orphan`. **Não há backfill**. Cada appointment
legado só muda contrato se o usuário tocar nele via wizard.

---

## 8 · Segurança / privacidade

- `repos.procedureAdmin.list({ status: 'active' })` herda RLS multi-tenant
  do `clinic_procedimentos` · authenticated da clínica vê apenas seus
  procedimentos.
- Wizard server-side carrega lista em `loadServerReposContext()` · client
  recebe apenas ProcedureOption seguro (`id`, `nome`, `categoria`, `preco`,
  `precoPromo`, `duracaoMin`).
- Nenhum dado clínico sensível, nenhum telefone, nenhum valor de orçamento.
- Zero provider call, zero WhatsApp, zero Alexa, zero wa_outbox.

---

## 9 · Validações executadas

| Validation | Resultado |
|---|---|
| `pnpm --filter @clinicai/repositories typecheck` | OK |
| `pnpm --filter @clinicai/lara typecheck` | OK |
| `git diff --check` | sem warnings (apenas CRLF auto-conversão) |
| SQL validation `phase-legacy-port-wizard-procedures-validation.sql` | final_flags green |

Validation flags chave:

- `worker71_off`: true
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `invalid_appointment_status_count`: 0
- `cron_with_provider_call`: 0
- `clinic_procedimentos_active`: 44
- `appointment_fk_to_procedures_present`: false (esperado · B1)
- `migration_required_not_applied`: true (esperado · B1)
- `wizard_procedures_compat_ready`: true
- `can_continue`: true

---

## 10 · Impacto em dashboards/orçamentos/Copilot

- **Dashboards CRM:** continuam agregando por `procedure_name` (string). Quando
  a FK existir, será trivial migrar agregações para JOIN canônico.
- **Orçamentos:** já têm próprio fluxo (não tocado nesta fase).
- **Copilot/IA:** continua usando `ProcedureRepository` price-blind. Snapshot
  textual continua suficiente.
- **Mensagens/Lara:** nenhum impacto · não há código que dependa do nome do
  procedimento estar normalizado.

---

## 11 · Limitações conhecidas

| Limitação | Mitigação |
|---|---|
| Sem FK em DB · perda de integridade referencial | Migration proposta pronta para próxima autorização |
| Match legado por nome case-insensitive · pode ser ambíguo | Aviso "agendamento legado" mostra para usuário decidir |
| `duracao_min` do catálogo override do user no auto-ajuste | Usuário pode editar `endTime` manualmente depois |
| `value` auto-preenchido pode surpreender em cortesias | Tela de revisão (step 4) mostra valor antes do submit |

---

## 12 · Próximos passos

1. **Autorizar migration `appointment_procedure_fk`** quando equipe quiser
   contrato final · renomear `PROPOSED_*.sql` para mig numerada e aplicar.
2. **Atualizar `AppointmentRepository.create/update`** + Zod schemas para
   aceitar `procedureId` e gravar junto com snapshot.
3. **Audit residual dos appointments orphan** · decidir caso a caso
   (cadastrar como procedimento novo, ou aceitar como legado permanente).
4. **Próxima fase recomendada:** `CRM_PHASE_LEGACY.PORT.ANAMNESIS_BUILDER`
   (builder de anamnese com templates por procedimento).

---

## 13 · Veredito

**PASS_CRM_LEGACY_PORT_WIZARD_PROCEDURES_COMPAT_READY_LOCAL_COMMIT**

- Trilha B1 entregue · Select canônico + snapshot + fallback manual
- Zero migration aplicada
- Migration proposta documentada e isolada (`PROPOSED_*.sql`)
- Typecheck OK · validation green · smoke `can_continue=true`
- Aguardando autorização para `git push origin main`
