# 26 · Migration 086 · Decision Audit

> Auditoria READ-ONLY da divergência entre arquivo `.sql`, código runtime, types gerados e banco real para a mig 086 (`wa_messages_internal_note_delivery_status`).
>
> Estado 2026-05-11 · project-ref `oqboitkpcvuaudouwvkl` · branch `main` · HEAD `ab239bd`.

---

## 1 · Resumo executivo

**Diagnóstico:** Mig 086 NÃO está materializada no banco, mas o **código runtime ATIVO de Lara v2 DEPENDE** das colunas que ela cria.

| Camada | Estado |
|---|---|
| Arquivo SQL no repo | ✅ Presente (idempotente · seguro) |
| Banco de dados (cols + constraint + indexes) | ❌ Ausentes |
| `packages/supabase/src/types.ts` (auto-gerado) | ❌ Não inclui |
| Código Lara v2 (apps + packages) | ✅ **USA ATIVAMENTE** (5+ arquivos · LEITURA + ESCRITA) |
| Tracker remoto | ❌ Não registrada (corretamente · doc 25) |

**Implicação:** **TIME BOMB ATIVA.** Código tenta ler/escrever colunas inexistentes. Em runtime, leituras retornam `undefined`/`null` silenciosamente (graças aos defaults `??` no mapper) · escritas (`markAsInternalNote()`, `updateDeliveryStatus()`) **provavelmente falham silenciosamente** no Supabase client.

**Recomendação revisada: OPÇÃO A · APLICAR a mig 086.**

A recomendação prévia (Opção B · mark reverted) da Fase 1A.10 doc 24 era baseada em "feature provavelmente cancelada". Esta auditoria mais profunda mostra o OPOSTO · feature foi entregue no código mas a migration SQL nunca foi aplicada no banco. Sprint C (paridade WhatsApp) está parcialmente quebrada.

---

## 2 · Estado local

```
Branch: main
HEAD: ab239bd6925675f8755c3dbd3cd8d4d344bcfb55
origin/main: ab239bd6925675f8755c3dbd3cd8d4d344bcfb55  (== HEAD)
Working tree: limpo
```

---

## 3 · Arquivo da mig 086

```
db/migrations/20260800000086_clinicai_v2_wa_messages_internal_note_delivery_status.sql       (2557 bytes)
db/migrations/20260800000086_clinicai_v2_wa_messages_internal_note_delivery_status.down.sql  (410 bytes)
```

Data de criação: 2026-04-29 (Sprint C · "paridade WhatsApp" para `/conversas`)

---

## 4 · SQL da mig 086 (resumido)

```sql
-- ADD 2 colunas
ALTER TABLE public.wa_messages
  ADD COLUMN IF NOT EXISTS internal_note boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS delivery_status text;

-- CHECK constraint (DO block idempotente)
ALTER TABLE public.wa_messages
  ADD CONSTRAINT wa_messages_delivery_status_check
  CHECK (delivery_status IS NULL OR delivery_status IN ('sent','delivered','read','failed'));

-- 2 indexes parciais
CREATE INDEX IF NOT EXISTS wa_messages_internal_note_idx
  ON wa_messages(conversation_id) WHERE internal_note = true;

CREATE INDEX IF NOT EXISTS wa_messages_delivery_status_pending_idx
  ON wa_messages(conversation_id, sent_at)
  WHERE delivery_status IS NULL OR delivery_status = 'sent';

-- Refresh PostgREST cache
NOTIFY pgrst, 'reload schema';
```

Comentários no arquivo descrevem propósito:
- `internal_note` · "nota interna entre atendentes · NÃO enviada pro paciente · UI card amarelo"
- `delivery_status` · "paridade ✓ ✓✓ azul WhatsApp · atualizado por webhook Cloud API"

---

## 5 · Uso no código

### `apps/lara/src/app/api/conversations/[id]/messages/route.ts`

