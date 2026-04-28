/**
 * Helper · injeta dados da clinica no system prompt da Lara.
 *
 * Sem isso a Lara alucina endereco/cidade/horario quando paciente pergunta
 * "Onde fica?", "Qual o whatsapp?", "Que horas abre?" (caso real do Alden:
 * Lara disse "Sao Paulo" quando a clinica fica em Maringa).
 *
 * Cache em memoria por 5min · clinic info muda raramente.
 */

import { ClinicRepository, type ClinicDTO } from '@clinicai/repositories'
import { createServerClient } from '@/lib/supabase'

interface CacheEntry {
  data: ClinicDTO | null
  expiresAt: number
}

const CACHE_TTL_MS = 5 * 60 * 1000
const cache = new Map<string, CacheEntry>()

export async function getClinicInfo(clinicId: string): Promise<ClinicDTO | null> {
  if (!clinicId) return null
  const cached = cache.get(clinicId)
  const now = Date.now()
  if (cached && cached.expiresAt > now) return cached.data

  try {
    const supabase = createServerClient()
    const repo = new ClinicRepository(supabase)
    const data = await repo.getById(clinicId)
    cache.set(clinicId, { data, expiresAt: now + CACHE_TTL_MS })
    return data
  } catch {
    return null
  }
}

const DAY_LABELS: Record<string, string> = {
  seg: 'Segunda',
  ter: 'Terça',
  qua: 'Quarta',
  qui: 'Quinta',
  sex: 'Sexta',
  sab: 'Sábado',
  dom: 'Domingo',
}

function formatAddress(c: ClinicDTO): string {
  const a = c.address
  if (!a) return ''
  const parts: string[] = []
  if (a.rua) parts.push(a.rua)
  if (a.num) parts.push(a.num)
  if (a.comp) parts.push(a.comp)
  if (a.bairro) parts.push(a.bairro)
  const cityState = [a.cidade, a.estado].filter(Boolean).join('/')
  if (cityState) parts.push(cityState)
  if (a.cep) parts.push(`CEP ${a.cep}`)
  return parts.join(', ')
}

function formatHours(c: ClinicDTO): string {
  const h = c.operatingHours
  if (!h) return ''
  const lines: string[] = []
  for (const day of ['seg', 'ter', 'qua', 'qui', 'sex', 'sab', 'dom'] as const) {
    const d = h[day]
    if (!d || !d.aberto) {
      lines.push(`${DAY_LABELS[day]}: fechado`)
      continue
    }
    const ranges: string[] = []
    if (d.manha?.ativo && d.manha?.inicio && d.manha?.fim) {
      ranges.push(`${d.manha.inicio}–${d.manha.fim}`)
    }
    if (d.tarde?.ativo && d.tarde?.inicio && d.tarde?.fim) {
      ranges.push(`${d.tarde.inicio}–${d.tarde.fim}`)
    }
    lines.push(`${DAY_LABELS[day]}: ${ranges.join(' e ') || 'fechado'}`)
  }
  return lines.join(' · ')
}

/**
 * Bloco "## Dados da clinica" pra injetar no system prompt.
 * Retorna string vazia se clinic_id ausente ou clinic nao encontrada.
 */
export async function buildClinicInfoBlock(clinicId: string | null): Promise<string> {
  if (!clinicId) return ''
  const c = await getClinicInfo(clinicId)
  if (!c) return ''

  const lines: string[] = ['## Dados reais da clínica (use SEMPRE quando paciente perguntar · NUNCA alucine)']
  lines.push(`- **Nome**: ${c.name}`)

  const addr = formatAddress(c)
  if (addr) lines.push(`- **Endereço**: ${addr}`)
  if (c.address?.maps) lines.push(`- **Maps**: ${c.address.maps}`)
  if (c.address?.cidade && c.address?.estado) {
    lines.push(`- **Cidade**: ${c.address.cidade}/${c.address.estado} (NÃO é São Paulo, NÃO é Rio · não invente outra cidade)`)
  }

  if (c.whatsapp) lines.push(`- **WhatsApp principal (exibição)**: ${c.whatsapp}`)
  if (c.phone) lines.push(`- **Telefone fixo**: ${c.phone}`)
  if (c.email) lines.push(`- **E-mail**: ${c.email}`)
  if (c.website) lines.push(`- **Site**: ${c.website}`)

  const hours = formatHours(c)
  if (hours) lines.push(`- **Horário de funcionamento**: ${hours}`)

  // Redes sociais SO pra Lara saber que existem · ela NAO PODE redirecionar
  // pacientes pra la (regra anti-redirect ja no prompt principal).
  // Listar serve pra ela responder "voces tem instagram?" com SIM e nome ·
  // mas continuar oferecendo a conversa aqui no WhatsApp.
  const socials: string[] = []
  if (c.social?.instagram) socials.push(`Instagram ${c.social.instagram}`)
  if (c.social?.tiktok) socials.push(`TikTok ${c.social.tiktok}`)
  if (c.social?.youtube) socials.push(`YouTube ${c.social.youtube}`)
  if (socials.length) {
    lines.push(`- **Redes** (apenas pra confirmar existência · NUNCA mande paciente pra lá): ${socials.join(' · ')}`)
  }

  return lines.join('\n')
}

export function invalidateClinicInfoCache(clinicId?: string) {
  if (clinicId) cache.delete(clinicId)
  else cache.clear()
}
