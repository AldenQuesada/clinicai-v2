'use client'

/**
 * PatientReceptionPanel · client component · CRM_PHASE_LEGACY.PORT.PACIENTE_PRONTUARIO_BASE.
 *
 * Card "Foto & Recepção" no detalhe do paciente:
 *   - Upload/substituir foto (FormData → server action · service_role upload)
 *   - Preview da foto via signed URL gerada server-side (passada como prop)
 *   - Remover foto
 *   - Toggle consentimento (granted/revoked)
 *   - Toggle welcome (boas-vindas na recepção) · enforce pré-reqs
 *   - Estilo de animação · 3 opções
 *
 * NUNCA expõe path direto do storage · usa signed URL gerada server-side.
 * NUNCA mostra dados clínicos · só foto+nome+preferences.
 */

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Card, CardHeader, CardTitle, CardContent, Button } from '@clinicai/ui'
import { Upload, Trash2, Check, X, Tv } from 'lucide-react'
import type {
  PatientProfileExtendedDTO,
  ReceptionAnimationStyle,
} from '@clinicai/repositories'
import {
  savePatientProfileAction,
  uploadPatientProfilePhotoAction,
  removePatientProfilePhotoAction,
  grantReceptionPhotoConsentAction,
  revokeReceptionPhotoConsentAction,
  setReceptionWelcomeEnabledAction,
} from './_profile-actions'

interface Props {
  patientId: string
  patientName: string
  profile: PatientProfileExtendedDTO | null
  photoSignedUrl: string | null
  canEdit: boolean
}

const ANIMATION_OPTIONS: Array<{ value: ReceptionAnimationStyle; label: string }> = [
  { value: 'premium_soft', label: 'Premium Soft' },
  { value: 'premium_glow', label: 'Premium Glow' },
  { value: 'premium_clean', label: 'Premium Clean' },
]

function initialsOf(name: string): string {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}