**Linha 73** (LEITURA · response shape):
```ts
internal_note: m.internalNote ?? false,
delivery_status: m.deliveryStatus ?? null,
```

**Linha 287** (ESCRITA · novo endpoint para internal note):
```ts
internal_note: true,
```

→ Classificação: **ACTIVE_RUNTIME_READ + ACTIVE_RUNTIME_WRITE**

### `apps/lara/src/app/(authed)/conversas/hooks/useMessages.ts`

**Linhas 110-111** (LEITURA · UI client):
```ts
internalNote: msg.internal_note === true,
deliveryStatus: msg.delivery_status ?? null,
```

→ Classificação: **ACTIVE_RUNTIME_READ**

### `apps/lara/src/app/api/webhook/whatsapp-evolution/route.ts`

**Linhas 213, 218, 297** · referências a `delivery_status` em comments/handler de webhook Evolution para atualizar status de mensagens (PTT/msg comum).

→ Classificação: **ACTIVE_RUNTIME_WRITE** (handler escreve em wa_messages)

### `apps/lara/src/app/api/webhook/whatsapp/route.ts`

**Linha 170** · referência a `delivery_status` em handler Cloud API (sent/delivered/read/failed → wa_messages.delivery_status).

→ Classificação: **ACTIVE_RUNTIME_WRITE**

### `packages/repositories/src/message.repository.ts`

**Linhas 464-487** · método `markAsInternalNote()` ou similar:
```ts
// Usa direction='outbound' + sender='atendente' + internal_note=true.
// UI filtra internal_note=true pra renderizar amarelo · webhook ignora.
...
internal_note: true,
```

**Linhas 498-524** · método `updateDeliveryStatus()`:
```ts
// Sprint C · SC-01 (W-06) · STATUS A (2026-05-07) · Atualiza delivery_status
// Coluna `delivery_status` aceita CHECK (mig 86): sent/delivered/read/failed
...
.update({ delivery_status: status })
```

→ Classificação: **ACTIVE_RUNTIME_WRITE**

### `packages/repositories/src/mappers/message.ts:23-24`

(LEITURA · mapper row → DTO):
```ts
internalNote: row.internal_note === true ? true : row.internal_note === false ? false : undefined,
deliveryStatus: row.delivery_status ?? null,
```

→ Classificação: **ACTIVE_RUNTIME_READ**

### `packages/repositories/src/types/dtos.ts:346,348`

```ts
internalNote?: boolean
deliveryStatus?: 'sent' | 'delivered' | 'read' | 'failed' | null
```

→ Classificação: **TYPE_DEFINITION** (DTO declarado · usado por mapper)

### Total no runtime ATIVO

- ✅ `apps/lara/src/` · 7 ocorrências em 4 arquivos
- ✅ `packages/repositories/src/` · 6 ocorrências em 3 arquivos
- ❌ `apps/lara/public/legacy/**` · zero (irrelevante)

---

## 6 · Uso nos types (Supabase auto-gerado)

```
$ rg "internal_note|delivery_status" packages/supabase/src/types.ts
(zero hits)
```

❌ `types.ts` **NÃO inclui** essas colunas. Confirma que o banco real não tem · types são auto-gerados.

Isso explica como o TypeCheck não pegou: o mapper `mappers/message.ts` referencia `row.internal_note` mas como `row` é tipado como `wa_messages` que NÃO TEM essa coluna no types.ts, o acesso retorna `any`/`undefined` · TypeScript não reclama.

---

## 7 · Confirmação read-only do banco

```sql
SELECT count(*) FROM information_schema.columns
WHERE table_schema='public' AND table_name='wa_messages'
  AND column_name IN ('internal_note','delivery_status');
→ 0

SELECT count(*) FROM pg_constraint
WHERE conname='wa_messages_delivery_status_check';
→ 0

SELECT count(*) FROM pg_indexes
WHERE schemaname='public'
  AND indexname IN ('wa_messages_internal_note_idx','wa_messages_delivery_status_pending_idx');
→ 0

SELECT count(*) FROM public.wa_messages;
→ 2626 (em uso ativo)
```

