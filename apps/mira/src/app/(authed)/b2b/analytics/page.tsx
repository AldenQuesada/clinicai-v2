/**
 * /b2b/analytics · MODO DIAGNOSTICO MINIMO 2026-04-26
 *
 * TODA logica original de Visao Geral comentada e substituida por um
 * server component que fetcha o RPC e renderiza JSON inline. Se ESTA
 * versao crasha, o bug nao esta no codigo do view (foi todo removido) ·
 * esta no fetch ou em algo acima.
 *
 * Restaurar versao real depois de confirmar que o RPC fetch funciona.
 */

import { loadMiraServerContext } from '@/lib/server-context'

export const dynamic = 'force-dynamic'

export default async function AnalyticsOverviewPage() {
  const stamp = new Date().toISOString()

  let stage = 'init'
  let result: unknown = null
  let errMsg: string | null = null

  try {
    stage = 'load-ctx'
    const { repos, ctx } = await loadMiraServerContext()
    stage = `ctx-ok clinic_id=${ctx.clinic_id}`

    stage = 'rpc-call'
    result = await repos.b2bAnalytics.get(30).catch((e) => {
      errMsg = e instanceof Error ? e.message : String(e)
      return null
    })
    stage = `rpc-${result ? 'ok' : 'null-with-catch'}`
  } catch (e) {
    errMsg = e instanceof Error ? e.message : String(e)
    stage = `THROW at ${stage}`
  }

  return (
    <main style={{ padding: 24, background: '#0F0D0A', color: '#F5F0E8', minHeight: '100%' }}>
      <h1 style={{ color: '#C9A96E', fontSize: 22, marginBottom: 12 }}>
        🔧 Analytics · DIAGNOSTIC MODE
      </h1>
      <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 16 }}>
        Visao geral original removida temporariamente. Quando este card aparece,
        o segmento /b2b/analytics renderiza OK; bug do 500 estava em ObjectivesView
        ou no fetch · log abaixo identifica.
      </p>
      <pre
        style={{
          background: 'rgba(0,0,0,0.5)',
          border: '1px solid rgba(201,169,110,0.3)',
          padding: 12,
          borderRadius: 6,
          fontSize: 12,
          fontFamily: 'ui-monospace, monospace',
          whiteSpace: 'pre-wrap',
          maxHeight: 600,
          overflow: 'auto',
        }}
      >
{`generated_at : ${stamp}
stage        : ${stage}
errMsg       : ${errMsg ?? '— (no err)'}
result       : ${result ? JSON.stringify(result, null, 2) : 'null'}`}
      </pre>
    </main>
  )
}
