/**
 * /estudio/cadastrar · wizard 3-step pra cadastrar parceria.
 *
 * Server component magro · so renderiza header + WizardClient.
 * Toda interatividade (steps, validacao, submit) acontece no client.
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { WizardClient } from './WizardClient'

export const dynamic = 'force-dynamic'

export default function CadastrarPartnershipPage() {
  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[720px] mx-auto px-6 py-6 flex flex-col gap-4">
        <div className="flex items-center justify-between pb-2 border-b border-white/10">
          <div className="flex items-center gap-3">
            <Link
              href="/partnerships"
              className="p-1 rounded text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5 transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </Link>
            <div>
              <span className="eyebrow text-[#C9A96E]">Estúdio · Cadastro</span>
              <h1 className="font-display text-xl text-[#F5F0E8] mt-0.5">Cadastrar parceria</h1>
              <p className="text-[11px] text-[#9CA3AF] mt-0.5">
                3 passos · Identidade · Operação · Detalhes. Status inicial: prospect.
              </p>
            </div>
          </div>
        </div>

        <WizardClient />
      </div>
    </main>
  )
}