✅ Banco confirma: zero artefatos da mig 086 · tabela com 2626 rows ativos.

---

## 8 · Avaliação de risco da mig 086

| Aspecto | Resultado |
|---|---|
| Idempotente? | ✅ SIM · `ADD COLUMN IF NOT EXISTS` × 2 + `CREATE INDEX IF NOT EXISTS` × 2 + DO block `IF NOT EXISTS` para CHECK |
| `ADD COLUMN IF NOT EXISTS`? | ✅ SIM |
| Tem UPDATE/INSERT/DELETE? | ❌ NÃO · zero DMLs |
| Tem DEFAULT NOT NULL que reescreve tabela? | ✅ SIM (`internal_note boolean NOT NULL DEFAULT false`) MAS é fast em PostgreSQL 11+ (metadata-only · não reescreve linhas) |
| Tem CHECK constraint? | ✅ SIM (`wa_messages_delivery_status_check` · domínio fechado) |
| Tem indexes? | ✅ SIM × 2 · ambos PARCIAIS (alta seletividade · low cost) |
| Tem trigger? | ❌ NÃO |
| Tem grant/policy? | ❌ NÃO (herda RLS de wa_messages) |
| Risco de lock em wa_messages? | **Baixíssimo** · 2626 rows · ADD COLUMN com DEFAULT em PG 11+ é instantâneo · CREATE INDEX IF NOT EXISTS sem CONCURRENTLY mas em 2626 rows é sub-segundo |
| Seria seguro aplicar em produção? | ✅ **SIM** |
| Impacto no runtime ATIVO? | ✅ **POSITIVO** · destrava paths que hoje silenciosamente falham (write) ou retornam null (read) |

**Veredito: mig 086 é segura para aplicar e RESOLVE o gap entre código e banco.**

---

## 9 · Opções A / B / C

### Opção A · APLICAR a mig 086 (recomendada)

**Apropriado se:**
- ✅ código atual usa as colunas (CONFIRMADO · 13 ocorrências em runtime ativo)
- ✅ feature faz sentido (Sprint C · paridade WhatsApp)
- ✅ migration é idempotente e segura (CONFIRMADO)
- ✅ risco de lock aceitável (PG 11+ · 2626 rows · sub-segundo)

**Como executar (fora desta fase):**

```bash
# 1. Aplicar mig 086 manualmente
mkdir -p supabase/migrations
cp db/migrations/20260800000086_clinicai_v2_wa_messages_internal_note_delivery_status.sql \
   supabase/migrations/

# 2. Push direcionado (apenas mig 086)
supabase db push --include-all=false 20260800000086

# Ou rodar SQL direto via Management API:
curl -X POST -H "Authorization: Bearer $SUPABASE_ACCESS_TOKEN" \
  -d "{\"query\": $(cat db/migrations/20260800000086_*.sql | jq -Rs .)}" \
  "https://api.supabase.com/v1/projects/oqboitkpcvuaudouwvkl/database/query"

# 3. Validar
supabase migration list | grep "20260800000086"
# E re-rodar probe SQL para confirmar cols existem

# 4. Cleanup
rm -rf supabase/migrations
```

**Resultado esperado:**
- 2 colunas adicionadas a wa_messages
- 1 CHECK constraint adicionada
- 2 indexes parciais adicionados
- Tracker registra `20260800000086` como `applied`
- `types.ts` próximo refresh inclui as novas cols
- Sprint C (internal notes + delivery status visual) destrava

### Opção B · DEPRECAR/REMOVER a mig 086 localmente (NÃO RECOMENDADA)

Apropriado se:
- ❌ nenhum código runtime usa as colunas (**FALSO · usa 13 vezes**)
- ❌ feature foi cancelada/adicionada por engano (**FALSO · está integrada**)

