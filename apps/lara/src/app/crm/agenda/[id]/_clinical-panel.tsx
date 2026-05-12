'use client'

/**
 * CRM_PHASE_2I · Painel clínico do appointment.
 *
 * Mostra estado consolidado da anamnese intra-consulta + consentimento
 * informado. Permite preencher/editar a ficha e registrar aceite do termo.
 *
 * Gate decision 2I: warning-only no FinalizeWizard · hard gate fica 2I.1.
 *
 * Distinto dos sistemas pré-existentes:
 *   - anamnesis_responses · paciente preenche via link público (pré-consulta)
 *   - legal_doc_signatures · assinatura externa formal
 * Este painel cobre o fluxo INTRA-consulta operacional.
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  FormField,
  Input,
  Modal,
  Textarea,
  useToast,
} from '@clinicai/ui'
import { CheckCircle2, AlertCircle, FileText, ShieldCheck } from 'lucide-react'
import {
  upsertAppointmentAnamnesisAction,
  completeAppointmentAnamnesisAction,
  acceptAppointmentConsentAction,
} from '@/app/crm/_actions/appointment-clinical.actions'

export interface ClinicalGateData {
  anamnesis: {
    id: string | null
    status: 'none' | 'draft' | 'complete' | 'archived'
    completedAt: string | null
  }
  consent: {
    signed: boolean
    rows: number
    legacyConsentimentoImg: string | null
  }
  gateStatus: 'ok' | 'warning'
}

interface ClinicalPanelProps {
  appointmentId: string
  initialData: ClinicalGateData
  defaultSignerName?: string | null
}

const DEFAULT_TERM = {
  key: 'tcle_estetica',
  version: 'v1.0',
  title: 'TCLE - Termo de Consentimento Livre e Esclarecido (Procedimentos Estéticos)',
}

const STATUS_LABEL: Record<string, string> = {
  none: 'Não preenchida',
  draft: 'Em rascunho',
  complete: 'Completa',
  archived: 'Arquivada',
}

export function ClinicalPanel({
  appointmentId,
  initialData,
  defaultSignerName,
}: ClinicalPanelProps) {
  const router = useRouter()
  const [openAnamnesis, setOpenAnamnesis] = React.useState(false)
  const [openConsent, setOpenConsent] = React.useState(false)

  const anamnesisLabel = STATUS_LABEL[initialData.anamnesis.status]
  const anamnesisOk = initialData.anamnesis.status === 'complete'
  const consentOk = initialData.consent.signed
  const gateOk = initialData.gateStatus === 'ok'

  return (
    <>
      <Card className="md:col-span-3">
        <CardHeader>
          <CardTitle>Clínico · Anamnese + Consentimento</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <ClinicalBadge ok={anamnesisOk} draft={initialData.anamnesis.status === 'draft'}>
              <FileText className="h-3 w-3" />
              Anamnese · {anamnesisLabel}
            </ClinicalBadge>

            <ClinicalBadge ok={consentOk}>
              <ShieldCheck className="h-3 w-3" />
              Consentimento ·{' '}
              {consentOk ? 'Assinado' : 'Pendente'}
            </ClinicalBadge>

            <ClinicalBadge ok={gateOk}>
              {gateOk ? (
                <CheckCircle2 className="h-3 w-3" />
              ) : (
                <AlertCircle className="h-3 w-3" />
              )}
              Gate clínico · {gateOk ? 'OK' : 'Atenção'}
            </ClinicalBadge>
          </div>

          {!gateOk && (
            <p className="text-xs text-[var(--muted-foreground)]">
              Antes de finalizar, preencha a anamnese (mín. queixa + sem
              contraindicações) e registre o consentimento informado.
              Decisão 2I: a finalização ainda é permitida com gate=atenção
              (warning), mas a Dra. deve confirmar a ciência.
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" onClick={() => setOpenAnamnesis(true)}>
              <FileText className="h-4 w-4" />
              {initialData.anamnesis.status === 'none'
                ? 'Preencher anamnese'
                : 'Editar anamnese'}
            </Button>
            <Button size="sm" variant="outline" onClick={() => setOpenConsent(true)}>
              <ShieldCheck className="h-4 w-4" />
              {consentOk ? 'Ver consentimento' : 'Registrar consentimento'}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AnamnesisModal
        open={openAnamnesis}
        onOpenChange={setOpenAnamnesis}
        appointmentId={appointmentId}
        currentStatus={initialData.anamnesis.status}
        onSaved={() => router.refresh()}
      />

      <ConsentModal
        open={openConsent}
        onOpenChange={setOpenConsent}
        appointmentId={appointmentId}
        alreadySigned={consentOk}
        defaultSignerName={defaultSignerName ?? ''}
        onSaved={() => router.refresh()}
      />
    </>
  )
}

function ClinicalBadge({
  ok,
  draft,
  children,
}: {
  ok: boolean
  draft?: boolean
  children: React.ReactNode
}) {
  const color = ok
    ? 'bg-[hsl(var(--primary)/0.12)] text-[hsl(var(--primary))]'
    : draft
      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
      : 'bg-red-500/10 text-red-700 dark:text-red-300'

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-medium ${color}`}
    >
      {children}
    </span>
  )
}

// ── Anamnesis modal ─────────────────────────────────────────────────────────

interface AnamnesisModalProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  appointmentId: string
  currentStatus: string
  onSaved: () => void
}

function AnamnesisModal({
  open,
  onOpenChange,
  appointmentId,
  currentStatus,
  onSaved,
}: AnamnesisModalProps) {
  const { fromResult, success } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [chiefComplaint, setChiefComplaint] = React.useState('')
  const [medicalHistory, setMedicalHistory] = React.useState('')
  const [medications, setMedications] = React.useState('')
  const [allergies, setAllergies] = React.useState('')
  const [previousProcedures, setPreviousProcedures] = React.useState('')
  const [contraindications, setContraindications] = React.useState('')
  const [pregnancyLactation, setPregnancyLactation] = React.useState('')
  const [anticoagulants, setAnticoagulants] = React.useState('')
  const [expectations, setExpectations] = React.useState('')
  const [professionalNotes, setProfessionalNotes] = React.useState('')

  async function buildPayload() {
    return {
      appointmentId,
      chiefComplaint: chiefComplaint || null,
      medicalHistory: medicalHistory || null,
      medications: medications || null,
      allergies: allergies || null,
      previousProcedures: previousProcedures || null,
      contraindications: contraindications || null,
      pregnancyLactation: pregnancyLactation || null,
      anticoagulants: anticoagulants || null,
      expectations: expectations || null,
      professionalNotes: professionalNotes || null,
    }
  }

  async function handleSaveDraft() {
    setBusy(true)
    try {
      const r = await upsertAppointmentAnamnesisAction(await buildPayload())
      if (!r.ok) {
        fromResult(r)
        return
      }
      success('Anamnese salva como rascunho')
      onSaved()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  async function handleSaveAndComplete() {
    setBusy(true)
    try {
      const r1 = await upsertAppointmentAnamnesisAction(await buildPayload())
      if (!r1.ok) {
        fromResult(r1)
        return
      }
      const r2 = await completeAppointmentAnamnesisAction({ appointmentId })
      if (!r2.ok) {
        fromResult(r2)
        return
      }
      success(
        r2.data.idempotentSkip
          ? 'Anamnese já estava completa'
          : 'Anamnese marcada como completa',
      )
      onSaved()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title="Anamnese intra-consulta"
      description={`Status atual: ${STATUS_LABEL[currentStatus]} · preencha rascunho ou marque como completa.`}
      dismissable={!busy}
      className="max-w-2xl"
    >
      <div className="space-y-3">
        <FormField label="Queixa principal" htmlFor="anam-chief">
          <Textarea
            id="anam-chief"
            value={chiefComplaint}
            onChange={(e) => setChiefComplaint(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Ex: Linhas de expressão na testa"
          />
        </FormField>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Histórico médico" htmlFor="anam-history">
            <Textarea
              id="anam-history"
              value={medicalHistory}
              onChange={(e) => setMedicalHistory(e.target.value)}
              rows={2}
              maxLength={4000}
            />
          </FormField>
          <FormField label="Medicações em uso" htmlFor="anam-meds">
            <Textarea
              id="anam-meds"
              value={medications}
              onChange={(e) => setMedications(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </FormField>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <FormField label="Alergias" htmlFor="anam-allergies">
            <Textarea
              id="anam-allergies"
              value={allergies}
              onChange={(e) => setAllergies(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </FormField>
          <FormField label="Procedimentos prévios" htmlFor="anam-prev">
            <Textarea
              id="anam-prev"
              value={previousProcedures}
              onChange={(e) => setPreviousProcedures(e.target.value)}
              rows={2}
              maxLength={2000}
            />
          </FormField>
        </div>

        <FormField label="Contraindicações relevantes" htmlFor="anam-contra">
          <Textarea
            id="anam-contra"
            value={contraindications}
            onChange={(e) => setContraindications(e.target.value)}
            rows={2}
            maxLength={2000}
            placeholder="Cite gestação/lactação/autoimunes/anticoagulantes se aplicável"
          />
        </FormField>

        <div className="grid grid-cols-3 gap-3">
          <FormField label="Gestação/lactação" htmlFor="anam-preg">
            <Input
              id="anam-preg"
              value={pregnancyLactation}
              onChange={(e) => setPregnancyLactation(e.target.value)}
              maxLength={500}
              placeholder="Não / Sim · descrever"
            />
          </FormField>
          <FormField label="Anticoagulantes" htmlFor="anam-antico">
            <Input
              id="anam-antico"
              value={anticoagulants}
              onChange={(e) => setAnticoagulants(e.target.value)}
              maxLength={500}
            />
          </FormField>
          <FormField label="Expectativas" htmlFor="anam-exp">
            <Input
              id="anam-exp"
              value={expectations}
              onChange={(e) => setExpectations(e.target.value)}
              maxLength={2000}
            />
          </FormField>
        </div>

        <FormField label="Notas do profissional" htmlFor="anam-notes">
          <Textarea
            id="anam-notes"
            value={professionalNotes}
            onChange={(e) => setProfessionalNotes(e.target.value)}
            rows={2}
            maxLength={4000}
          />
        </FormField>

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button variant="outline" onClick={handleSaveDraft} disabled={busy}>
            Salvar rascunho
          </Button>
          <Button onClick={handleSaveAndComplete} disabled={busy}>
            {busy ? 'Salvando…' : 'Salvar e marcar completa'}
          </Button>
        </div>
      </div>
    </Modal>
  )
}

// ── Consent modal ───────────────────────────────────────────────────────────

interface ConsentModalProps {
  open: boolean
  onOpenChange: (o: boolean) => void
  appointmentId: string
  alreadySigned: boolean
  defaultSignerName: string
  onSaved: () => void
}

function ConsentModal({
  open,
  onOpenChange,
  appointmentId,
  alreadySigned,
  defaultSignerName,
  onSaved,
}: ConsentModalProps) {
  const { fromResult, success } = useToast()
  const [busy, setBusy] = React.useState(false)
  const [signerName, setSignerName] = React.useState(defaultSignerName)
  const [accepted, setAccepted] = React.useState(false)

  React.useEffect(() => {
    if (open) setSignerName(defaultSignerName)
  }, [open, defaultSignerName])

  async function handleAccept() {
    if (!signerName.trim() || signerName.trim().length < 2) {
      return
    }
    if (!accepted) {
      return
    }
    setBusy(true)
    try {
      const r = await acceptAppointmentConsentAction({
        appointmentId,
        termKey: DEFAULT_TERM.key,
        termVersion: DEFAULT_TERM.version,
        termTitle: DEFAULT_TERM.title,
        signerName: signerName.trim(),
        payload: { accepted_via: 'crm.agenda.detail.clinical_panel' },
      })
      if (!r.ok) {
        fromResult(r)
        return
      }
      success(
        r.data.idempotentSkip
          ? 'Consentimento já estava registrado'
          : 'Consentimento registrado',
      )
      onSaved()
      onOpenChange(false)
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      title={alreadySigned ? 'Consentimento informado · assinado' : 'Registrar consentimento informado'}
      description={`${DEFAULT_TERM.title} · versão ${DEFAULT_TERM.version}`}
      dismissable={!busy}
    >
      <div className="space-y-3">
        <div className="rounded-md border border-[var(--border)] bg-[var(--muted)/0.3] p-3 text-xs leading-relaxed text-[var(--muted-foreground)]">
          O paciente declara estar ciente dos riscos, benefícios e
          alternativas ao procedimento estético proposto. Declara também
          que esclareceu suas dúvidas com a profissional responsável e
          consente livremente com a realização do mesmo, podendo revogar
          esta autorização a qualquer momento.
          <br />
          <br />
          <em>Termo simplificado · registro operacional · o termo formal
          completo pode ser enviado para assinatura externa via fluxo
          legal_doc.</em>
        </div>

        {alreadySigned ? (
          <p className="text-xs text-[var(--primary)]">
            ✓ Já registrado para este appointment · termo {DEFAULT_TERM.version}.
          </p>
        ) : (
          <>
            <FormField label="Nome do assinante" htmlFor="consent-name" required>
              <Input
                id="consent-name"
                value={signerName}
                onChange={(e) => setSignerName(e.target.value)}
                placeholder="Nome do paciente ou responsável"
                maxLength={200}
              />
            </FormField>

            <label className="flex items-start gap-2 text-xs">
              <input
                type="checkbox"
                checked={accepted}
                onChange={(e) => setAccepted(e.target.checked)}
                className="mt-0.5"
              />
              <span>
                Li o termo e o paciente declara ciente · consinto com o
                registro deste consentimento informado.
              </span>
            </label>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-[var(--border)] pt-3">
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            {alreadySigned ? 'Fechar' : 'Cancelar'}
          </Button>
          {!alreadySigned && (
            <Button
              onClick={handleAccept}
              disabled={busy || !accepted || signerName.trim().length < 2}
            >
              {busy ? 'Registrando…' : 'Registrar consentimento'}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  )
}
