# Pendência arquitetural: tabela `clinic_members` (D5 da auditoria Camada 2)

**Data:** 2026-04-28
**Origem:** auditoria pós-Camada 2 do roadmap CRM v2
**Status:** 📋 Documentado · pendente trabalho futuro
**Prioridade:** Alta (bloqueia multi-tenant real)

## O problema

O `custom_access_token_hook()` (mig 800-05) tenta resolver `clinic_id` do user em duas etapas:

```sql
-- Etapa 1: tenta clinic_members (tabela canonical multi-tenant)
SELECT clinic_id, role FROM public.clinic_members
 WHERE user_id = $1 AND active = true
 ORDER BY is_primary DESC NULLS LAST, created_at ASC LIMIT 1;

-- Etapa 2 (fallback): _default_clinic_id() · sempre retorna Mirian
v_clinic_id := public._default_clinic_id();
```

**Problema:** a tabela `clinic_members` **não existe**. Resultado: hoje TODO JWT sempre injeta `clinic_id` da Mirian via fallback. Multi-tenant funcional valida em test cruzado (Camada 2 etapa E provou), mas **na prática só Mirian é resolvida automaticamente**.

## Por que importa

Quando uma 2ª clínica entrar:
1. User dela faz login → `custom_access_token_hook` roda
2. Etapa 1 (clinic_members) falha porque tabela não existe
3. Etapa 2 (`_default_clinic_id`) retorna **Mirian** (errado!)
4. JWT injetado tem `app_metadata.clinic_id = Mirian`
5. RLS aceita esse user como se fosse da Mirian → **vazamento total**

## Solução proposta

### Schema sugerido pra `clinic_members`

```sql
CREATE TABLE public.clinic_members (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  clinic_id   uuid NOT NULL REFERENCES public.clinics(id) ON DELETE CASCADE,
  role        text NOT NULL CHECK (role IN ('owner','admin','receptionist','therapist','viewer')),
  is_primary  boolean NOT NULL DEFAULT false,
  active      boolean NOT NULL DEFAULT true,
  invited_by  uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  joined_at   timestamptz NOT NULL DEFAULT now(),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, clinic_id)
);

-- Índices
CREATE INDEX idx_cm_user_active ON public.clinic_members (user_id) WHERE active = true;
CREATE INDEX idx_cm_clinic ON public.clinic_members (clinic_id);

-- RLS
ALTER TABLE public.clinic_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY cm_self_select ON public.clinic_members
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY cm_owner_manage ON public.clinic_members
  FOR ALL TO authenticated
  USING (clinic_id = app_clinic_id() AND app_role() IN ('owner','admin'))
  WITH CHECK (clinic_id = app_clinic_id() AND app_role() IN ('owner','admin'));
```

### Backfill obrigatório

Antes de ativar:

```sql
-- Espelha rows existentes em profiles
INSERT INTO public.clinic_members (user_id, clinic_id, role, is_primary, active)
SELECT id, clinic_id, role, true, is_active
FROM public.profiles
WHERE clinic_id IS NOT NULL;
```

### Verificação

```sql
-- Hook deve resolver via clinic_members agora
-- Login de user com membership múltipla deve respeitar is_primary
-- User SEM membership ativa deve ter JWT sem clinic_id (failfast quando ligado)
```

## Por que NÃO foi feito agora

Multi-tenant real não é crítico HOJE (single-tenant Mirian). Criar `clinic_members` requer:
- Migration nova
- Backfill cuidadoso (5 users existentes)
- Possível ajuste em `custom_access_token_hook` (já preparado pra ela)
- Possível ajuste em `app_clinic_id()` (não, já lê JWT direto)
- UI nova de admin pra gerenciar membros (Camada 6+)

Trabalho que cabe melhor em **Camada 5 (Server Actions)** ou **Camada nova dedicada (4.5)** quando a 2ª clínica estiver pra entrar.

## Mitigação enquanto não existe

**Camada 2 deixou pronto:**
- `app_clinic_id()` já lê path correto (`app_metadata.clinic_id`)
- Custom Access Token Hook ativado e injetando via `_default_clinic_id` (Mirian fallback)
- Multi-tenant cross-test passou em Camada 2 etapa E (com `app.clinic_id` GUC manual)
- Fallback "primeira clínica" condicionado em `app.tenant_failfast` (default false)

**Pra ativar multi-tenant real:**
1. Criar `clinic_members` (esta pendência)
2. Backfill profiles → clinic_members
3. Validar hook resolve corretamente (login user clínica B → JWT tem clinic_id B)
4. Setar `app.tenant_failfast='true'` em postgresql.conf prod
5. Re-rodar test cruzado da Camada 2 etapa E com user real (não com GUC manual)

## Owner da pendência

Documentado pelo Claude em 2026-04-28 durante auditoria pós-Camada 2.
**Próxima ação:** criar issue no GitHub `clinicai-v2` quando 2ª clínica entrar no roadmap operacional.