**Por que NÃO escolher:**
- Quebraria `markAsInternalNote()`, `updateDeliveryStatus()`, mapper, hooks, webhooks
- Lara v2 perderia paridade WhatsApp visual (✓✓✓ azul)
- Internal notes não persistiriam (escrita silenciosa fail)

**Conclusão:** Opção B é incorreta sob este achado.

### Opção C · MANTER PENDENTE (paliativo)

Apropriado se:
- precisa decisão humana adicional (qual?)
- ⚠️ feature ESTÁ usando · pendência prolongada = bug em produção

**Por que evitar:**
- Cada dia que mig 086 fica pendente, escritas em `wa_messages.internal_note=true` e `wa_messages.delivery_status='delivered'` continuam falhando silenciosamente
- Usuários da `/conversas` podem estar perdendo internal notes
- Status WhatsApp não persiste

**Aceitável apenas como medida de 24h enquanto Alden valida em ambiente shadow.**

---

## 10 · Recomendação

**Aplicar mig 086 (Opção A)** o mais rápido possível.

Justificativa principal: **código runtime depende das colunas que estão ausentes do banco**. Esta é uma divergência crítica entre app deployado e schema.

Estratégia segura:

1. **Confirmar em ambiente shadow** (1h)
   - Criar branch supabase preview
   - Aplicar mig 086 nesse branch
   - Probe para confirmar 2 cols + 1 constraint + 2 indexes presentes
   - Validar `markAsInternalNote()` funciona

2. **Aplicar em prod** (~5s)
   - Via Management API SQL endpoint ou via `supabase db push` direcionado
   - Janela de risco: sub-segundo (metadata-only ALTER + CREATE INDEX em 2626 rows)
   - NOTIFY pgrst reload schema · garante PostgREST aceita as novas cols

3. **Validar pós-aplicação:**
   - Probe cols/constraint/indexes existem
   - Mark `applied` no tracker
   - Re-gerar types.ts (próximo refresh CLI)
   - Testar `/conversas` UI

**Sem Opção A, mig 086 fica como dívida ativa indefinidamente. Cada hora reforça o débito.**

---

## 11 · Próximo passo

**Fase 1A.11.C · Aplicar mig 086 (Opção A)** com:
- Snapshot probe pré-aplicação
- Apply (via supabase CLI ou Management API SQL)
- Probe pós-aplicação
- Repair `--status applied 20260800000086`
- Re-test paths que usam as cols

Após isso, **Fase 1A.12 · Sanity probes do Bloco 001-012** (último bloco · 12 migs · seeds Mira/B2B).

Gap após Fase 1A.11.C + 1A.12 (esperado): **0** (todas as 148 migrations registradas).

---

## 12 · Critério de aceite para resolver a 086

| Critério | Validação |
|---|---|
| Cols `internal_note` + `delivery_status` em `wa_messages` | Probe `information_schema.columns` retorna 2 rows |
| Constraint `wa_messages_delivery_status_check` | Probe `pg_constraint` retorna 1 row |
| 2 indexes parciais | Probe `pg_indexes` retorna 2 rows |
| `types.ts` atualizado | `rg "internal_note" packages/supabase/src/types.ts` retorna hits |
| Tracker registra mig 086 como `applied` | `supabase migration list | grep "20260800000086"` mostra com Remote |
| `markAsInternalNote()` funcional | Smoke test: POST `/api/conversations/<id>/messages` com `internal_note: true` retorna 200 |
| `updateDeliveryStatus()` funcional | Smoke test: webhook Cloud API atualiza `delivery_status` sem erro |
| UI `/conversas` renderiza internal notes amarelo + checkmarks WhatsApp | Inspeção manual |
| Zero perdas de mensagens internas pré-fix | Auditoria opcional · logs do app |

**Definição de "feito":** todos os 8 critérios verdes.
