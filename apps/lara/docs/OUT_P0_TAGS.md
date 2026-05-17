# OUT_P0_TAGS — Tags livres pausadas

**Status:** OUT desta release · `CRM_FUNCTIONALITY_MULTI_AGENT` Lote 2 (2026-05-17)
**Owner da decisão:** Alden (move pra IN quando audit SQL liberar)

## Por que está OUT

A coluna `public.leads.tags` (text[]) foi removida em produção durante
`REFACTOR_LEAD_MODEL` (2026-05-05). Os métodos que referenciavam essa coluna
ficaram marcados `@deprecated` mas continuavam tentando ler/escrever, falhando
**silenciosamente** (Supabase retorna erro mas os callers descartavam):

- `LeadRepository.addTags(leadId, tags)`
- `LeadRepository.removeTags(leadId, tags)`
- `LeadRepository.toggleTag(leadId, tag)`

Resultado: UI mostrava "tag adicionada" mas o set persistido era vazio · pills
operacionais começaram a usar `wa_conversations_operational_view` (canônico).

## O que foi feito no Lote 2 P0.2

1. **UI removida:**
   - `LeadTagsPanel.tsx` (em `/leads/[id]`) — bloco "Tags" já estava
     placeholder desde 2026-05-05 · agora os imports e handlers órfãos foram
     limpos. Painel mantém os controles de funnel/phase/temperature.
   - `LeadsClient.tsx` (em `/leads` e `/crm/leads`) — bulk-action-bar nunca
     teve botão de "tags em lote" (já estava OUT no design original do BLOCO
     3.4B). Confirmado · zero entry-point UI restante.
   - `bulk-modals.tsx` e `bulk-action-bar.tsx` — comments atualizados pra
     apontar pra esta doc.

2. **Backend bloqueado defensivamente:**
   - `LeadRepository.addTags/removeTags/toggleTag` agora **lançam** erro
     `TAGS_NOT_SUPPORTED · pending audit · ver doc OUT_P0_TAGS` em vez de
     falhar silenciosamente.
   - Server actions `addLeadTagsAction` e `removeLeadTagsAction` retornam
     `{ ok: false, error: 'TAGS_NOT_SUPPORTED · pending audit · ver doc OUT_P0_TAGS' }`
     sem chamar o repo. Assinatura preservada pra não quebrar imports antigos
     que ainda possam existir.

3. **`transbordarLeadAction` simplificada:** removida a chamada a
   `addTags(['transbordo_humano'])`. Sinal de transbordo continua via
   `wa_conversations.status='dra'` (canônico desde 2026-05-05). Sem regressão
   funcional · view operacional já não dependia da tag.

## O que precisa pra mover pra IN

1. **Audit SQL completo:** confirmar se `leads.tags` ainda existe em alguma
   réplica, se há tabela `lead_tags` órfã, e qual o destino canônico:
   - **Opção A:** restaurar `ADD COLUMN leads.tags text[] DEFAULT '{}'`.
   - **Opção B:** criar `conversation_tags(conversation_id, tag)` normalizado
     (mais flexível · permite tags por conversa em vez de por lead).
   - **Opção C:** tabela `lead_tags(lead_id, tag)` clássica.

2. **Migration de schema** (clinic-dashboard repo · `supabase/migrations/`)
   seguindo o `reference_security_checklist.md` (clinic_id literal proibido,
   RLS, GRANT versionado).

3. **Decisão UX:** se vai voltar a UI livre de tags ou usar um vocabulário
   controlado (tag enum). Hoje queixas faciais já têm vocabulário fechado em
   outra coluna · espelhar esse padrão é uma opção.

4. **Restore do código:**
   - Remover throws em `LeadRepository.{addTags,removeTags,toggleTag}` e
     reimplementar contra o schema escolhido.
   - Restaurar `addLeadTagsAction`/`removeLeadTagsAction` chamando o repo.
   - Re-adicionar UI no `LeadTagsPanel.tsx` (bloco já comentado pra facilitar
     restore) + opcional bulk modal.
   - Re-adicionar `tag transbordo_humano` em `transbordarLeadAction` se ainda
     fizer sentido (today: redundante com `wa_conversations.status='dra'`).

## Quem pode mover pra IN

Alden. Decisão Banco-First (REFACTOR_LEAD_MODEL pattern) · audit SQL +
escolha de schema antes de qualquer linha de TS.

## Referências cruzadas

- `packages/repositories/src/lead.repository.ts` — métodos com throw + jsdoc
  `@deprecated`.
- `apps/lara/src/app/(authed)/leads/actions.ts` — `addLeadTagsAction` e
  `removeLeadTagsAction` retornam `TAGS_NOT_SUPPORTED`.
- `apps/lara/src/app/(authed)/leads/[id]/LeadTagsPanel.tsx` — bloco "Tags"
  comentado pra facilitar restore.
- `apps/lara/src/app/(authed)/leads/_components/bulk-{action-bar,modals}.tsx`
  — comments atualizados.
- `docs/crm-refactor/01-repository-inventory.md` — inventário original que
  marcou os métodos como deprecated.
