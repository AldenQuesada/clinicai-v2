/**
 * /b2b/config/sobre · DEPRECATED 2026-04-26.
 * Fundido com LGPD em /b2b/config/meta (2 blocos lado a lado).
 *
 * SobreLoadedAt mantido · SobreSection (em b2b/config/meta) importa
 * o Client Component direto (zero duplicacao de codigo).
 */

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function ConfigSobrePage() {
  redirect('/b2b/config/meta')
}
