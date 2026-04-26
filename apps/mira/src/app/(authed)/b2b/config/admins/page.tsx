import { loadMiraServerContext } from '@/lib/server-context'
import { AdminsClient } from './AdminsClient'

export const dynamic = 'force-dynamic'

export default async function ConfigAdminsPage() {
  const { repos } = await loadMiraServerContext()
  const rows = await repos.b2bAdminPhones.list().catch(() => [])
  return <AdminsClient initial={rows} />
}
