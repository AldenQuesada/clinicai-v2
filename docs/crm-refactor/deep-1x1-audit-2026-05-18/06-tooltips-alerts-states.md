# 06 · Tooltips · Alerts · UI States

> READ-ONLY · doc-only · 2026-05-18

## A. Componentes UI base

### Legacy (`clinic-dashboard`)
| Componente | Path | Função |
|------------|------|--------|
| `_showToast(title, message, type)` | `js/api.js:1934` | toast (4 types: error/warn/info/success) · 3500ms duração |
| `_showInlineAlert(title, items, parentId)` | `js/agenda-smart.js:55-75` | sticky red bg `#FEF2F2` · text `#991B1B` |
| `showValidationErrors(errs, title)` | `js/agenda-validation.js:570` | modal overlay vermelho |
| `confirm(...)` | `js/utils/modal.js:165` | replace native confirm |
| `alert(...)` | `js/utils/modal.js:157` | replace native alert |
| `_renderNotificationBell()` | `js/api.js:1967` (& `agenda-notifications.js:71`) | sino com contagem |
| Modal system | `css/modal-system.css` + inline HTML (DOM-presente, `display:none`) | – |
| Day alerts | `js/agenda-day-panel.js:47` `renderDayAlerts()` | alertas do dia |

### v2 (`clinicai-v2`)
| Componente | Path | Função |
|------------|------|--------|
| `useToast()` hook | `packages/ui/src/components/toast.tsx:37-54` | `success/error/warning/info` · auto-dismiss 4 s |
| `toast.fromResult(r, { successMsg, errorMessages })` | `toast.tsx:47-54` | mapeia Result<T> code → mensagem |
| `<EmptyState variant="leads|patients|orcamentos|generic" />` | `packages/ui/src/components/empty-state.tsx:250-355` | Cormorant Garamond italic + SVG + CTA |
| `<Skeleton variant="list|card|kpi|text-line" count={N} />` | `packages/ui/src/components/skeleton.tsx` | shimmer-luxury 1.8 s |
| `<Modal open onOpenChange dismissable />` | `packages/ui/src/components/modal.tsx:33-41` | ESC se dismissable |
| Helpers | `ok()`, `fail()`, `zodFail()`, `fromResult()` em `apps/lara/src/app/crm/_actions/shared.ts:40-56` | Result discriminated union |

---

## B. Matriz por tela

### B.1 /crm/agenda (day/week/month)

| State | Legacy | v2 |
|-------|--------|----|
| Empty list | sem markup dedicado · container vazio | `<EmptyState/>` |
| Loading | sync localStorage · sem skeleton | `<Skeleton variant="list" count={10}/>` |
| Error | `_showInlineAlert` sticky | toast via `fromResult` |
| Success move | toast `"Movido"` legacy | `router.refresh()` + sem toast extra (silent ok) |
| Conflict drag | `"Conflito: profissional X às HH:MM"` legacy via showDragConfirm `api.js:1173` | `"Conflito · {subjectName} já ocupa esse horário"` (`day-view.tsx:134`) · `"Conflito de horário · escolha outro slot"` (L149) · fallback `"Falha ao mover · {error}"` (L157) |
| Tooltip card | implícito title legacy | `day-view.tsx:291-293` `${startTime}-${endTime} · ${statusLabel}${draggable ? '' : ' · não arrastável'}` |
| Badge status | cor por status (`agenda-smart.constants.js STATUS_COLORS`) | left-border color por profissional + status pill |
| Alert bell | `_renderNotificationBell` `api.js:1967` · 13min lookup `renderDayAlerts` | – (a confirmar em topbar v2) |
| Day panel alerts | `renderDayAlerts()` `agenda-day-panel.js:47` | – |

### B.2 /crm/agenda/novo (booking wizard)

| State | Legacy | v2 |
|-------|--------|----|
| Modal open | `openApptModal()` `agenda-modal.js:95` | `/crm/agenda/novo` page |
| Step indicator | tabs em modal legacy | step-by-step wizard `_form.tsx` |
| Field error | inline + `_showInlineAlert` | form errors via React Hook Form / Zod |
| Conflict info | dialog confirm `showDragConfirm` | banner em step 4 `"{N} appointment(s) na mesma sala"` (`_form.tsx:996-997`) |
| Multi-proc warning | modal dialog L928 `"O tempo pode nao ser suficiente para todos os procedimentos. Escolha uma opção para continuar:"` | **AUSENTE** |
| Loading submit | spinner | busy button `"Salvando…"` |
| Success toast | `"Nova Consulta", "Agendamento criado", "success"` | `"Agendamento criado"` toast |
| Confirm cancel | `confirm("Você tem alterações...")` | `<Modal>` dismissable=false durante busy |
| Draft autosave | `_restoreDraft` L446 → ` (rascunho salvo) ` no header | **AUSENTE** |

