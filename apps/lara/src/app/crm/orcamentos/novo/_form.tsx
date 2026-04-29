'use client'

/**
 * Form de criacao de orcamento (a partir de um lead) ·
 * /crm/orcamentos/novo?leadId=<uuid>.
 *
 * Submit chama createOrcamentoFromLeadAction (lead.actions.ts) ·
 * RPC lead_to_orcamento soft-deleta lead + cria orcamento em transacao
 * atomica.
 *
 * Pra orcamento direto em paciente existente: nao suportado v1 ·
 * caminho atual eh criar lead novo primeiro. Camada 10 vai abrir RPC
 * patient_to_orcamento dedicada.
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
  Textarea,
  useToast,
} from '@clinicai/ui'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { createOrcamentoFromLeadAction } from '../../_actions/lead.actions'
import {
  ItemsEditor,
  computeTotals,
  type ItemsEditorState,
} from '../_components/items-editor'

interface NovoOrcamentoFormProps {
  leadId: string
  leadName: string | null
  leadPhone: string
  /** Validade default · 30 dias da data de hoje · YYYY-MM-DD */
  defaultValidUntil: string
}

export function NovoOrcamentoForm({
  leadId,
  leadName,
  leadPhone,
  defaultValidUntil,
}: NovoOrcamentoFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [title, setTitle] = React.useState('')
  const [validUntil, setValidUntil] = React.useState(defaultValidUntil)
  const [notes, setNotes] = React.useState('')
  const [editor, setEditor] = React.useState<ItemsEditorState>({
    items: [{ name: '', qty: 1, unitPrice: 0, procedureCode: null }],
    discount: 0,
  })
  const [submitting, setSubmitting] = React.useState(false)
  const [errors, setErrors] = React.useState<Record<string, string>>({})

  const { subtotal, total, itemsWithSubtotal } = computeTotals(editor)

  function validate(): boolean {
    const next: Record<string, string> = {}
    if (editor.items.length === 0) next.items = 'Adicione pelo menos 1 item'
    editor.items.forEach((it, i) => {
      if (!it.name.trim()) next[`item-${i}-name`] = 'Nome obrigatório'
      if (!it.qty || it.qty < 1) next[`item-${i}-qty`] = 'Qty >= 1'
      if (it.unitPrice < 0) next[`item-${i}-price`] = 'Preço >= 0'
    })
    if (subtotal <= 0) next.subtotal = 'Subtotal precisa ser > 0'
    if (validUntil && !/^\d{4}-\d{2}-\d{2}$/.test(validUntil)) {
      next.validUntil = 'Data inválida'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!validate()) return
    setSubmitting(true)
    try {
      const r = await createOrcamentoFromLeadAction({
        leadId,
        items: itemsWithSubtotal.map((it) => ({
          name: it.name.trim(),
          qty: it.qty,
          unitPrice: it.unitPrice,
          subtotal: it.subtotal,
          procedureCode: it.procedureCode ?? null,
        })),
        subtotal,
        discount: editor.discount || 0,
        title: title.trim() || null,
        notes: notes.trim() || null,
        validUntil: validUntil || null,
      })
      if (r.ok) {
        toast.success('Orçamento criado!')
        router.push(`/crm/orcamentos/${r.data.orcamentoId}`)
      } else if (r.error === 'invalid_input') {
        toast.error('Dados inválidos · revise os campos')
        setErrors({ form: 'Dados inválidos' })
      } else {
        toast.error(`Falha: ${r.error}`)
      }
    } catch {
      toast.error('Erro inesperado')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Lead vinculado</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border border-[var(--border)] bg-[var(--card)]/40 p-3 text-sm">
            <div className="font-medium text-[var(--foreground)]">
              {leadName ?? 'Sem nome'}
            </div>
            <div className="text-xs text-[var(--muted-foreground)]">
              {leadPhone} · ID {leadId.slice(0, 8)}
            </div>
            <p className="mt-2 text-[10px] text-amber-200/80">
              Atenção: ao salvar, o lead vira orçamento (soft-delete em leads,
              audit em phase_history). Esta operação é atômica.
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Identificação</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <FormField label="Título" htmlFor="orc-title">
            <Input
              id="orc-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              placeholder="Ex: Pacote Lipo HD + Mama"
              disabled={submitting}
            />
          </FormField>
          <FormField
            label="Validade"
            htmlFor="orc-valid"
            error={errors.validUntil}
          >
            <Input
              id="orc-valid"
              type="date"
              value={validUntil}
              onChange={(e) => setValidUntil(e.target.value)}
              disabled={submitting}
            />
          </FormField>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Itens · procedimentos</CardTitle>
        </CardHeader>
        <CardContent>
          <ItemsEditor
            value={editor}
            onChange={setEditor}
            disabled={submitting}
          />
          {errors.items && (
            <p className="mt-2 text-xs text-rose-400">{errors.items}</p>
          )}
          {errors.subtotal && (
            <p className="mt-2 text-xs text-rose-400">{errors.subtotal}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Observações</CardTitle>
        </CardHeader>
        <CardContent>
          <FormField
            label="Notas internas (não aparecem no link público)"
            htmlFor="orc-notes"
          >
            <Textarea
              id="orc-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              maxLength={4000}
              placeholder="Detalhes do plano, requisitos, contexto…"
              disabled={submitting}
            />
          </FormField>
        </CardContent>
      </Card>

      <div className="flex justify-end gap-2">
        <Link href="/crm/orcamentos">
          <Button type="button" variant="ghost" disabled={submitting}>
            <ArrowLeft className="h-4 w-4" />
            Cancelar
          </Button>
        </Link>
        <Button type="submit" disabled={submitting || total <= 0}>
          <Save className="h-4 w-4" />
          {submitting ? 'Salvando…' : 'Criar orçamento'}
        </Button>
      </div>
    </form>
  )
}
