# scripts/

Tooling administrativo · todos rodam via Node nativo (sem dep CLI Supabase).

## `apply-migration.mjs`

Aplica uma migration arbitrária em prod via Management API.

```bash
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs db/migrations/<file>.sql

# rollback (aplica .down.sql correspondente)
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-migration.mjs db/migrations/<file>.sql --down
```

Não há state-table de "migrations aplicadas". Apply é idempotente quando o SQL é (`CREATE OR REPLACE`, `CREATE INDEX IF NOT EXISTS`, etc.) — mas DDL como `ALTER TABLE ADD COLUMN` quebra na 2ª execução. Sempre cheque com sanity antes.

Após apply que adicione RPC/coluna, regenere types:
```bash
SUPABASE_ACCESS_TOKEN=sbp_... node scripts/generate-types.mjs
```

## `generate-types.mjs`

Regenera `packages/supabase/src/types.ts` via Management API. Usado também como `pnpm db:types`.

## Convenções de migrations

Arquivos em `db/migrations/` seguem `YYYYmmddNNNNNN_clinicai_v2_<slug>.sql` + `.down.sql`. Numeração é **sequencial** dentro do dia (`NNNNNN`).

⚠️ **Colisões conhecidas em main** (não-bloqueantes, files com filenames distintos):
- `20260800000072_*` — `appointment_change_status` (Camada 8a) + `flipbook_access_grants` (Flipbook)
- `20260800000082_*` — `orcamento_followup` (Camada 10a) + `fix_b2b_voucher_to_lead_bridge`
- `20260800000083_*` — `anatomy_quiz_dispatch_mark` (Camada 10b) + `fix_wa_outbox_fetch_pending_l_data`

Ferramentas que ordenam por nome podem aplicar em ordem inesperada. Apply manual via `apply-migration.mjs` é seguro (1 arquivo de cada vez).

**Pra evitar futuras colisões**: antes de criar um novo número, rode `ls db/migrations/ | grep <num>` pra confirmar livre.
