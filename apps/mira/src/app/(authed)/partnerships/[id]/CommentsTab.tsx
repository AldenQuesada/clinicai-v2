/**
 * Partnership detail · tab "Comentarios" · espelho 1:1 de `b2b-comments.ui.js`.
 *
 * Server Component carrega lista · CommentsClient cuida do form + delete +
 * mention highlight. Comentarios aceitam markdown leve (mentions @x).
 */

import { loadMiraServerContext } from '@/lib/server-context'
import { CommentsClient } from './CommentsClient'

export async function CommentsTab({
  partnershipId,
  canManage,
}: {
  partnershipId: string
  canManage: boolean
}) {
  const { repos } = await loadMiraServerContext()
  const items = await repos.b2bComments.list(partnershipId).catch(() => [])
  return (
    <CommentsClient
      partnershipId={partnershipId}
      initialItems={items}
      canDelete={canManage}
    />
  )
}
