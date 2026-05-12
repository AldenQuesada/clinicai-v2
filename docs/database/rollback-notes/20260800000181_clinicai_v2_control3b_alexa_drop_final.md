# Rollback notes · mig 181 · CRM_PHASE_CONTROL.3B Alexa drop final

> Migration: `db/migrations/20260800000181_clinicai_v2_control3b_alexa_drop_final.sql`
> · prepared local (LOCAL · NOT APPLIED até autorização explícita
> CRM_PHASE_CONTROL.3B_APPLY).

## Objetos removidos (quando aplicada)

| Objeto | Tipo | Justificativa |
|---|---|---|
| `public.clinic_alexa_log` | tabela | 0 rows · 0 deps · 0 triggers · 0 policies · RLS on |
| `public.get_alexa_config()` | função | 0 deps · 0 callers via `pg_depend` · grants `authenticated`/`anon` já zerados em mig 179 |
| `public.upsert_alexa_config(text, text, text, text, boolean, text)` | função | idem |

## Objetos preservados (regra fundadora · NÃO TOCAR)

- `public.clinic_alexa_config` (1 row)
- `public.clinic_alexa_devices` (5 rows)
- `public.clinic_rooms.alexa_device_name` (coluna · tabela viva)
- `public.wa_agenda_automations.alexa_message` (coluna · 93 rows)
- `public.wa_agenda_automations.alexa_target` (coluna · 93 rows)

## Como recriar (rollback de emergência)

Nenhum dado operacional foi perdido na migração (log tinha 0 rows · funções
não tinham callers de runtime). Se for necessário restaurar a "casca" para
desfazer apply acidental:

### 1. Recriar `clinic_alexa_log` vazia

```sql
CREATE TABLE IF NOT EXISTS public.clinic_alexa_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id uuid NOT NULL,
  event text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.clinic_alexa_log ENABLE ROW LEVEL SECURITY;
-- (zero policies originais · 0 policies recriadas · tabela permanece inacessível
--  fora de service_role)
```

> A FK saindo de `clinic_alexa_log` (fks_out=1 no audit · provavelmente
> apontava para `public.clinics`) **não é restaurada automaticamente** ·
> revisar o schema histórico em migrations anteriores se precisar do shape
> exato. Como o uso real era inexistente, recriar a casca já é suficiente.

### 2. Recriar wrappers `get_alexa_config()` / `upsert_alexa_config(...)`

Os corpos originais devem ser recuperados de uma migration histórica
anterior à 179 (CONTROL.2 revogou EXECUTE mas não dropou). Se o objetivo
do rollback for **apenas evitar erro 404 RPC**, criar stubs:

```sql
CREATE OR REPLACE FUNCTION public.get_alexa_config()
RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT '{}'::jsonb;
$$;
REVOKE EXECUTE ON FUNCTION public.get_alexa_config() FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.get_alexa_config() TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_alexa_config(
  p_webhook_url text,
  p_reception_device_name text DEFAULT 'Recepcao'::text,
  p_welcome_template text DEFAULT NULL::text,
  p_room_template text DEFAULT NULL::text,
  p_is_active boolean DEFAULT true,
  p_auth_token text DEFAULT NULL::text
) RETURNS jsonb
LANGUAGE sql
SECURITY DEFINER
AS $$
  SELECT jsonb_build_object('rollback_stub', true);
$$;
REVOKE EXECUTE ON FUNCTION public.upsert_alexa_config(text, text, text, text, boolean, text) FROM PUBLIC, authenticated, anon;
GRANT EXECUTE ON FUNCTION public.upsert_alexa_config(text, text, text, text, boolean, text) TO service_role;
```

## Por que não há `.down.sql` automático

A migração é destrutiva sobre objetos órfãos · o rollback **não** restaura
comportamento real (não havia comportamento ativo). Restaurar shells vazios
é responsabilidade humana e raríssimo · documentamos as receitas aqui em
vez de gerar um `.down.sql` que daria falsa sensação de simetria.

## Validação pós-apply esperada

- `clinic_alexa_log_exists_remote`: false
- `get_alexa_config_exists_remote`: false
- `upsert_alexa_config_exists_remote`: false
- `clinic_alexa_config` linhas: **1** (preservada)
- `clinic_alexa_devices` linhas: **5** (preservadas)
- `worker71_off`: true
- `hard_gate_untouched`: true
- `cron_with_provider_call`: 0
- `unsafe_outbox_count`: 0
- `phase_perdido_count`: 0
- `alexa_authenticated_execute_grants`: 0
- `can_continue`: true
