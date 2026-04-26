/**
 * /b2b/analytics-test · rota diagnostica.
 *
 * Bypassa toda a logica de /b2b/analytics. Renderiza apenas info de
 * deploy (commit hash via env) e ping basico. Se ESTA pagina abre 200
 * mas /b2b/analytics retorna 500, o bug esta no codigo da analytics page.
 * Se ESTA pagina TAMBEM da 500, o bug esta no layout pai ou middleware.
 *
 * DELETAR depois de debugar.
 */

import { loadMiraServerContext } from '@/lib/server-context'

export const dynamic = 'force-dynamic'

export default async function AnalyticsTest() {
  const now = new Date().toISOString()
  let ctxStatus = 'unknown'
  let userId: string | null = null
  try {
    const { ctx } = await loadMiraServerContext()
    ctxStatus = 'ok'
    userId = ctx.user_id ?? ctx.clinic_id
  } catch (e) {
    ctxStatus = `throw: ${e instanceof Error ? e.message : String(e)}`
  }

  return (
    <main className="flex-1 p-6 bg-[#0F0D0A] text-[#F5F0E8]">
      <div className="max-w-[760px] mx-auto rounded-lg border border-[#10B981]/30 bg-[#10B981]/8 p-5 flex flex-col gap-2">
        <h2 className="text-[#10B981] text-lg font-bold">✓ Analytics-test renderizou OK</h2>
        <pre className="text-[11px] font-mono whitespace-pre-wrap leading-relaxed">
{`route        : /b2b/analytics-test
generated_at : ${now}
deploy_sha   : ${process.env.VERCEL_GIT_COMMIT_SHA ?? '— (env nao injetada)'}
deploy_env   : ${process.env.VERCEL_ENV ?? '— (env nao injetada)'}
node_env     : ${process.env.NODE_ENV ?? '— (env nao injetada)'}
ctxStatus    : ${ctxStatus}
ctx_id       : ${userId ?? '—'}`}
        </pre>
        <p className="text-[11px] text-[#9CA3AF] mt-2">
          Se este card aparece, o middleware + (authed) layout + b2b layout
          estao todos saudaveis. O 500 em /b2b/analytics esta especificamente
          no page.tsx ou layout daquele segmento.
        </p>
      </div>
    </main>
  )
}
