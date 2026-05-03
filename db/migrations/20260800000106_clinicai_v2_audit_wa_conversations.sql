-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Migration 106 · audit log de wa_conversations                            ║
-- ╠══════════════════════════════════════════════════════════════════════════╣
-- ║ Bug 2026-05-03: 59 convs archivadas em mass UPDATE 17:08 UTC sem rastro ║
-- ║ de quem/por que. wa_conversations eh tabela operacional critica · cada  ║
-- ║ status change (active/archived/resolved/closed) precisa ser auditavel.  ║
-- ║                                                                          ║
-- ║ Solucao: audit_wa_conversations + trigger AFTER INSERT/UPDATE/DELETE    ║
-- ║ captura:                                                                 ║
-- ║   - operation + conversation_id + clinic_id                              ║
-- ║   - actor_user_id (auth.uid · null pra service_role)                    ║
-- ║   - actor_role (app_role · null pra service_role)                       ║
-- ║   - db_role (current_user · diferencia service_role/postgres/anon)      ║
-- ║   - audit_reason (current_setting app.audit_reason · setavel pelo       ║
-- ║     caller via SET LOCAL pra rastrear motivo de mass UPDATEs)           ║
-- ║   - changed_fields (array das colunas que mudaram em UPDATE)            ║
-- ║   - old/new status + old/new full row jsonb                              ║
-- ║                                                                          ║
-- ║ Acesso · authenticated SELECT only (owner/admin · multi-tenant scope).  ║
-- ║ Trigger SECURITY DEFINER · trapeia exceptions (auth.uid/app_role/etc).  ║
-- ║                                                                          ║
-- ║ Como usar audit_reason em mass UPDATEs futuros:                          ║
-- ║   BEGIN;                                                                 ║
-- ║     SET LOCAL app.audit_reason = 'cleanup_orfas_pos_mig_91';             ║
-- ║     UPDATE wa_conversations SET status='archived' WHERE ...;             ║
-- ║   COMMIT;                                                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

create table if not exists public.audit_wa_conversations (
  id uuid primary key default gen_random_uuid(),

  audit_at timestamptz not null default now(),
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),

  conversation_id uuid,
  clinic_id uuid,

  actor_user_id uuid,
  actor_role text,
  db_role text not null default current_user,

  audit_reason text,
  changed_fields text[],

  old_status text,
  new_status text,

  old_data jsonb,
  new_data jsonb
);

alter table public.audit_wa_conversations enable row level security;

revoke all on table public.audit_wa_conversations from anon;
revoke all on table public.audit_wa_conversations from authenticated;

grant select on table public.audit_wa_conversations to authenticated;

drop policy if exists audit_wa_conversations_select_admin on public.audit_wa_conversations;

create policy audit_wa_conversations_select_admin
on public.audit_wa_conversations
for select
to authenticated
using (
  clinic_id = public.app_clinic_id()
  and public.app_role() in ('owner', 'admin')
);

create index if not exists idx_audit_wa_conversations_conversation_id
on public.audit_wa_conversations (conversation_id, audit_at desc);

create index if not exists idx_audit_wa_conversations_clinic_at
on public.audit_wa_conversations (clinic_id, audit_at desc);

create index if not exists idx_audit_wa_conversations_operation
on public.audit_wa_conversations (operation, audit_at desc);


create or replace function public._audit_wa_conversations()
returns trigger
language plpgsql
security definer
set search_path to 'public', 'extensions', 'pg_temp'
as $function$
declare
  v_actor_user_id uuid;
  v_actor_role text;
  v_reason text;
  v_changed_fields text[];
begin
  begin
    v_actor_user_id := auth.uid();
  exception when others then
    v_actor_user_id := null;
  end;

  begin
    v_actor_role := public.app_role();
  exception when others then
    v_actor_role := null;
  end;

  begin
    v_reason := nullif(current_setting('app.audit_reason', true), '');
  exception when others then
    v_reason := null;
  end;

  if tg_op = 'UPDATE' then
    select coalesce(array_agg(k order by k), array[]::text[])
    into v_changed_fields
    from (
      select n.key as k
      from jsonb_each(to_jsonb(new)) n
      join jsonb_each(to_jsonb(old)) o
        on o.key = n.key
      where n.value is distinct from o.value
    ) diff;

    if coalesce(array_length(v_changed_fields, 1), 0) = 0 then
      return new;
    end if;

    insert into public.audit_wa_conversations (
      operation,
      conversation_id,
      clinic_id,
      actor_user_id,
      actor_role,
      db_role,
      audit_reason,
      changed_fields,
      old_status,
      new_status,
      old_data,
      new_data
    ) values (
      tg_op,
      new.id,
      new.clinic_id,
      v_actor_user_id,
      v_actor_role,
      current_user,
      v_reason,
      v_changed_fields,
      old.status,
      new.status,
      to_jsonb(old),
      to_jsonb(new)
    );

    return new;
  end if;

  if tg_op = 'INSERT' then
    insert into public.audit_wa_conversations (
      operation,
      conversation_id,
      clinic_id,
      actor_user_id,
      actor_role,
      db_role,
      audit_reason,
      changed_fields,
      old_status,
      new_status,
      old_data,
      new_data
    ) values (
      tg_op,
      new.id,
      new.clinic_id,
      v_actor_user_id,
      v_actor_role,
      current_user,
      v_reason,
      null,
      null,
      new.status,
      null,
      to_jsonb(new)
    );

    return new;
  end if;

  if tg_op = 'DELETE' then
    insert into public.audit_wa_conversations (
      operation,
      conversation_id,
      clinic_id,
      actor_user_id,
      actor_role,
      db_role,
      audit_reason,
      changed_fields,
      old_status,
      new_status,
      old_data,
      new_data
    ) values (
      tg_op,
      old.id,
      old.clinic_id,
      v_actor_user_id,
      v_actor_role,
      current_user,
      v_reason,
      null,
      old.status,
      null,
      to_jsonb(old),
      null
    );

    return old;
  end if;

  return null;
end;
$function$;

drop trigger if exists trg_audit_wa_conversations on public.wa_conversations;

create trigger trg_audit_wa_conversations
after insert or update or delete on public.wa_conversations
for each row
execute function public._audit_wa_conversations();
