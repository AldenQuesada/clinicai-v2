/**
 * /crm/pacientes/[id] · prontuário detalhado do paciente.
 *
 * CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_DETAIL (Trilha A · read-heavy).
 *
 * Server component carrega read models seguros e delega para o client
 * `PatientRecordTabs`, que faz tab switching client-side:
 *   - Visão geral · cards de identidade, contato, financeiro, endereço, origem
 *   - Agenda · histórico completo de appointments
 *   - Procedimentos · snapshot procedure_name enriquecido por match em
 *     clinic_procedimentos.nome (sem assumir FK · WIZARD_PROCEDURES B1)
 *   - Anamnese · lista read-only de `appointment_anamneses` (status + flag
 *     hasContent) · sem alterar hard gate, sem chamar appointment_anamnesis_*
 *   - Orçamentos · lista de `orcamentos` do paciente
 *   - Timeline · merge cronológico (creation + appointments + anamneses +
 *     orçamentos finalizações)
 *   - Documentos · placeholder · medical_record_attachments existe mas
 *     0 policies = inacessível; módulo dedicado fica para fase futura
 *   - Notas · `patients.notes` text single-field + foto/recepção (módulo
 *     da fase PRONTUARIO_BASE)
 *
 * Privacidade:
 *   - Telefone aparece (autenticado · admin/owner/receptionist)
 *   - Foto: signed URL TTL 5min server-side · path bruto NUNCA viaja
 *   - Painel-TV intocado · sem dado clínico
 *   - Path bruto de medical_record_attachments nunca exposto (módulo inativo)
 *
 * Sem provider externo · sem WhatsApp · sem Alexa · sem mutação de hard gate.
 */

import { notFound } from 'next/navigation'
import { PageHeader, Button } from '@clinicai/ui'
import Link from 'next/link'
import { Pencil } from 'lucide-react'
import { loadServerReposContext } from '@/lib/repos'
import { createServiceRoleClient } from '@clinicai/supabase'
import { SoftDeleteButton } from '../_components/soft-delete-button'
import type {
  AppointmentDTO,
  OrcamentoDTO,
  PatientAnamnesisRecordDTO,
  AdminProcedureDTO,
  MedicalRecordAttachmentDTO,
  AppointmentPostActionDTO,
} from '@clinicai/repositories'
import { PatientRecordTabs } from './_record-tabs'

export const dynamic = 'force-dynamic'

interface PageProps {
  params: Promise<{ id: string }>
  searchParams?: Promise<{ tab?: string }>
}

