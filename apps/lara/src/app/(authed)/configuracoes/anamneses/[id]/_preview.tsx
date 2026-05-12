'use client'

/**
 * AnamnesisTemplatePreview · render read-only do template para admin.
 *
 * Mostra seções e perguntas com os controles aproximados que o paciente verá
 * no formulário real, mas SEM aceitar input/submit. Nenhuma resposta é
 * persistida.
 */

import { Card, CardContent } from '@clinicai/ui'
import type { AnamnesisTemplateWithStructureDTO } from '@clinicai/repositories'

interface Props {
  template: AnamnesisTemplateWithStructureDTO
}

export function AnamnesisTemplatePreview({ template }: Props) {
  if (template.sessions.length === 0) {
    return (
      <Card>
        <CardContent className="py-12 text-center text-sm text-[var(--muted-foreground)]">
          Modelo sem seções configuradas ainda.
        </CardContent>
      </Card>
    )
  }
  return (
    <div className="space-y-4">
      {template.sessions.map((section) => (
        <Card key={section.id}>
          <CardContent className="space-y-3 py-4">
            <header className="flex items-baseline justify-between gap-3 border-b border-[var(--border)]/60 pb-2">
              <h2 className="text-sm font-semibold">{section.title}</h2>
              {!section.isActive && (
                <span className="text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-300">
                  Inativa
                </span>
              )}
            </header>
            {section.description && (
              <p className="text-xs italic text-[var(--muted-foreground)]">
                {section.description}
              </p>
            )}
            {section.fields.length === 0 ? (
              <p className="text-xs text-[var(--muted-foreground)]">
                Seção sem perguntas.
              </p>
            ) : (
              <ul className="space-y-3">
                {section.fields
                  .filter((f) => f.isVisible)
                  .map((field) => (
                    <li key={field.id} className="space-y-1">
                      <FieldPreview field={field} />
                    </li>
                  ))}
              </ul>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}

function FieldPreview({
  field,
}: {
  field: AnamnesisTemplateWithStructureDTO['sessions'][number]['fields'][number]
}) {
  const label = (
    <label className="block text-xs font-medium">
      {field.label}
      {field.isRequired && (
        <span className="ml-1 text-rose-500">*</span>
      )}
      {!field.isActive && (
        <span className="ml-2 text-[10px] uppercase tracking-widest text-amber-600 dark:text-amber-300">
          desativada
        </span>
      )}
    </label>
  )
  const help =
    field.helpText && (
      <p className="text-[11px] text-[var(--muted-foreground)]">
        {field.helpText}
      </p>
    )

  switch (field.fieldType) {
    case 'text':
    case 'number':
    case 'date':
      return (
        <>
          {label}
          {help}
          <input
            type={field.fieldType === 'date' ? 'date' : field.fieldType === 'number' ? 'number' : 'text'}
            placeholder={field.placeholder ?? undefined}
            disabled
            className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-1.5 text-xs"
          />
        </>
      )
    case 'textarea':
      return (
        <>
          {label}
          {help}
          <textarea
            placeholder={field.placeholder ?? undefined}
            disabled
            rows={3}
            className="w-full rounded-md border border-[var(--border)] bg-[var(--muted)] px-2 py-1.5 text-xs"
          />
        </>
      )
    case 'boolean':
      return (
        <div className="flex items-center gap-2">
          <input type="checkbox" disabled />
          {label}
        </div>
      )
    case 'select':
    case 'multiselect':
      return (
        <>
          {label}
          {help}
          <ul className="ml-1 space-y-1">
            {field.options.length === 0 && (
              <li className="text-[11px] text-[var(--muted-foreground)]">
                Sem opções cadastradas.
              </li>
            )}
            {field.options.map((opt) => (
              <li key={opt.id} className="flex items-center gap-2 text-xs">
                <input
                  type={field.fieldType === 'multiselect' ? 'checkbox' : 'radio'}
                  disabled
                  name={`preview-${field.id}`}
                />
                <span>{opt.label}</span>
              </li>
            ))}
          </ul>
        </>
      )
    default:
      return (
        <>
          {label}
          {help}
          <p className="text-[11px] italic text-[var(--muted-foreground)]">
            Tipo "{field.fieldType}" · preview indisponível.
          </p>
        </>
      )
  }
}
