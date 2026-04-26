import { loadMiraServerContext } from '@/lib/server-context'
import { PadroesClient } from './PadroesClient'

export const dynamic = 'force-dynamic'

export default async function ConfigPadroesPage() {
  const { repos } = await loadMiraServerContext()
  const [combos, defaults] = await Promise.all([
    repos.b2bVoucherCombos.list().catch(() => []),
    repos.b2bClinicDefaults.get().catch(() => ({ ok: false, defaults: {} as Record<string, unknown> })),
  ])

  return (
    <PadroesClient
      initialCombos={combos.map((c) => ({
        id: c.id,
        label: c.label,
        description: c.description,
        is_default: c.isDefault,
        is_active: c.isActive,
        sort_order: c.sortOrder,
      }))}
      initialDefaults={(defaults && defaults.defaults) || {}}
    />
  )
}