export default async function PatientDetailPage({
  params,
  searchParams,
}: PageProps) {
  const { id } = await params
  const sp = (await searchParams) ?? {}

  const { ctx, repos } = await loadServerReposContext()
  const patient = await repos.patients.getById(id)
  if (!patient) notFound()

  const [appointments, orcamentos, anamnesisRecords, profileExtended, procedures, attachments] =
    await Promise.all([
      repos.appointments
        .listBySubject(ctx.clinic_id, { patientId: patient.id }, { limit: 100 })
        .catch(() => [] as AppointmentDTO[]),
      repos.orcamentos
        .listBySubject(ctx.clinic_id, { patientId: patient.id }, { limit: 100 })
        .catch(() => [] as OrcamentoDTO[]),
      repos.anamnesisTemplates
        .listClinicalRecordsForPatient(patient.id, { limit: 50 })
        .catch(() => [] as PatientAnamnesisRecordDTO[]),
      repos.patientProfile.getByPatientId(patient.id).catch(() => null),
      repos.procedureAdmin
        .list({ status: 'active', limit: 500 })
        .catch(() => [] as AdminProcedureDTO[]),
      repos.medicalRecordAttachments
        .listByPatient(patient.id, { limit: 200 })
        .catch(() => [] as MedicalRecordAttachmentDTO[]),
    ])

  const canEditReception =
    ctx.role === 'owner' || ctx.role === 'admin' || ctx.role === 'receptionist'
  // Alinhado ao role canônico do projeto (`therapist`) · vide note em
  // _documents-actions.ts sobre mig 184 corretiva.
  const canWriteDocuments =
    ctx.role === 'owner' || ctx.role === 'admin' || ctx.role === 'therapist'

  // Signed URL para foto · APENAS server-side · expira em 5 min
  let photoSignedUrl: string | null = null
  if (profileExtended?.profilePhotoPath) {
    try {
      const service = createServiceRoleClient()
      const { data } = await service.storage
        .from('media')
        .createSignedUrl(profileExtended.profilePhotoPath, 60 * 5)
      photoSignedUrl = data?.signedUrl ?? null
    } catch {
      photoSignedUrl = null
    }
  }

  // MEDIA_VAULT_WIRE · gera signed URLs server-side para cada attachment
  // (TTL 5min). DTO enviado ao client adiciona `signedUrl` mas NÃO inclui
  // `storagePath` (esse campo nem está no DTO público do repo).
  type AttachmentForClient = MedicalRecordAttachmentDTO & {
    signedUrl: string | null
    signedUrlExpiresAt: string | null
  }
  let attachmentsForClient: AttachmentForClient[] = attachments.map((a) => ({
    ...a,
    signedUrl: null,
    signedUrlExpiresAt: null,
  }))
  if (attachments.length > 0) {
    const ttlSec = 60 * 5
    const expiresAt = new Date(Date.now() + ttlSec * 1000).toISOString()
    const service = createServiceRoleClient()
    // Busca paths internos · CHANNEL OF TRUST: server only · zero path no client
    const paths = await Promise.all(
      attachments.map(async (a) => {
        const internal = await repos.medicalRecordAttachments
          .getInternalById(a.id)
          .catch(() => null)
        if (!internal) return null
        try {
          const { data } = await service.storage
            .from(internal.bucket)
            .createSignedUrl(internal.storagePath, ttlSec)
          return { id: a.id, signedUrl: data?.signedUrl ?? null }
        } catch {
          return { id: a.id, signedUrl: null }
        }
      }),
    )
    const urlById = new Map(
      paths.filter((p): p is { id: string; signedUrl: string | null } => Boolean(p)).map((p) => [p.id, p.signedUrl]),
    )
    attachmentsForClient = attachments.map((a) => ({
      ...a,
      signedUrl: urlById.get(a.id) ?? null,
      signedUrlExpiresAt: expiresAt,
    }))
  }

  // Procedimentos: agrupa snapshot `procedure_name` dos appointments e
  // tenta enriquecer com clinic_procedimentos (match por nome case-insensitive
  // trim · mesmo contrato da fase WIZARD_PROCEDURES B1).
  const procedureCatalogByLowerName = new Map(
    procedures.map((p) => [p.nome.trim().toLowerCase(), p]),
  )

  // CRM_PARITY_R4 · fila de pós-ações (mig 197) across todos os
  // appointments do paciente · usada na nova tab "Pós-ações".
  const appointmentIds = appointments.map((a) => a.id)
  const postActions: AppointmentPostActionDTO[] =
    appointmentIds.length > 0
      ? await repos.appointmentPostActions
          .listByAppointmentIds(appointmentIds)
          .catch(() => [] as AppointmentPostActionDTO[])
      : []

  const initialTab = (sp.tab as string | undefined) ?? 'overview'

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title={patient.name}
        description={`ID ${patient.id.slice(0, 8)}… · Status ${patient.status}`}
        breadcrumb={[
          { label: 'CRM', href: '/crm' },
          { label: 'Pacientes', href: '/crm/pacientes' },
          { label: patient.name },
        ]}
        actions={
          <>
            <Link href={`/crm/pacientes/${patient.id}/editar`}>
              <Button size="sm" variant="outline">
                <Pencil className="h-4 w-4" />
                Editar
              </Button>
            </Link>
            <SoftDeleteButton
              patientId={patient.id}
              patientName={patient.name}
              role={ctx.role}
            />
          </>
        }
      />

      <PatientRecordTabs
        patient={patient}
        appointments={appointments}
        orcamentos={orcamentos}
        anamnesisRecords={anamnesisRecords}
        profileExtended={profileExtended}
        photoSignedUrl={photoSignedUrl}
        canEditReception={canEditReception}
        canWriteDocuments={canWriteDocuments}
        attachments={attachmentsForClient}
        procedureCatalog={Array.from(procedureCatalogByLowerName.entries()).map(
          ([key, p]) => ({
            key,
            id: p.id,
            nome: p.nome,
            categoria: p.categoria,
            duracaoMin: p.duracaoMin,
            preco: p.preco,
            precoPromo: p.precoPromo,
          }),
        )}
        postActions={postActions}
        initialTab={initialTab}
      />
    </div>
  )
}
