/**
 * /configuracoes/usuarios/permissoes · redirect pra /configuracoes?tab=permissions.
 *
 * Rota legacy preservada pra bookmarks. Matriz unificada em /configuracoes.
 */

import { redirect } from 'next/navigation'

export default function RedirectPermissoesPage() {
  redirect('/configuracoes?tab=permissions')
}
