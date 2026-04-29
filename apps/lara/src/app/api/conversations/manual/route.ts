/**
 * POST /api/conversations/manual
 *
 * Inicia conversa manual com um lead novo ou existente · busca/cria
 * lead por phone, busca/cria conversation. Usado pelo botao "Nova
 * conversa" no header da lista de conversas.
 *
 * Body: { phone: string, name?: string }
 * Returns: { ok: boolean, conversation_id?: string, lead_id?: string, error?: string }
 */

import { NextResponse, type NextRequest } from 'next/server'
import { loadServerReposContext } from '@/lib/repos'

/** Normaliza phone pra digits-only · garante prefixo 55 BR. */
function normalizePhone(raw: string): string {
  const digits = (raw || '').replace(/\D/g, '')
  if (!digits) return ''
  // Ja tem 55 + DDD (11+ digits) → mantem
  if (digits.length >= 12 && digits.startsWith('55')) return digits
  // 11 digits = DDD + 9 + 8 → adiciona 55
  if (digits.length === 11 || digits.length === 10) return `55${digits}`
  // Caso ambiguo · retorna como esta · variantes vao tentar
  return digits
}

/** Gera variantes pra lookup tolerante (com/sem 55, com/sem 9 do nono). */
function phoneVariants(normalized: string): string[] {
  const set = new Set<string>([normalized])
  if (!normalized) return []
  // Sem prefixo 55
  if (normalized.startsWith('55') && normalized.length >= 12) {
    const without55 = normalized.slice(2)
    set.add(without55)
    // Sem nono digito (apos DDD) · BR celular tem 9 prefix
    if (without55.length === 11 && without55[2] === '9') {
      set.add(without55.slice(0, 2) + without55.slice(3))
      // E com 55 mas sem 9
      set.add('55' + without55.slice(0, 2) + without55.slice(3))
    }
    // Com 9 caso falte
    if (without55.length === 10) {
      const with9 = without55.slice(0, 2) + '9' + without55.slice(2)
      set.add(with9)
      set.add('55' + with9)
    }
  }
  return Array.from(set)
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const phoneRaw = String(body.phone || '').trim()
    const nameRaw = String(body.name || '').trim()

    if (!phoneRaw) {
      return NextResponse.json({ ok: false, error: 'phone obrigatorio' }, { status: 400 })
    }

    const phone = normalizePhone(phoneRaw)
    if (phone.length < 10) {
      return NextResponse.json(
        { ok: false, error: 'phone invalido · esperado +55 DDD numero' },
        { status: 400 },
      )
    }

    const { ctx, repos } = await loadServerReposContext()
    const variants = phoneVariants(phone)

    // 1. Buscar lead existente
    let lead = await repos.leads.findByPhoneVariants(ctx.clinic_id, variants)

    // 2. Se nao acha · criar
    if (!lead) {
      lead = await repos.leads.create(ctx.clinic_id, {
        name: nameRaw || null,
        phone,
        source: 'manual',
      })
      if (!lead) {
        return NextResponse.json(
          { ok: false, error: 'falha_criar_lead' },
          { status: 500 },
        )
      }
    } else if (nameRaw && !lead.name) {
      // Lead existe mas sem nome · atualiza com o nome digitado
      try {
        await repos.leads.update(lead.id, { name: nameRaw })
      } catch {
        // Best-effort · nao falha o flow se update der ruim
      }
    }

    // 3. Buscar conversa existente (active/paused) por phone variants
    let conv = await repos.conversations.findActiveByPhoneVariants(
      ctx.clinic_id,
      variants,
    )

    // 4. Se nao acha · criar
    if (!conv) {
      conv = await repos.conversations.create(ctx.clinic_id, {
        leadId: lead.id,
        phone,
        displayName: lead.name ?? nameRaw ?? null,
        status: 'active',
        aiEnabled: true,
      })
      if (!conv) {
        return NextResponse.json(
          { ok: false, error: 'falha_criar_conversa' },
          { status: 500 },
        )
      }
    }

    return NextResponse.json({
      ok: true,
      conversation_id: conv.id,
      lead_id: lead.id,
    })
  } catch (e) {
    console.error('[/api/conversations/manual] failed:', (e as Error).message)
    return NextResponse.json(
      { ok: false, error: (e as Error).message || 'internal_error' },
      { status: 500 },
    )
  }
}
