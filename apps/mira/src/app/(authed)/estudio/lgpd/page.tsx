/**
 * /estudio/lgpd · DEPRECATED 2026-04-26.
 * Fundido com Sobre em /b2b/config/meta (2 blocos lado a lado).
 *
 * actions.ts mantido · LgpdSection (em b2b/config/meta) importa
 * anonymizePartnershipAction direto (zero duplicacao de codigo).
 */

import { redirect } from 'next/navigation'

export const dynamic = 'force-dynamic'

export default function LgpdPage() {
  redirect('/b2b/config/meta')
}
