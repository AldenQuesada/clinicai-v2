'use client'

/**
 * Form de edicao de orcamento existente · /crm/orcamentos/[id]/editar.
 *
 * Submit chama updateOrcamentoAction (orcamento.actions.ts). Difere do
 * novo:
 *   - Sem campos de subject (lead_id/patient_id sao imutaveis)
 *   - Permitido editar items, discount, validUntil, title, notes
 *   - NAO permite mudar status (use actions-bar do detalhe)
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
import type { OrcamentoDTO } from '@clinicai/repositories'
import { updateOrcamentoAction } from '../../../_actions/orcamento.actions'
import {
  ItemsEditor,
  computeTotals,
  type ItemsEditorState,
} from '../../_components/items-editor'

interface EditarOrcamentoFormProps {
  orcamento: OrcamentoDTO
}

export function EditarOrcamentoForm({ orcamento }: EditarOrcamentoFormProps) {
  const router = useRouter()
  const toast = useToast()

  const [title, setTitle] = React.useState(orcamento.title ?? '')
  const [validUntil, setValidUntil] = React.useState(orcamento.validUntil ?? '')
  const [notes, setNotes] = React.useState(orcamento.notes ?? '')
  const [editor, setEditor] = React.useState<ItemsEditorState>({
    items: orcamento.items.map((it) => ({
      name: it.name,
      qty: it.qty,
      unitPrice: it.unitPrice,
      procedureCode: it.procedureCode ?? null,
    })),
    discount: orcamento.discount,
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
      const r = await updateOrcamentoAction({
        orcamentoId: orcamento.id,
        title: title.trim() || null,
        validUntil: validUntil || null,
        notes: notes.trim() || null,
        items: itemsWithSubtotal.map((it) => ({
          name: it.name.trim(),
          qty: it.qty,
          unitPrice: it.unitPrice,
          subtotal: it.subtotal,
          procedureCode: it.procedureCode ?? null,
        })),
        subtotal,
        discount: editor.discount || 0,
        total,
      })
      if (r.ok) {
        toast.success('Orçamento atualizado!')
        router.push(`/crm/orcamentos/${orcamento.id}`)
      } else if (r.error === 'invalid_input') {
        toast.error('Dados inválidos · revise os campos')
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
          <FormField label="Validade" htmlFor="orc-valid" error={errors.validUntil}>
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
          <ItemsEditor value={editor} onChange={setEditor} disabled={submitting} />
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
        <Link href={`/crm/orcamentos/${orcamento.id}`}>
          <Button type="button" variant="ghost" disabled={submitting}>
            <ArrowLeft className="h-4 w-4" />
            Cancelar
          </Button>
        </Link>
        <Button type="submit" disabled={submitting || total <= 0}>
          <Save className="h-4 w-4" />
          {submitting ? 'Salvando…' : 'Salvar alterações'}
        </Button>
      </div>
    </form>
  )
}