export function PatientReceptionPanel({
  patientId,
  patientName,
  profile,
  photoSignedUrl,
  canEdit,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [displayName, setDisplayName] = useState(profile?.displayName ?? '')
  const [preferredName, setPreferredName] = useState(profile?.preferredName ?? '')
  const [animation, setAnimation] = useState<ReceptionAnimationStyle>(
    profile?.receptionAnimationStyle ?? 'premium_soft',
  )

  const consentStatus = profile?.receptionPhotoConsentStatus ?? 'none'
  const welcomeEnabled = profile?.receptionWelcomeEnabled ?? false
  const hasPhoto = !!profile?.profilePhotoPath
  const canTurnOnWelcome = consentStatus === 'granted' && hasPhoto

  function pickFile() {
    fileInputRef.current?.click()
  }

  function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setError(null)
    setInfo(null)
    const fd = new FormData()
    fd.append('patientId', patientId)
    fd.append('file', file)
    startTransition(async () => {
      const r = await uploadPatientProfilePhotoAction(fd)
      if (!r.ok) {
        setError(translateError(r.error))
      } else {
        setInfo('Foto atualizada.')
        router.refresh()
      }
      if (fileInputRef.current) fileInputRef.current.value = ''
    })
  }

  function handleRemovePhoto() {
    if (!confirm('Remover a foto atual? A exibição na recepção será desligada.')) return
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const r = await removePatientProfilePhotoAction({ patientId })
      if (!r.ok) setError(translateError(r.error))
      else {
        setInfo('Foto removida.')
        router.refresh()
      }
    })
  }

  function handleSaveNames() {
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const r = await savePatientProfileAction({
        patientId,
        displayName: displayName.trim() || null,
        preferredName: preferredName.trim() || null,
        animationStyle: animation,
      })
      if (!r.ok) setError(translateError(r.error))
      else {
        setInfo('Preferências salvas.')
        router.refresh()
      }
    })
  }

  function handleGrantConsent() {
    const note = prompt(
      'Registrar consentimento da paciente para exibir foto na recepção. Nota (opcional):',
    )
    if (note === null) return
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const r = await grantReceptionPhotoConsentAction({
        patientId,
        note: note.trim() || null,
      })
      if (!r.ok) setError(translateError(r.error))
      else {
        setInfo('Consentimento registrado.')
        router.refresh()
      }
    })
  }

  function handleRevokeConsent() {
    if (
      !confirm(
        'Revogar consentimento? A exibição na recepção será desligada automaticamente.',
      )
    )
      return
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const r = await revokeReceptionPhotoConsentAction({ patientId })
      if (!r.ok) setError(translateError(r.error))
      else {
        setInfo('Consentimento revogado.')
        router.refresh()
      }
    })
  }

  function handleToggleWelcome() {
    if (welcomeEnabled) {
      if (!confirm('Desligar exibição da paciente na recepção?')) return
    }
    setError(null)
    setInfo(null)
    startTransition(async () => {
      const r = await setReceptionWelcomeEnabledAction({
        patientId,
        enabled: !welcomeEnabled,
      })
      if (!r.ok) setError(translateError(r.error))
      else {
        setInfo(welcomeEnabled ? 'Exibição desligada.' : 'Exibição habilitada.')
        router.refresh()
      }
    })
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Foto e recepção</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Foto + preview */}
        <div className="flex items-start gap-4">
          <div
            style={{
              width: 88,
              height: 88,
              borderRadius: 44,
              background:
                photoSignedUrl
                  ? `center/cover no-repeat url(${photoSignedUrl})`
                  : 'rgba(255,255,255,0.05)',
              border: '1px solid var(--border, rgba(255,255,255,0.12))',
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 24,
              fontWeight: 700,
              color: 'rgba(255,255,255,0.7)',
              flexShrink: 0,
            }}
            aria-label={photoSignedUrl ? 'Foto da paciente' : 'Avatar com iniciais'}
          >
            {!photoSignedUrl && initialsOf(displayName || preferredName || patientName)}
          </div>
          <div className="flex-1">
            <p className="text-xs text-[var(--muted-foreground)]">
              Foto oficial da paciente · usada no painel de recepção quando há
              consentimento ativo. Aceita JPG/PNG/WebP até 5 MB.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/jpg,image/png,image/webp"
                hidden
                onChange={onFileChange}
                disabled={!canEdit || pending}
              />
              <Button
                size="sm"
                variant="outline"
                onClick={pickFile}
                disabled={!canEdit || pending}
              >
                <Upload className="h-3.5 w-3.5" />
                {hasPhoto ? 'Substituir' : 'Adicionar foto'}
              </Button>
              {hasPhoto && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRemovePhoto}
                  disabled={!canEdit || pending}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                  Remover
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Consent + Welcome status */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div className="rounded-md border border-[var(--border)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                Consentimento
              </span>
              <ConsentBadge status={consentStatus} />
            </div>
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
              {consentStatus === 'granted'
                ? `Concedido em ${profile?.receptionPhotoConsentAt ? new Date(profile.receptionPhotoConsentAt).toLocaleDateString('pt-BR') : '—'}`
                : consentStatus === 'revoked'
                  ? `Revogado em ${profile?.receptionPhotoConsentRevokedAt ? new Date(profile.receptionPhotoConsentRevokedAt).toLocaleDateString('pt-BR') : '—'}`
                  : 'A paciente ainda não autorizou exibição da foto.'}
            </p>
            {profile?.receptionPhotoConsentNote && (
              <p className="mt-1 text-[10px] italic text-[var(--muted-foreground)]">
                "{profile.receptionPhotoConsentNote}"
              </p>
            )}
            <div className="mt-2 flex gap-1.5">
              {consentStatus !== 'granted' && canEdit && (
                <Button size="sm" onClick={handleGrantConsent} disabled={pending}>
                  <Check className="h-3.5 w-3.5" />
                  Registrar consentimento
                </Button>
              )}
              {consentStatus === 'granted' && canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={handleRevokeConsent}
                  disabled={pending}
                >
                  <X className="h-3.5 w-3.5" />
                  Revogar
                </Button>
              )}
            </div>
          </div>

          <div className="rounded-md border border-[var(--border)] p-3">
            <div className="flex items-center justify-between">
              <span className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
                Boas-vindas na recepção
              </span>
              <span
                className={`text-[10px] uppercase tracking-widest font-semibold ${
                  welcomeEnabled
                    ? 'text-emerald-700 dark:text-emerald-300'
                    : 'text-[var(--muted-foreground)]'
                }`}
              >
                {welcomeEnabled ? 'Ativada' : 'Desligada'}
              </span>
            </div>
            <p className="mt-1 text-[11px] text-[var(--muted-foreground)]">
              {welcomeEnabled
                ? 'Painel-TV exibe foto e nome ao chegar.'
                : canTurnOnWelcome
                  ? 'Tudo pronto · clique para ativar.'
                  : 'Requer foto + consentimento ativos.'}
            </p>
            <div className="mt-2">
              {canEdit && (
                <Button
                  size="sm"
                  variant={welcomeEnabled ? 'ghost' : undefined}
                  onClick={handleToggleWelcome}
                  disabled={pending || (!welcomeEnabled && !canTurnOnWelcome)}
                >
                  <Tv className="h-3.5 w-3.5" />
                  {welcomeEnabled ? 'Desligar' : 'Ativar'}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Preferences form */}
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
              Nome de exibição
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder={patientName}
              maxLength={120}
              disabled={!canEdit || pending}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            />
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
              Nome preferido
            </label>
            <input
              type="text"
              value={preferredName}
              onChange={(e) => setPreferredName(e.target.value)}
              placeholder="Como prefere ser chamada"
              maxLength={80}
              disabled={!canEdit || pending}
              className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm"
            />
          </div>
        </div>

        <div>
          <label className="text-[10px] uppercase tracking-widest text-[var(--muted-foreground)]">
            Estilo de animação na recepção
          </label>
          <select
            value={animation}
            onChange={(e) => setAnimation(e.target.value as ReceptionAnimationStyle)}
            disabled={!canEdit || pending}
            className="mt-1 w-full rounded-md border border-[var(--border)] bg-[var(--background)] px-2 py-1.5 text-sm md:w-auto"
          >
            {ANIMATION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[var(--border)] pt-3">
          <p className="text-[11px] text-[var(--muted-foreground)]">
            💡 A foto só será exibida na recepção se houver consentimento ativo
            e boas-vindas habilitadas. Sem isso, o painel usa avatar com iniciais.
          </p>
          {canEdit && (
            <Button size="sm" onClick={handleSaveNames} disabled={pending}>
              Salvar preferências
            </Button>
          )}
        </div>

        {(info || error) && (
          <p
            className={`text-xs ${error ? 'text-[var(--destructive)]' : 'text-emerald-700 dark:text-emerald-300'}`}
          >
            {error ?? info}
          </p>
        )}
      </CardContent>
    </Card>
  )
}

function ConsentBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; color: string }> = {
    none: { label: 'Pendente', color: 'text-[var(--muted-foreground)]' },
    granted: { label: '✓ Concedido', color: 'text-emerald-700 dark:text-emerald-300' },
    revoked: { label: 'Revogado', color: 'text-[var(--destructive)]' },
  }
  const m = map[status] ?? map.none
  return (
    <span className={`text-[10px] uppercase tracking-widest font-semibold ${m.color}`}>
      {m.label}
    </span>
  )
}

function translateError(err: string | undefined): string {
  if (!err) return 'Erro desconhecido'
  if (err === 'forbidden') return 'Apenas owner/admin/receptionist pode editar'
  if (err === 'invalid_patient_id') return 'Paciente inválido'
  if (err === 'patient_not_found') return 'Paciente não encontrado'
  if (err === 'no_file') return 'Selecione um arquivo'
  if (err === 'file_too_large') return 'Arquivo maior que 5MB'
  if (err === 'invalid_mime') return 'Formato inválido · use JPG/PNG/WebP'
  if (err === 'upload_failed') return 'Falha no upload'
  if (err === 'consent_not_granted') return 'Registre o consentimento antes de ativar exibição'
  if (err === 'photo_missing') return 'Adicione uma foto antes de ativar exibição'
  if (err === 'profile_not_found') return 'Perfil não encontrado'
  return `Erro: ${err}`
}
