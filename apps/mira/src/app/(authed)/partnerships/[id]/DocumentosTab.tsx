/**
 * DocumentosTab · Server Component · fetcha templates ativos + requests
 * vinculados a essa parceria, e renderiza DocumentosClient (CRUD interativo).
 *
 * Vinculo a parceria usa convencao appointment_id="partnership:<uuid>"
 * via LegalDocRequestRepository.listByPartnership (zero schema migration).
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
  const { repos } = await loadMiraServerContext()
  const [templates, requests] = await Promise.all([
    repos.legalDocTemplates.listActive().catch(() => []),
    repos.legalDocRequests.listByPartnership(partnershipId).catch(() => []),
  ])

  // Map pra forma serializavel (DTOs ja sao plain · seguro pra Client)
  return (
    <DocumentosClient
      partnershipId={partnershipId}
      partnershipName={partnershipName}
      partnershipPhone={partnershipPhone}
      canManage={canManage}
      templates={templates.map((t) => ({
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
