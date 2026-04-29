/**
 * /configuracoes/usuarios · redirect pra /configuracoes?tab=users.
 *
 * Rota legacy preservada pra bookmarks. UI unificada em /configuracoes
 * com 8 tabs (espelho clinic-dashboard).
 */

import { redirect } from 'next/navigation'

export default function RedirectUsuariosPage() {
  redirect('/configuracoes?tab=users')
}