### B.3 /crm/agenda/[id] (detail · v2 only)

| State | v2 path |
|-------|---------|
| Loading | skeleton header + clinical panel |
| Error | toast |
| Tooltip botões action | text-only · subtítulos do step |
| Alert hard gate | `_actions-bar.tsx:966-982` `"Finalização bloqueada · gate clínico..."` (red bg) |
| Banner payment | `_actions-bar.tsx:1024-1064` `"Pagamento {pendente|parcial} · confirme..."` (amber bg) |
| Banner lead-lost | `_actions-bar.tsx:686-694` (amber) |
| Confirm cancel | `<Modal>` com motivo textarea required |
| Override admin | `_actions-bar.tsx:985-1012` `"Finalizar mesmo assim (override admin)..."` |
| Permission denied | `_actions-bar.tsx:1015-1018` `"Você não tem permissão para override..."` |
| Anamnesis tab | painel `_clinical-panel.tsx` 4 estados ("Não preenchida"/"Em rascunho"/"Completa"/"Arquivada") |
| Consent tab | TCLE modal `_clinical-panel.tsx:408-527` + read-only `"✓ Já registrado..."` |

### B.4 /crm/leads

| State | Legacy | v2 |
|-------|--------|----|
| Empty | "Nenhum lead encontrado" | `<EmptyState variant="leads" title="Sem leads ainda" message="..."/>` |
| Loading | n/a | `<Skeleton variant="list" count={10}/>` |
| Error | toast/alert | toast |
| CRUD toast | `"Lead criado"` / `"Lead atualizado"` | igual com Result<T> mapping |
| Modal create/edit | `js/components/lead-modal.js` (community 28) | forms in-page (não modal) |
| Temperatura badge | implícito | badge component |

### B.5 /crm/pacientes + /crm/pacientes/[id]

| State | Legacy | v2 |
|-------|--------|----|
| Empty | "Nenhum paciente encontrado" | EmptyState |
| Loading | – | Skeleton |
| Phase badge | tags | badge phase + lifecycle |
| Patient detail tabs | tabs múltiplas (anamnese, histórico, fotos, financeiro) | `/crm/pacientes/[id]` parcial · tabs em desenvolvimento |
| Archive button | `archivePatient()` toast | `lifecycle_status='arquivado'` action |

### B.6 /crm/orcamentos + /crm/perdidos

| State | Legacy | v2 |
|-------|--------|----|
| Empty | "Nenhum orçamento encontrado" | EmptyState |
| Loading | – | Skeleton |
| CRUD | modais inline | inline forms |
| Status badge | colors por status | badge |
| Bulk/Export CSV | `exportPatientsCsvAction()` em pacientes (community 75) | em desenvolvimento |

### B.7 Topbar + Alert Bell

| State | Legacy | v2 |
|-------|--------|----|
| Bell rendering | `_renderNotificationBell()` `api.js:1967` + `agenda-notifications.js:71` | a confirmar (não localizado via grafo direto) |
| Click bell | abre panel notificações | – |
| Day alerts panel | `agenda-day-panel.js` `renderDayAlerts()` L47 + `openFinalizarDiaModal()` L255 | – |

### B.8 Mesa Operacional (legacy `js/mesa-operacional*.js`)

| Aspecto | Legacy | v2 |
|---------|--------|----|
| Existência | sim · módulo dedicado | **AUSENTE** (não migrado) |
| Cards | injetáveis, retornos, secretaria | – |

### B.9 Clinical Panel (intra-consult v2 only)

| State | v2 |
|-------|-----|
| Anamnesis status labels | "Não preenchida" / "Em rascunho" / "Completa" / "Arquivada" |
| Anamnesis button | "Preencher anamnese" / "Editar anamnese" (idle) · "Salvando…" (busy) |
| Save buttons | "Salvar rascunho" / "Salvar e marcar completa" |
| Consent button | "Registrar consentimento" → "Registrando…" → "Fechar" |
| Consent read-only | `"✓ Já registrado para este appointment · termo {version}."` |
| Gate badges | `"Gate clínico · OK"` / `"Gate clínico · Atenção"` |

---

## C. Tooltips/copy verbatim consolidados (v2)

