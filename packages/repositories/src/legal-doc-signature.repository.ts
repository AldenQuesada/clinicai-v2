/**
 * LegalDocSignatureRepository · grava assinatura digital de paciente/parceiro.
 *
 * Tabela imutavel · NUNCA deletar. Lei 14.063/2020 (assinatura eletronica
 * simples). RPC `legal_doc_submit_signature` valida slug+token + grava
 * + atualiza request.status=signed atomicamente.
 *
 * Anon pode INSERT (paciente assina sem login) · staff pode SELECT.
 */

import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@clinicai/supabase'

export interface LegalDocSignatureDTO {
  id: string
  requestId: string
  signerName: string
  signerCpf: string | null
  signatureDataUrl: string
  documentHash: string
  ipAddress: string | null
  userAgent: string | null
  geolocation: Record<string, unknown> | null
  acceptanceText: string
  signedAt: string
}

export interface SubmitSignatureInput {
  slug: string
  token: string
  signerName: string
  signerCpf?: string | null
  /** PNG data URL · canvas.toDataURL('image/png'). */
  signatureData: string
  ipAddress?: string | null
  userAgent?: string | null
  geolocation?: Record<string, unknown> | null
  acceptanceText?: string
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function mapSignatureRow(r: any): LegalDocSignatureDTO {
  return {
    id: String(r.id),
    requestId: String(r.request_id),
    signerName: String(r.signer_name ?? ''),
    signerCpf: r.signer_cpf ?? null,
    signatureDataUrl: String(r.signature_data_url ?? ''),
    documentHash: String(r.document_hash ?? ''),
    ipAddress: r.ip_address ?? null,
    userAgent: r.user_agent ?? null,
    geolocation: (r.geolocation ?? null) as Record<string, unknown> | null,
    acceptanceText: String(r.acceptance_text ?? ''),
    signedAt: String(r.signed_at ?? new Date().toISOString()),
  }
}

export class LegalDocSignatureRepository {
  constructor(private supabase: SupabaseClient<Database>) {}

  /**
   * Submete assinatura via RPC publica. Anon pode chamar · valida token
   * server-side antes de gravar.
   */
  async sign(
    input: SubmitSignatureInput,
  ): Promise<{ ok: boolean; signatureId?: string; signedAt?: string; error?: string }> {
    if (!input.signerName.trim()) return { ok: false, error: 'Nome do signatario obrigatorio' }
    if (!input.signatureData) return { ok: false, error: 'Assinatura obrigatoria' }

    const { data, error } = await this.supabase.rpc('legal_doc_submit_signature', {
      p_slug: input.slug,
      p_token: input.token,
      p_signer_name: input.signerName.trim(),
      p_signer_cpf: input.signerCpf ?? null,
      p_signature_data: input.signatureData,
      p_ip_address: input.ipAddress ?? null,
      p_user_agent: (input.userAgent ?? '').substring(0, 200),
      p_geolocation: input.geolocation ?? null,
      p_acceptance_text:
        input.acceptanceText ?? 'Li, compreendi e concordo com todos os termos deste documento.',
    })
    if (error) return { ok: false, error: error.message }
    const obj = (data ?? {}) as {
      ok?: boolean
      signature_id?: string
      signed_at?: string
      error?: string
    }
    if (obj.ok === false) return { ok: false, error: obj.error || 'rpc_failed' }
    return { ok: true, signatureId: obj.signature_id, signedAt: obj.signed_at }
  }

  /**
   * Busca a assinatura ja gravada de um request · usado pelo modal "Visualizar
   * assinatura" do painel admin.
   */
  async getByRequest(requestId: string): Promise<LegalDocSignatureDTO | null> {
    const { data, error } = await this.supabase
      .from('legal_doc_signatures')
      .select('*')
      .eq('request_id', requestId)
      .order('signed_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    if (error || !data) return null
    return mapSignatureRow(data)
  }

  /**
   * Lista TODAS as assinaturas de um request · normalmente 1 por request,
   * mas mantem array pra robustez (legacy permitia retentativa).
   */
  async listByRequest(requestId: string): Promise<LegalDocSignatureDTO[]> {
    const { data, error } = await this.supabase
      .from('legal_doc_signatures')
      .select('*')
      .eq('request_id', requestId)
      .order('signed_at', { ascending: false })
    if (error || !Array.isArray(data)) return []
    return data.map(mapSignatureRow)
  }
}
