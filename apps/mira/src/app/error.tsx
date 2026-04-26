'use client'

/**
 * Root error boundary · captura crashes de TODA a arvore (authed)/* incluindo
 * AppHeader e (authed)/layout. Sem isso, qualquer throw nesses files cai no
 * 500 default do NextJS sem exposicao de digest.
 *
 * Quando estavel · DELETAR (junto com b2b/error.tsx + b2b/analytics/error.tsx).
 */

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex-1 overflow-y-auto p-6 bg-[#0F0D0A]">
      <div className="max-w-[760px] mx-auto rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/8 p-5 flex flex-col gap-3 text-[#F5F0E8]">
        <h2 className="text-[#FCA5A5] text-lg font-bold">⚠ Erro no Mira (root)</h2>
        <p className="text-sm">
          Server Component crashou em algum nível acima do segmento. Procure este
          digest nos Runtime Logs do Vercel pra ver a stack trace completa.
        </p>
        <div className="rounded border border-white/10 bg-black/30 px-3 py-2 font-mono text-xs">
          <div className="text-[#9CA3AF]">digest:</div>
          <div className="text-[#FCD34D] break-all">{error.digest || '— (sem digest)'}</div>
          {error.message && (
            <>
              <div className="text-[#9CA3AF] mt-2">message (dev only):</div>
              <div className="text-[#F5F0E8] whitespace-pre-wrap">{error.message}</div>
            </>
          )}
        </div>
        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={reset}
            className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-[1px] bg-[#C9A96E] text-[#1A1814] hover:bg-[#D4B785]"
          >
            Tentar de novo
          </button>
          <a
            href="/login"
            className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-[1px] border border-white/10 text-[#9CA3AF] hover:text-[#F5F0E8]"
          >
            Re-login
          </a>
        </div>
      </div>
    </main>
  )
}