- `_clinical-panel.tsx:114-121` — `"Antes de finalizar, preencha a anamnese (mín. queixa + sem contraindicações) e registre o consentimento informado. Decisão 2I: a finalização ainda é permitida com gate=atenção (warning), mas a Dra. deve confirmar a ciência."`
- `_actions-bar.tsx:1083-1091` — `"Sem lead vinculado · finalizar só fecha o appointment."` / `"Lead perdido? Use a ação dedicada no card do lead · não nasce de finalização de consulta."`
- `_actions-bar.tsx:1141` — `"Registrado no audit · ficará visível no histórico do paciente. Ex: primeira consulta · parceria · indicação · ajuste interno · cortesia institucional"`
- `_actions-bar.tsx:1153-1157` — `"Valor cobrado fixado em R$ 0,00. O motivo será prefixado com [Cortesia] nas notas do appointment para auditoria futura."`
- `_actions-bar.tsx:1054-1061` — `"Confirmo que a cobrança foi realizada separadamente · ciente que o pagamento ficará registrado como '{paymentStatus}' no histórico."`
- consent legal note `_clinical-panel.tsx:475-477` — `"Termo simplificado · registro operacional · o termo formal completo pode ser enviado para assinatura externa via fluxo legal_doc."`

## D. Tooltips/copy verbatim consolidados (Legacy)

- `agenda-smart.finalize.js:225` — `"Avaliacao Paga — confirme o pagamento antes de finalizar"`
- L681-684 — `"Cobrar consulta antes de finalizar"` + `"Consulta paga em aberto: R$ ${fmtBRL(consultaAberta)}. Adicione um procedimento para descontar ou registre o pagamento abaixo."`
- L554-555 — `"Cortesia: procedimento registrado, mas so vira Paciente quando pagar."`
- L873-875 — `"Saldo: ${fmtBRL(tot-pag)}"` / `"Pagamento completo"`
- L492-494 toast — `"Ja enviado"` + `"Consentimento enviado recentemente (aguarde 10min pra reenviar)"`
- L657-661 — `"Total Procedimentos: R$ ${fmtBRL(total)} - Consulta R$ ${fmtBRL(consultaAberta)} (cortesia ao fechar procedimento) = Total a cobrar: R$ ${fmtBRL(totalFinal)}"`
- L928 — `"O tempo pode nao ser suficiente para todos os procedimentos. Escolha uma opção para continuar:"`
- L999 WA double-check — `"[Paciente] tem [N] procedimentos ([nomes]) agendados em 1 hora.\nPor favor revise e confirme se o tempo e suficiente."`

---

## E. Gap list UI/UX

| ID | Gap | Severidade |
|----|-----|------------|
| G06-UI-01 | Mesa Operacional ausente em v2 | P1 |
| G06-UI-02 | Notification bell ausente em v2 (não localizado) | P1 |
| G06-UI-03 | Multi-proc warning ausente em v2 | P0 |
| G06-UI-04 | Draft autosave ausente em v2 | P2 |
| G06-UI-05 | Patient detail tabs incompletas em v2 (anamnese parcial, histórico ausente, fotos ausente, financeiro ausente) | P1 |
| G06-UI-06 | Orçamento CSV export ausente em v2 | P3 |
| G06-UI-07 | Conflict message v2 sem nome do conflitante | P1 |
| G06-UI-08 | Tooltips em botões action de detail | P3 |
| G06-UI-09 | Day alerts panel ausente em v2 | P1 |
| G06-UI-10 | Recuperação dry-run UI ausente em v2 (a confirmar) | P2 |
| G06-UI-11 | Toast `"Já enviado"` consent rate-limit ausente em v2 | P2 |
| G06-UI-12 | Hard gate explanation: ✅ melhor em v2 (sem regressão) | – |
| G06-UI-13 | Empty/Skeleton variants: ✅ melhor em v2 | – |
| G06-UI-14 | Confirm with motivo required: ✅ melhor em v2 | – |

## Bottom 10 UI gaps

1. **Multi-proc warning** (P0)
2. **Mesa Operacional** removido (P1)
3. **Notification bell** ausente em v2 (P1)
4. **Patient detail tabs** incompletas (P1)
5. **Conflict message** sem nome (P1)
6. **Day alerts panel** ausente (P1)
7. **Draft autosave** removido (P2)
8. **Toast já enviado consent** (P2)
9. **Recuperação dry-run UI** (P2)
10. **Orçamento export CSV** (P3)

## Arquivos auditados

- Grafo legacy: api.js (4/16), agenda-smart.js (27), agenda-validation.js (211), agenda-smart.finalize.js (57), agenda-day-panel.js (279), agenda-notifications.js (257), components/lead-modal.js (28)
- Grafo v2: appointment.actions.ts (11), appointment-state.ts (67), day-view.tsx (134), week-calendar.tsx (134), _drag-utils.ts (134), _actions-bar.tsx, _clinical-panel.tsx
- packages/ui: empty-state.tsx, skeleton.tsx, modal.tsx, toast.tsx
