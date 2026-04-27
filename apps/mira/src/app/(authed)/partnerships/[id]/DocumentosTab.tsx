/**
 * DocumentosTab · Server Component · fetcha templates ativos + requests
 * vinculados a essa parceria, e renderiza DocumentosClient (CRUD interativo).
 *
 * Vinculo a parceria usa convencao appointment_id="partnership:<uuid>"
 * via LegalDocRequestRepository.listByPartnership (zero schema migration).
 *
 * Pedido Alden 2026-04-26: filtrar por doc_type='parceria' (esconde TCLEs
 * clinicos · mig 800-46 cria contrato-parceria-b2b default) · auto-fill
 * dados da clinica + responsavel da parceria.
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { DocumentosClient } from './DocumentosClient'

export async function DocumentosTab({
  partnershipId,
  partnershipName,
  partnershipPhone,
  canManage,
}: {
  partnershipId: string
  partnershipName: string
  partnershipPhone: string
  canManage: boolean
}) {
  const { ctx, supabase, repos } = await loadMiraServerContext()
  const [templates, requests, partnership, clinicRow] = await Promise.all([
    repos.legalDocTemplates.listActive().catch(() => []),
    repos.legalDocRequests.listByPartnership(partnershipId).catch(() => []),
    repos.b2bPartnerships.getById(partnershipId).catch(() => null),
    (async () => {
      try {
        const { data } = await supabase
          .from('clinics')
          .select('name, phone, whatsapp, email, address, fiscal')
          .eq('id', ctx.clinic_id)
          .maybeSingle()
        return (data ?? null) as Record<string, unknown> | null
      } catch {
        return null
      }
    })(),
  ])

  // Filtra apenas templates de parceria (esconde docs clinicos TCLE).
  // Se nao houver template de parceria, mostra todos como fallback.
  const partnershipTemplates = templates.filter((t) => t.docType === 'parceria')
  const visibleTemplates = partnershipTemplates.length > 0 ? partnershipTemplates : templates

  // Default = primeiro template de parceria (contrato-parceria-b2b)
  const defaultTemplate = partnershipTemplates[0] ?? visibleTemplates[0] ?? null

  // Pre-fill values · mistura clinic data + partnership data
  const clinicAddress = (clinicRow?.address ?? {}) as Record<string, unknown>
  const clinicFiscal = (clinicRow?.fiscal ?? {}) as Record<string, unknown>
  const enderecoCompleto = [
    clinicAddress.rua,
    clinicAddress.num,
    clinicAddress.comp,
    clinicAddress.bairro,
    clinicAddress.cidade,
    clinicAddress.estado,
    clinicAddress.cep,
  ]
    .filter(Boolean)
    .join(', ')

  const prefillVars: Record<string, string> = {
    parceira_nome: partnership?.name ?? partnershipName,
    parceira_responsavel: partnership?.contactName ?? '',
    parceira_email: partnership?.contactEmail ?? '',
    parceira_phone: partnership?.contactPhone ?? partnershipPhone,
    voucher_combo: partnership?.voucherCombo ?? '',
    voucher_validity_days: String(partnership?.voucherValidityDays ?? 30),
    voucher_monthly_cap: String(partnership?.voucherMonthlyCap ?? 5),
    contrato_data: new Date().toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    }),
    contrato_duracao_meses: String(partnership?.contractDurationMonths ?? 12),
    clinica_nome: String(clinicRow?.name ?? 'Clínica Mirian de Paula'),
    clinica_cnpj: String(clinicFiscal.cnpj ?? ''),
    clinica_endereco: enderecoCompleto,
    clinica_email: String(clinicRow?.email ?? ''),
    clinica_phone: String(clinicRow?.phone ?? clinicRow?.whatsapp ?? ''),
  }

  return (
    <DocumentosClient
      partnershipId={partnershipId}
      partnershipName={partnershipName}
      partnershipPhone={partnershipPhone}
      partnershipResponsavel={partnership?.contactName ?? ''}
      defaultTemplateId={defaultTemplate?.id ?? null}
      prefillVars={prefillVars}
      canManage={canManage}
      templates={visibleTemplates.map((t) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        docType: t.docType,
        variables: t.variables,
      }))}
      initialRequests={requests.map((r) => ({
        id: r.id,
        templateId: r.templateId,
        templateName: r.templateName,
        publicSlug: r.publicSlug,
        status: r.status,
        signerName: r.patientName,
        createdAt: r.createdAt,
        signedAt: r.signedAt,
        expiresAt: r.expiresAt,
        hasSignature: r.hasSignature,
      }))}
    />
  )
}
