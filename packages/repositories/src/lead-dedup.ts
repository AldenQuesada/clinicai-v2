/**
 * Dedup global cross-tabela usado pelo handler `b2b-emit-voucher` pra
 * bloquear emissao duplicada (e mensagens formatadas no `formatDedupReply`
 * em apps/mira).
 *
 * Vive separado do LeadRepository porque consulta 3 tabelas (leads +
 * b2b_vouchers + b2b_attributions) com logica de prioridade especifica do
 * fluxo B2B · responsabilidade alheia ao "acesso a leads" puro.
 *
 * Schema canonico vive no clinic-dashboard · clinicai-v2 nao tem tabela
 * `patients` separada antes da Camada 4 · pos-Camada 4 patients existe
 * mas dedup nao precisa consultar la (modelo excludente: leads.phase=
 * 'paciente' tem soft-delete · patients.id eh leads.id original).
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import { phoneVariants } from '@clinicai/utils'
import type { DedupHit } from './types/dtos'

/**
 * Dedup global pre-emit voucher · varredura cross-tabela em paralelo.
 *
 * Retorna o "hit mais forte" (patient > lead > voucher_recipient > partner_referral).
 * Se nada bate, retorna null e o caller (b2b-emit-voucher) prossegue normal.
 *
 * Tabelas consultadas:
 *   - leads (separado em phase='patient' vs resto)
 *   - b2b_vouchers (recipient_phone)
 *   - b2b_attributions (via lead_id · join leads)
 *
 * `name` recebido apenas como sanity (nao bloqueia · phone que decide).
 *
 * @param supabase  Client tipado · normalmente vem do caller (Server Action)
 * @param clinicId  Multi-tenant ADR-028 · obrigatorio
 * @param phone     Telefone do recipient (qualquer formato · normaliza interno)
 * @param _name     Nome do recipient · reservado pra logging futuro
 */
export async function findLeadInAnySystem(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  clinicId: string,
  phone: string,
  _name?: string | null,
): Promise<DedupHit | null> {
  const variants = phoneVariants(phone)
  if (!variants.length) return null

  // 4 queries paralelas · todas filtradas por clinic_id (ADR-028)
  const [leadRes, voucherRes, attribRes] = await Promise.all([
    // Leads (qualquer phase) · pega created_at mais antigo
    supabase
      .from('leads')
      .select('id, name, phone, phase, created_at')
      .eq('clinic_id', clinicId)
      .in('phone', variants)
      .order('created_at', { ascending: true })
      .limit(5),
    // Vouchers · recipient_phone variants (qualquer status · evita re-emit)
    supabase
      .from('b2b_vouchers')
      .select('id, recipient_name, recipient_phone, partnership_id, issued_at')
      .eq('clinic_id', clinicId)
      .in('recipient_phone', variants)
      .order('issued_at', { ascending: true })
      .limit(5),
    // Attributions · join via lead_id (b2b_attributions nao tem phone direto)
    // Buscar leads.id por phone variants e checar attribution
    supabase
      .from('leads')
      .select('id, name, created_at, b2b_attributions(id, partnership_id, created_at)')
      .eq('clinic_id', clinicId)
      .in('phone', variants)
      .limit(5),
  ])

  // Hit candidato por kind · escolhe o mais forte
  const leadRows = (leadRes.data ?? []) as Array<{
    id: string
    name: string | null
    phone: string
    phase: string | null
    created_at: string
  }>

  // 1. patient (phase='patient' · prioridade maxima)
  const patientRow = leadRows.find((r) => r.phase === 'patient')
  if (patientRow) {
    return {
      kind: 'patient',
      id: String(patientRow.id),
      name: patientRow.name ?? null,
      phone: String(patientRow.phone ?? ''),
      since: patientRow.created_at ?? new Date().toISOString(),
    }
  }

  // 2. lead (qualquer phase != patient · pega o mais antigo)
  if (leadRows.length > 0) {
    const r = leadRows[0]
    return {
      kind: 'lead',
      id: String(r.id),
      name: r.name ?? null,
      phone: String(r.phone ?? ''),
      since: r.created_at ?? new Date().toISOString(),
    }
  }

  // 3. voucher_recipient · indicada antes (status irrelevante)
  const voucherRows = (voucherRes.data ?? []) as Array<{
    id: string
    recipient_name: string | null
    recipient_phone: string | null
    partnership_id: string | null
    issued_at: string
  }>
  if (voucherRows.length > 0) {
    // Mais antigo · oldest first ja ordenado
    const v = voucherRows[0]
    // Resolve partnership name best-effort · 1 query simples
    let partnershipName: string | null = null
    if (v.partnership_id) {
      const { data: p } = await supabase
        .from('b2b_partnerships')
        .select('name')
        .eq('id', v.partnership_id)
        .maybeSingle()
      partnershipName = (p as { name?: string } | null)?.name ?? null
    }
    return {
      kind: 'voucher_recipient',
      id: String(v.id),
      name: v.recipient_name ?? null,
      phone: String(v.recipient_phone ?? ''),
      since: v.issued_at ?? new Date().toISOString(),
      partnershipName,
    }
  }

  // 4. partner_referral · attribution via lead.id que nao caiu em (1)/(2)
  //    Esse caminho cobre o edge: lead foi removido fisicamente mas
  //    attribution sobrou (raro · soft delete). Em pratica, se chegou aqui
  //    e nao tinha lead, attribution tambem nao existe. Mantemos o ramo
  //    consistente com o contrato.
  const attribRows = (attribRes.data ?? []) as Array<{
    id: string
    name: string | null
    created_at: string
    b2b_attributions: Array<{
      id: string
      partnership_id: string | null
      created_at: string
    }> | null
  }>
  for (const r of attribRows) {
    const attribs = Array.isArray(r.b2b_attributions) ? r.b2b_attributions : []
    if (attribs.length > 0) {
      const a = attribs[0]
      let partnershipName: string | null = null
      if (a.partnership_id) {
        const { data: p } = await supabase
          .from('b2b_partnerships')
          .select('name')
          .eq('id', a.partnership_id)
          .maybeSingle()
        partnershipName = (p as { name?: string } | null)?.name ?? null
      }
      return {
        kind: 'partner_referral',
        id: String(r.id),
        name: r.name ?? null,
        phone: variants[0],
        since: a.created_at ?? r.created_at ?? new Date().toISOString(),
        partnershipName,
      }
    }
  }

  return null
}
