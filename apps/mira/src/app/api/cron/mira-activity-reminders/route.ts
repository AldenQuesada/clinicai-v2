/**
 * Cron: mira-activity-reminders.
 *
 * Schedule: 09h SP diario (cron `0 12 * * *` UTC).
 *
 * Pra cada parceria com b2b_partnership_activities pendente vencendo
 * HOJE ou AMANHA, agrupa numa unica mensagem ao admin (Mirian) listando
 * o que precisa ser feito. Evita N mensagens · 1 digest por dia.
 *
 * Mig 800-34 criou b2b_partnership_activities · esta cron e o consumer.
 *
 * Best-effort: erro em uma parceria nao bloqueia o resto. Audit em
 * b2b_comm_dispatch_log via repos.waProAudit.logDispatch.
 */

import { NextRequest } from 'next/server'
import { runCron } from '@/lib/cron'
import { dispatchAdminText } from '@/lib/admin-dispatch'

export const dynamic = 'force-dynamic'

const KIND_LABELS: Record<string, string> = {
  monthly_meeting: 'Reuniao mensal',
  content_post: 'Post de conteudo',
  event: 'Evento',
  voucher_review: 'Revisao de combos',
  training: 'Capacitacao',
  feedback_session: 'Coleta de feedback',
  custom: 'Atividade',
}

interface DueActivityRow {
  id: string
  partnership_id: string
  kind: string
  title: string
  due_date: string
  responsible: string | null
  partnership_name: string | null
}

function fmtDueLabel(dueDate: string, todayIso: string): string {
  if (dueDate === todayIso) return 'hoje'
  return 'amanha'
}

export async function GET(req: NextRequest) {
  return runCron(
    req,
    'mira-activity-reminders',
    async ({ supabase, repos, clinicId }) => {
      const today = new Date()
      const todayIso = today.toISOString().slice(0, 10)
      const tomorrow = new Date(today.getTime() + 86_400_000)
      const tomorrowIso = tomorrow.toISOString().slice(0, 10)

      // Activities pending vencendo hoje ou amanha · join em partnerships
      // pra pegar o name (mostrado no digest).
      const { data, error } = await supabase
        .from('b2b_partnership_activities')
        .select(
          `id, partnership_id, kind, title, due_date, responsible,
           partnership:b2b_partnerships!inner(name)`,
        )
        .eq('clinic_id', clinicId)
        .eq('status', 'pending')
        .gte('due_date', todayIso)
        .lte('due_date', tomorrowIso)
        .order('due_date', { ascending: true })

      if (error) {
        throw new Error(`activities query falhou: ${error.message}`)
      }

      const rows = (data ?? []).map((r: Record<string, unknown>) => ({
        id: String(r.id),
        partnership_id: String(r.partnership_id),
        kind: String(r.kind ?? 'custom'),
        title: String(r.title ?? ''),
        due_date: String(r.due_date ?? ''),
        responsible: r.responsible ? String(r.responsible) : null,
        partnership_name:
          (r.partnership as { name?: string } | null)?.name ?? null,
      })) as DueActivityRow[]

      if (rows.length === 0) {
        return { activities: 0, dispatched: { recipients: 0, sent: 0, failed: 0 } }
      }

      // Agrupa por parceria · 1 secao por partnership no digest
      const byPartner = new Map<string, DueActivityRow[]>()
      for (const r of rows) {
        const key = r.partnership_name || r.partnership_id
        const arr = byPartner.get(key) ?? []
        arr.push(r)
        byPartner.set(key, arr)
      }

      const lines: string[] = []
      lines.push(`📋 *Atividades de parcerias* · proximas 48h`)
      lines.push('')
      for (const [partnerName, activities] of byPartner) {
        lines.push(`*${partnerName}*`)
        for (const a of activities) {
          const dueLabel = fmtDueLabel(a.due_date, todayIso)
          const kindLabel = KIND_LABELS[a.kind] ?? KIND_LABELS.custom
          const respMark = a.responsible === 'partner' ? ' (parceira)' : ''
          lines.push(`  • ${kindLabel}${respMark}: ${a.title} · *${dueLabel}*`)
        }
        lines.push('')
      }
      lines.push(`Total: ${rows.length} atividade${rows.length > 1 ? 's' : ''}`)

      const text = lines.join('\n')

      const dispatch = await dispatchAdminText({
        supabase,
        repos,
        clinicId,
        eventKey: 'mira.cron.activity_reminders',
        text,
        category: 'b2b',
        msgKey: 'b2b.activity_due',
      })

      return {
        activities: rows.length,
        partnerships: byPartner.size,
        dispatched: dispatch,
      }
    },
  )
}
