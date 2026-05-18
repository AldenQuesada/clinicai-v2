# 09 · Gap Priority Matrix · P0 / P1 / P2 / P3

> READ-ONLY · doc-only · 2026-05-18 · ordenação para plano de correção

## Critérios de classificação

- **P0** — permite dado errado em produção · quebra fluxo operacional · estado ilegal · risco financeiro/jurídico
- **P1** — funcionalidade importante ausente · divergência forte do legacy · UX degradada significativamente
- **P2** — fricção UX · tooltip · alerta · copy ausente · feature secundária
- **P3** — melhoria · nice-to-have

## P0 — BLOQUEIA OPERAÇÃO CLÍNICA

| # | ID | Gap | Impacto operacional | Doc fonte |
|---|----|-----|---------------------|-----------|
| 1 | M-09 | **Multi-procedimentos por appointment** ausente em v2 | Mirian agenda combos (Botox+Preenchimento) numa sessão · sem isso, secretaria cria N appointments fakes · perde valor financeiro | 02 |
| 2 | M-10 | **Valor por procedimento** ausente em v2 | Sem per-item value, finalize não tem como cobrar combo corretamente | 02 |
| 3 | M-11 | **Cortesia per-procedimento + motivo** ausente em v2 | Auditoria financeira inviável · "consulta paga + 1 proc cortesia" não modelado | 02, 03 |
| 4 | M-04/D-15/V-07/U-08 | **Seletor de sala** ausente no form v2 + multi-proc warning | Sem sala, conflict detectado mas não evitável · UX impossível pra Mirian | 02, 04, 05, 06 |
| 5 | M-16 | **10 formas de pagamento → 5 status** simplificação demais | Regressão financeira severa · perde Pix/Crédito/Boleto/Convênio/Cortesia/Link tracking | 02 |
| 6 | M-17 | **Multi-pagamento** (entrada+saldo, parcelas múltiplas) ausente | Pacote alto valor sem entrada+saldo é inviável | 02, 03 |
| 7 | M-18 | **Parcelas (boleto/crédito/parcelado)** ausente | Boleto/parcelado sem data de vencimento = inadimplência invisível | 02, 03 |
| 8 | M-19 | **Soma pagamentos = total** sem validação | Erros silenciosos em multi-pay quando reintroduzido | 02, 03, 05 |
| 9 | M-08 | **Tipo Consulta vs Procedimento** indistinguíveis em v2 | Fluxo clínico depende dessa distinção (avaliação paga, retorno, etc.) | 02 |
| 10 | F-07 | **Cashflow integration** removida (`CashflowService.createFromAppointment`) | Fluxo de caixa quebrado pós-finalize · KPI financeiro cego | 03 |
| 11 | F-09 | **WA pós-atendimento** removido (`sendWATemplate(id,'pos_atendimento')`) | Coração da máquina retenção VPI · sem isso "salvar e esquecer" | 03 |
| 12 | F-10 | **Avaliação Google D+3** removido | Reviews param de chegar · SEO local degrada | 03 |
| 13 | F-11 | **VPI auto-enroll + closeIndication** removido | Programa de indicação quebrado · NPS sem capture | 03 |
| 14 | F-13 | **clinic_op_tasks payment follow-up** removido | Boleto/parcelado/entrada+saldo sem cobrança = perda de receita | 03 |

**Total P0:** 14 gaps

## P1 — DEGRADA UX SIGNIFICATIVAMENTE

| # | ID | Gap | Impacto | Doc |
|---|----|-----|---------|-----|
| 1 | M-02 | Toggle Novo/Retorno ausente | UX regressão · secretaria não distingue | 02 |
| 2 | M-12 | Desconto per-procedimento ausente | Negociação comercial fica presa em orçamento_discount global | 02, 03 |
| 3 | M-22 | Motivo cortesia per-item perdido | Audit financeiro perde granularidade | 02 |
| 4 | M-24 | Confirmação WhatsApp toggle no wizard ausente | UX regressão | 02 |
| 5 | M-26 | Offline queue ausente | Conexão ruim quebra fluxo | 02 |
| 6 | M-07 | Duração default do procedimento não usada | Secretaria precisa digitar tudo manualmente | 02 |
| 7 | F-08 | Queixas update no finalize ausente | Histórico clínico perde tracking | 03 |
| 8 | F-12 | RetoquesEngine suggestion ausente | Pós-consulta sem proposta de retorno | 03 |
| 9 | F-14 | Tags engine substituído por invalidação · perde regras | Automações dependentes de tag não rodam | 03 |
| 10 | D-03 | Auto-link prof→sala ausente | UX regressão · força seleção manual sempre | 04 |
| 11 | D-04 | Férias profissional não bloqueia agenda | Risco de agendar com prof em férias | 04 |
| 12 | D-09 | Partner pricing exposure no form | Mirian usa parcerias VPI; valor genérico exibido | 04 |
| 13 | D-17 / S-03 | Conflict message v2 sem nome do conflitante | Secretaria não sabe quem está em conflito | 04, 06, 07 |
| 14 | V-03 | Antecedência mínima (clinic_settings) ausente | Agendamento "agora mesmo" rompe regras | 05 |
| 15 | V-04 | Horário expediente não validado | Risco de agendar fora do horário | 05 |
| 16 | V-10 | Profissional férias não enforçado | Idem D-04 | 05 |
| 17 | V-20 | Valor obrigatório no finalize removido | Finaliza sem cobrar = receita perdida | 05 |
| 18 | U-05 | Mesa Operacional ausente | Workflow secretaria interrompido | 06 |
| 19 | U-06 | Notification bell ausente | Alertas operacionais cegos | 06 |
| 20 | U-07 | Day alerts panel ausente | Visão consolidada do dia perdida | 06 |
| 21 | U-10 | Patient detail tabs incompletas | Anamnese/histórico/fotos/financeiro | 06 |
| 22 | S-02 | Optimistic UI no drag/drop ausente | UX percebida pior | 07 |
| 23 | X-01 | Orcamento UI items/edit/bulk parcial | Comercial usa muito orçamento | – |
| 24 | X-05 | Pacientes module parcial | Falta tabs completas | – |
| 25 | X-06 | Mesa Op cards | idem U-05 | – |
| 26 | X-11 | Automation engine parcial em v2 | Regras de marketing/automação dependem | – |

