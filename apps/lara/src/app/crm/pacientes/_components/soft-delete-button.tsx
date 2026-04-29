'use client'

/**
 * SoftDeleteButton · admin/owner only · ConfirmDialog antes de chamar
 * softDeletePatientAction. Caller passa role do JWT pra esconder o botao
 * se nao tiver permissao (defense-in-depth · action tambem checa).
 */

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Button, ConfirmDialog, useToast } from '@clinicai/ui'
import { Trash2 } from 'lucide-react'
import { softDeletePatientAction } from '@/app/crm/_actions/patient.actions'

interface SoftDeleteButtonProps {
  patientId: string
  patientName: string
  /** Role do user logado · botao esconde se nao for owner/admin */
  role: string | null | undefined
  /** Onde redirecionar pos-delete · default '/crm/pacientes' */
  redirectTo?: string
}

const ALLOWED_ROLES = ['owner', 'admin']

export function SoftDeleteButton({
  patientId,
  patientName,
  role,
  redirectTo = '/crm/pacientes',
}: SoftDeleteButtonProps) {
  const router = useRouter()
  const { fromResult, success } = useToast()
  const [open, setOpen] = React.useState(false)

  if (!role || !ALLOWED_ROLES.includes(role)) return null

  async function handleConfirm() {
    const r = await softDeletePatientAction({ patientId })
    if (!r.ok) {
      fromResult(r)
      return
    }
    success(`${patientName} removido(a)`)
    router.push(redirectTo)
    router.refresh()
  }

  return (
    <>
      <Button variant="destructive" size="sm" onClick={() => setOpen(true)}>
        <Trash2 className="h-4 w-4" />
        Remover
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={`Remover ${patientName}?`}
        description="Esta ação esconde o paciente do sistema (soft-delete). Histórico de appointments e orçamentos é preservado. Apenas admins podem reverter via SQL."
        confirmLabel="Sim, remover"
        cancelLabel="Cancelar"
        confirmVariant="destructive"
        onConfirm={handleConfirm}
      />
    </>
  )
}
