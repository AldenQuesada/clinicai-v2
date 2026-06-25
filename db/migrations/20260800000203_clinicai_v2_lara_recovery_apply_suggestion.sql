-- =============================================================================
-- 20260800000203_clinicai_v2_lara_recovery_apply_suggestion  ·  RECOVERY RADAR · Prompt 4
--
-- RPC de ESCRITA do enriquecimento por IA. A IA (packages/ai/recovery.ts) gera a
-- sugestão; esta RPC persiste APENAS os campos de sugestão, com guards de seguranca.
--
-- Próximo número livre real (última = 202). NÃO cria tabela. NÃO toca scans.
-- NÃO altera 201/202/candidates/persistence. NÃO envia WhatsApp. NÃO promove p/ CRW.
--
-- Guards:
--   · tenant: clinic_id = app_clinic_id()
--   · só atualiza status='open'
--   · NÃO sobrescreve suggested_message já preenchida, salvo p_force=true
--   · atualiza só suggested_message/action, recommended_owner, action_deadline_at, updated_at
--   · NÃO toca status/evidence/failure_type/priority/recovery_score/conversation_id/lead_id
--
-- Metadata de análise (role/risk_flags/confidence/should_contact) NÃO é persistida
-- aqui: a tabela findings não tem coluna metadata (decisão Prompt 3). Fica para 4B
-- se virar requisito. should_contact=false ⇒ chamar com p_suggested_message=NULL.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.lara_recovery_finding_apply_suggestion(
  p_finding_id uuid,
  p_suggested_message text DEFAULT NULL,
  p_suggested_action text DEFAULT NULL,
  p_recommended_owner text DEFAULT NULL,
  p_action_deadline_at timestamptz DEFAULT NULL,
  p_force boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions', 'pg_temp'
AS $function$
declare
  v_clinic uuid := public.app_clinic_id();
  v_status text;
  v_has_suggestion boolean;
  v_updated uuid;
begin
  if v_clinic is null then
    return jsonb_build_object('applied', false, 'reason', 'no_tenant');
  end if;
  -- validacao branda do owner (NULL é permitido)
  if p_recommended_owner is not null
     and p_recommended_owner not in ('secretaria','closer','mirian','dr_alden','humano_obrigatorio') then
    return jsonb_build_object('applied', false, 'reason', 'invalid_owner');
  end if;

  -- carrega estado atual (tenant-safe) · "já analisado" = message OU action preenchidos
  select status, (suggested_message is not null or suggested_action is not null)
  into v_status, v_has_suggestion
  from public.lara_recovery_findings
  where id = p_finding_id and clinic_id = v_clinic;

  if v_status is null then
    return jsonb_build_object('applied', false, 'reason', 'not_found');
  end if;
  if v_status <> 'open' then
    return jsonb_build_object('applied', false, 'reason', 'not_open', 'status', v_status);
  end if;
  if v_has_suggestion and not p_force then
    return jsonb_build_object('applied', false, 'reason', 'already_has_suggestion');
  end if;

  update public.lara_recovery_findings
  set suggested_message  = p_suggested_message,
      suggested_action   = p_suggested_action,
      recommended_owner  = p_recommended_owner,
      action_deadline_at = p_action_deadline_at,
      updated_at         = now()
  where id = p_finding_id and clinic_id = v_clinic and status = 'open'
    and (p_force or (suggested_message is null and suggested_action is null))
  returning id into v_updated;

  return jsonb_build_object(
    'applied', v_updated is not null,
    'finding_id', p_finding_id,
    'has_message', p_suggested_message is not null,
    'forced', p_force
  );
end;
$function$;

-- GRANTS · SERVER-SIDE ONLY · escrita só pelo backend (service_role). authenticated NÃO executa.
REVOKE ALL ON FUNCTION public.lara_recovery_finding_apply_suggestion(uuid, text, text, text, timestamptz, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lara_recovery_finding_apply_suggestion(uuid, text, text, text, timestamptz, boolean) TO service_role;

COMMENT ON FUNCTION public.lara_recovery_finding_apply_suggestion(uuid, text, text, text, timestamptz, boolean) IS
  'Recovery Radar · persiste sugestão de IA num finding open (Prompt 4). Não sobrescreve suggested_message salvo force. Não envia nada.';
