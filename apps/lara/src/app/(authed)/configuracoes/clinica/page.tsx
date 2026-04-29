/**
 * /configuracoes/clinica · redirect pra estrutura unificada.
 *
 * Rota legacy mantida pra preservar bookmarks/links externos. A pagina
 * canonica agora e /configuracoes?tab=clinic (espelha clinic-dashboard
 * page-settings-clinic com 8 abas internas).
 */

import { redirect } from 'next/navigation'

export default function RedirectClinicaPage() {
  redirect('/configuracoes?tab=clinic')
}
