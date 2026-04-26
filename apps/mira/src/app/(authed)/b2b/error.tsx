'use client'

/**
 * Error boundary parent do segmento /b2b/* · captura crashes de layouts
 * filhos (analytics/layout.tsx, etc) que escapam do error.tsx do proprio
 * segmento (boundary nao captura layout do mesmo nivel).
 *
 * Quando estavel · DELETAR junto com analytics/error.tsx.
 */

export default function B2BError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <main className="flex-1 overflow-y-auto bg-[hsl(var(--chat-bg))] p-6">
      <div className="max-w-[760px] mx-auto rounded-lg border border-[#EF4444]/40 bg-[#EF4444]/8 p-5 flex flex-col gap-3">
        <h2 className="text-[#FCA5A5] text-lg font-bold">⚠ Erro no módulo B2B</h2>
        <p className="text-[#F5F0E8] text-sm">
          Server Component crashou (provavelmente em layout/page filho).
          Procure este digest nos Runtime Logs do Vercel.
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
            href="/dashboard"
            className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-[1px] border border-white/10 text-[#9CA3AF] hover:text-[#F5F0E8]"
          >
            Voltar ao dashboard
          </a>
        </div>
      </div>
    </main>
  )
}
