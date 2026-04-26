'use client'

/**
 * AppSubtabs · faixa horizontal de sub-tabs da section ativa.
 *
 * Substitui a "linha 3" do AppNav antigo · mas agora ocupa toda a largura
 * do conteudo (sidebar fica fora do flow). Render eyebrow champagne + chips
 * com count opcional, identico ao AppNav original (preservado 1:1).
 *
 * Detecta section + subtab ativos via usePathname()/useSearchParams() —
 * mesma logica do AppNav antigo para manter active state pixel-perfect.
 *
 * Edge case · se a section ativa nao tem nenhum sub-tab (raro · nenhuma
 * tem hoje, mas defensivo), renderiza barra vazia mas mantendo a altura
 * pra layout nao "pular".
 */

import Link from 'next/link'
import { usePathname, useSearchParams } from 'next/navigation'
import {
  SECTIONS,
  detectActiveSection,
  detectActiveSubtab,
  countForHref,
  type SubTab,
  type SubtabCounts,
} from './nav/sections'

export function AppSubtabs({ counts = {} }: { counts?: SubtabCounts }) {
  const pathname = usePathname() || '/dashboard'
  const searchParams = useSearchParams()
  const searchString = searchParams ? searchParams.toString() : ''

  const activeSection = detectActiveSection(pathname)
  const activeSubtab = detectActiveSubtab(pathname, searchString, activeSection)

  // Garante section.key existe (defensivo · sempre encontrado pq fallback)
  const section = SECTIONS.find((s) => s.key === activeSection.key) ?? SECTIONS[0]

  return (
    <div
      className="shrink-0 h-9 flex items-center px-5 border-b border-[#C9A96E]/15 bg-[#0F0D0A] overflow-x-auto custom-scrollbar"
      role="navigation"
      aria-label={`Sub-navegação de ${section.label}`}
    >
      {section.subtabGroups ? (
        <nav className="flex items-center gap-3">
          {section.subtabGroups.map((group, gi) => (
            <span key={group.groupLabel} className="flex items-center gap-1">
              {gi > 0 && (
                <span
                  className="mx-2 h-4 w-px bg-[#C9A96E]/20 shrink-0"
                  aria-hidden="true"
                />
              )}
              <span
                className="text-[9px] uppercase font-semibold text-[#C9A96E]/70 mr-2 shrink-0"
                style={{ letterSpacing: '2px' }}
              >
                {group.groupLabel}
              </span>
              {group.subtabs.map((t) => (
                <SubLink
                  key={t.href}
                  tab={t}
                  active={activeSubtab?.href === t.href}
                  count={countForHref(t.href, counts)}
                />
              ))}
            </span>
          ))}
        </nav>
      ) : (
        <nav className="flex items-center gap-1">
          {(section.subtabs ?? []).map((t) => (
            <SubLink
              key={t.href}
              tab={t}
              active={activeSubtab?.href === t.href}
              count={countForHref(t.href, counts)}
            />
          ))}
        </nav>
      )}
    </div>
  )
}

function SubLink({
  tab,
  active,
  count,
}: {
  tab: SubTab
  active: boolean
  count?: number
}) {
  if (!tab.available) {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[11px] text-[#6B7280] cursor-not-allowed"
        title="Em breve"
      >
        {tab.label}
        <span className="text-[8px] uppercase tracking-[1px] px-1 py-px rounded bg-white/5 text-[#6B7280]">
          em breve
        </span>
      </span>
    )
  }
  return (
    <Link
      href={tab.href}
      aria-current={active ? 'page' : undefined}
      className={`px-2.5 py-1 rounded text-[11px] font-medium transition-colors ${
        active
          ? 'text-[#C9A96E] border-b-2 border-[#C9A96E] rounded-none'
          : 'text-[#9CA3AF] hover:text-[#F5F0E8] hover:bg-white/5'
      }`}
    >
      {tab.label}
      {typeof count === 'number' && count > 0 ? (
        <span className="ml-1 text-[#C9A96E] opacity-80">· {count}</span>
      ) : null}
    </Link>
  )
}
