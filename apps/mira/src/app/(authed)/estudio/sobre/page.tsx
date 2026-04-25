/**
 * /estudio/sobre · snapshot do sistema · health + metadata.
 *
 * Server-rendered, read-only · agrega contadores das tabelas-chave pra
 * confirmar saude operacional do sistema (queue/cron/parcerias).
 */

import { Activity, Database, Cpu, GitBranch } from 'lucide-react'
import { loadMiraServerContext } from '@/lib/server-context'

export const dynamic = 'force-dynamic'

export default async function SobrePage() {
  const { ctx, repos } = await loadMiraServerContext()

  // Contadores em paralelo · best-effort · 0 se RPC nao disponivel
  const [activePartners, allPartners, conversations, todayCost] = await Promise.all([
    repos.b2bPartnerships.list(ctx.clinic_id, { status: 'active' }).catch(() => []),
    repos.b2bPartnerships.list(ctx.clinic_id, {}).catch(() => []),
    repos.conversations.listByStatus(ctx.clinic_id, 'active').catch(() => []),
    repos.budget.getTodayCost(ctx.clinic_id).catch(() => 0),
  ])

  return (
    <main className="flex-1 overflow-y-auto custom-scrollbar bg-[hsl(var(--chat-bg))]">
      <div className="max-w-[820px] mx-auto px-6 py-6 flex flex-col gap-5">
        <div className="pb-2 border-b border-white/8">
          <span className="eyebrow text-[#C9A96E]">Estúdio · Sobre</span>
          <h1 className="font-display text-2xl text-[#F5F0E8] mt-1">Snapshot do sistema</h1>
          <p className="text-[11px] text-[#9CA3AF] mt-1">
            Estado operacional resumido · use pra checar saúde antes de uma reunião.
          </p>
        </div>

        {/* Contadores */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <KpiCard
            icon={<Database className="w-4 h-4" />}
            label="Parcerias ativas"
            value={activePartners.length}
            sub={`de ${allPartners.length} total`}
            accent="#C9A96E"
          />
          <KpiCard
            icon={<Activity className="w-4 h-4" />}
            label="Conversas ativas"
            value={conversations.length}
            sub={`com IA: ${conversations.filter((c) => c.aiEnabled).length}`}
            accent="#10B981"
          />
          <KpiCard
            icon={<Cpu className="w-4 h-4" />}
            label="Custo IA hoje"
            value={`$${todayCost.toFixed(2)}`}
            sub="acumulado em USD"
            accent="#F59E0B"
          />
          <KpiCard
            icon={<GitBranch className="w-4 h-4" />}
            label="App version"
            value="v0.1"
            sub="Mira clinicai-v2"
            accent="#9CA3AF"
          />
        </section>

        {/* Identidade */}
        <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-2">
          <span className="eyebrow text-[#9CA3AF]">Identidade</span>
          <KV k="App" v="@clinicai/mira" mono />
          <KV k="Clinic ID" v={ctx.clinic_id} mono />
          <KV k="Role" v={ctx.role || '—'} />
          <KV k="User ID" v={ctx.user_id || '—'} mono />
        </section>

        {/* Stack */}
        <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-2">
          <span className="eyebrow text-[#9CA3AF]">Stack</span>
          <KV k="Framework" v="Next.js 16 · React 19 · Tailwind 4" />
          <KV k="Banco" v="Supabase (Postgres pooler)" />
          <KV k="WhatsApp" v="Evolution API · instance mira-mirian" />
          <KV k="IA" v="Anthropic Claude · Sonnet 4.6 · Haiku 4.5" />
          <KV k="Voz" v="Groq Whisper" />
          <KV k="Cron" v="GitHub Actions + Easypanel mira-cron (node-cron)" />
          <KV k="Alertas" v="Slack incoming webhook (Sentry pulado)" />
        </section>

        {/* Links uteis */}
        <section className="rounded-lg border border-white/10 bg-white/[0.02] p-4 flex flex-col gap-2">
          <span className="eyebrow text-[#9CA3AF]">Links úteis</span>
          <Linkable label="Painel CRM (legado)" href="https://painel.miriandpaula.com.br" />
          <Linkable label="GitHub clinicai-v2" href="https://github.com/AldenQuesada/clinicai-v2" />
          <Linkable label="Easypanel" href="https://px1hdq.easypanel.host" />
          <Linkable label="Supabase" href="https://supabase.com/dashboard" />
        </section>
      </div>
    </main>
  )
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  accent,
}: {
  icon: React.ReactNode
  label: string
  value: number | string
  sub: string
  accent: string
}) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.02] p-3">
      <div className="flex items-center gap-2" style={{ color: accent }}>
        {icon}
        <span className="eyebrow" style={{ color: accent }}>
          {label}
        </span>
      </div>
      <div className="font-display text-3xl leading-none mt-2" style={{ color: accent }}>
        {value}
      </div>
      <div className="text-[10px] text-[#6B7280] mt-1">{sub}</div>
    </div>
  )
}

function KV({ k, v, mono }: { k: string; v: string; mono?: boolean }) {
  return (
    <div className="flex items-start gap-3 text-[11.5px]">
      <span className="text-[#6B7280] w-24 shrink-0">{k}</span>
      <span className={`text-[#F5F0E8] flex-1 break-all ${mono ? 'font-mono text-[11px]' : ''}`}>
        {v}
      </span>
    </div>
  )
}

function Linkable({ label, href }: { label: string; href: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="flex items-start gap-3 text-[11.5px] hover:text-[#C9A96E] transition-colors"
    >
      <span className="text-[#6B7280] w-24 shrink-0">{label}</span>
      <span className="text-[#9CA3AF] flex-1 font-mono text-[11px] truncate hover:text-[#C9A96E]">
        {href}
      </span>
    </a>
  )
}