**Total P1:** 26 gaps

## P2 — FRICÇÃO UX / FEATURE SECUNDÁRIA

| # | ID | Gap | Doc |
|---|----|-----|-----|
| 1 | M-01 | XOR exception status bloqueado em v2 | 02 |
| 2 | M-13 | Retorno per-procedimento (fases jsonb) não mapeado | 02, 04 |
| 3 | M-23 | Origem/Indicado capturado só lead-side | 02 |
| 4 | M-25 | Draft autosave ausente | 02 |
| 5 | F-02/F-03 | Outcome "nenhum/apenas finalizar" ausente | 03 |
| 6 | F-16 | Confirm dialog no finalize ausente | 03 |
| 7 | D-07 | CRUD admin procedures v2 ausente | 04 |
| 8 | D-11 | Fases jsonb não mapeado | 04 |
| 9 | D-16 | FK `room_id uuid` (atualmente int) | 04 |
| 10 | D-18 | CRUD admin rooms v2 ausente | 04 |
| 11 | V-02 | Hora passada apenas client-side | 05 |
| 12 | V-05 | Almoço/blackout não enforçado | 05 |
| 13 | V-09 | Back-to-back gap warning ausente | 05 |
| 14 | V-23 | Paciente duplicado sem block | 05 |
| 15 | U-09 | Draft autosave ausente | 06 |
| 16 | U-16 | Recovery dry-run UI ausente | 06 |
| 17 | S-05 | em_consulta zumbi em DB legacy (limpeza) | 07 |
| 18 | S-07 | UI v2 distinção RPC dedicada | 07 |
| 19 | X-09 | Fotos prontuário ausente em v2 | – |
| 20 | X-10 | Financeiro tab no paciente ausente | – |
| 21 | X-12 | Recovery flow em construção | – |

**Total P2:** 21 gaps

## P3 — NICE-TO-HAVE

| # | ID | Gap | Doc |
|---|----|-----|-----|
| 1 | D-10 | Combos B2B `b2b_voucher_combos` | 04 |
| 2 | D-12 | Insumos `procedimento_insumos` | 04 |
| 3 | D-14 | Alexa device name | 04 |
| 4 | S-04 | Override admin UI no drag/drop | 07 |
| 5 | U-15 | Tooltips em botões action | 06 |
| 6 | X-02 | Orçamento export CSV | – |
| 7 | F-04 | Convênio campos no finalize | 03 |
| 8 | V-08 | Avaliação paga validations específicas | 05 |

**Total P3:** 8 gaps

## Resumo agregado

| Severidade | Quantidade | % do total |
|------------|------------|------------|
| **P0** | 14 | 20% |
| **P1** | 26 | 38% |
| **P2** | 21 | 31% |
| **P3** | 8 | 11% |
| **Total gaps** | **69** | 100% |

## Distribuição por área

| Área | P0 | P1 | P2 | P3 | Total |
|------|----|----|----|----|-------|
| Modal Agendamento | 9 | 6 | 4 | 0 | 19 |
| Finalize | 5 | 3 | 2 | 1 | 11 |
| Prof/Proc/Rooms | 0 | 3 | 4 | 3 | 10 |
| Validações | 0 | 4 | 4 | 1 | 9 |
| UI States | 0 | 4 | 2 | 1 | 7 |
| DnD/State Machine | 0 | 1 | 2 | 1 | 4 |
| Side modules | 0 | 5 | 3 | 1 | 9 |

## Conclusão estratégica

O Modal de Agendamento concentra **9 gaps P0** (47% dos P0 totais), o que prova que o **PROMPT 1** do plano em 4 prompts (próximo doc) deve priorizar fundação de agenda (sala, multi-proc, multi-pay, tipo Consulta/Proc).

Os **5 gaps P0 de Finalize** (cashflow, WA pós, Google review, VPI, payment task) são todos **side effects automatizados** — caem no **PROMPT 3**.

P1 está distribuído entre todas as áreas e exige sequência de 2-3 ondas pós-P0.

P2/P3 podem ser feitos em backlog contínuo · não bloqueiam cutover.
