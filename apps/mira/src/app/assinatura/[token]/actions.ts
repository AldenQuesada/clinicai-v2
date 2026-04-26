'use server'

/**
 * Server Actions · /assinatura/[token]
 *
 * signDocumentAction · grava assinatura via RPC anon-friendly
 * legal_doc_submit_signature. Server-side recolhe IP do header
 * (x-forwarded-for / x-real-ip) e user agent · paciente nao precisa enviar.
 *
 * NAO usa loadMiraServerContext · rota e' publica (sem auth). Cria service
 * role client direto · RPC tem SECURITY DEFINER + valida slug/token.
 */

import { headers } from 'next/headers'
import { createServiceRoleClient } from '@clinicai/supabase'
import { LegalDocSignatureRepository } from '@clinicai/repositories'

export interface SignDocumentInput {
  slug: string
  token: string
  signerName: string
  signerCpf?: string | null
  signatureData: string
  geolocation?: { lat: number; lng: number; acc?: number } | null
}

export async function signDocumentAction(input: SignDocumentInput): Promise<{
  ok: boolean
  signatureId?: string
  signedAt?: string
  error?: string
}> {
  // Header capture · pode falhar em alguns runtimes
  let ip: string | null = null
  let ua: string | null = null
  try {
    const h = await headers()
    ip =
      h.get('x-forwarded-for')?.split(',')[0]?.trim() ||
      h.get('x-real-ip') ||
      h.get('cf-connecting-ip') ||
      null
    ua = h.get('user-agent') || null
  } catch {
    // ignore · nao impede assinatura
  }

  const supabase = createServiceRoleClient()
  const repo = new LegalDocSignatureRepository(supabase)
  const r = await repo.sign({
    slug: input.slug,
    token: input.token,
    signerName: input.signerName,
    signerCpf: input.signerCpf ?? null,
    signatureData: input.signatureData,
    ipAddress: ip,
    userAgent: ua,
    geolocation: input.geolocation ?? null,
  })
  return r
}
