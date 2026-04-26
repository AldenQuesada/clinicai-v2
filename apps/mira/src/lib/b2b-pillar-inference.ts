/**
 * b2b-pillar-inference · helpers puros pra auto-enriquecer o form de cadastro.
 * Port 1:1 do `js/b2b/b2b.pillar-inference.js` do clinic-dashboard.
 *
 * - inferPillar(name)        → pillar sugerido por keyword
 * - inferType(pillar)        → tipo default por pillar
 * - pickComboForPillar(...)  → melhor combo default pra um pillar
 */

export const PILLARS = [
  'imagem', 'evento', 'institucional', 'fitness',
  'alimentacao', 'saude', 'status', 'rede', 'outros',
] as const
export type Pillar = (typeof PILLARS)[number]

export const PILLAR_LABELS: Record<Pillar, string> = {
  imagem: 'Imagem / Estética',
  evento: 'Evento / Ocasião',
  institucional: 'Institucional',
  fitness: 'Fitness / Esporte',
  alimentacao: 'Alimentação',
  saude: 'Saúde',
  status: 'Status / Premium',
  rede: 'Rede / Comunidade',
  outros: 'Outros',
}

export const TYPES = ['transactional', 'occasion', 'institutional'] as const
export const TYPE_OPTIONS = [
  { value: 'transactional', label: 'Transacional' },
  { value: 'occasion', label: 'Ocasião' },
  { value: 'institutional', label: 'Institucional' },
] as const

export const STATUSES = [
  'prospect', 'dna_check', 'contract', 'active', 'review', 'paused', 'closed',
] as const

export const PILLAR_CATEGORIES: Record<Pillar, string[]> = {
  imagem: [
    'apresentadora_tv', 'influenciadora', 'jornalista', 'consultora_moda',
    'loja_roupa_festa', 'loja_roupa_casual', 'boutique_premium',
    'semi_joias', 'joias_finas', 'bolsas', 'lingerie', 'acessorios_moda',
    'calcados', 'otica_premium',
    'maquiagem', 'salao_beleza', 'escova_express', 'cabelereira',
    'unhas', 'personal_stylist',
    'perfumaria_nicho',
    'mentoria_comunicacao', 'mentoria_curadoria_imagem',
  ],
  evento: [
    'celebrante', 'fotografia_casamento', 'cerimonialista',
    'buffet', 'decoracao_eventos', 'espaco_eventos',
    'bolo_festa', 'florista', 'dj_musico', 'convites',
    'mestre_cerimonia', 'video_eventos',
  ],
  institucional: [
    'clube_social', 'mentora_autoridade', 'associacao_empresarial',
    'acim', 'lide_feminino', 'rotary_lion', 'fundacao',
    'ong_causa', 'conselho_feminino',
  ],
  fitness: [
    'academia', 'personal_trainer', 'pilates', 'yoga',
    'crossfit', 'danca', 'natacao', 'funcional',
    'esporte_outdoor', 'luta_marcial',
  ],
  alimentacao: [
    'restaurante_gourmet', 'bistro', 'cafeteria',
    'padaria_artesanal', 'confeitaria', 'sorveteria',
    'emporio_saudavel', 'delivery_premium', 'chef_privado',
    'vinho_bebidas',
  ],
  saude: [
    'nutricionista', 'psicologa', 'terapeuta_integrativa',
    'acupunturista', 'fisioterapeuta', 'pediatra',
    'ginecologista', 'dentista', 'quiropraxia', 'coach_saude',
  ],
  status: [
    'hotel_boutique', 'spa_day', 'resort', 'restaurante_estrelado',
    'concessionaria_premium', 'joalheria_alto_luxo',
    'imobiliaria_alto_padrao', 'viagem_experiencia',
    'experiencia_privada',
  ],
  rede: [
    'confraria_feminina', 'mentoria_grupal', 'podcast',
    'curso_feminino', 'retiros', 'comunidade_empreendedoras',
    'influencer_local', 'networking',
  ],
  outros: [],
}

export function categoriesForPillar(pillar: string | null | undefined): string[] {
  if (!pillar || !(pillar in PILLAR_CATEGORIES)) return []
  return PILLAR_CATEGORIES[pillar as Pillar].slice()
}

const PILLAR_PATTERNS: { pillar: Pillar; re: RegExp }[] = [
  { pillar: 'status', re: /\b(hotel\s*boutique|spa\s*day|resort|estrelado|joalheria\s*(alta|alto|luxo)|imobiliaria\s*(alto|premium)|viagem\s*experiencia|concessionaria\s*premium)/i },
  { pillar: 'evento', re: /\b(buffet|casamento|cerimonial|noiv|decora[cç][aã]o|florist|dj\b|bolo\s*(festa|casamento)|celebrante|mestre\s*cerim|fotogr\w*\s*casamento|convite)/i },
  { pillar: 'institucional', re: /\b(acim|rotary|lion|fundac|ong|conselho|lide|associa[cç][aã]o|clube\s*social)/i },
  { pillar: 'fitness', re: /\b(academ|crossfit|pilates|yoga|personal\b|dan[cç]a|nata[cç][aã]o|fitness|muscula[cç][aã]o|luta|funcional|outdoor|trilha)/i },
  { pillar: 'alimentacao', re: /\b(restaurant|bistr[oô]|cafeteria|padaria|confeit|sorveter|emporio|delivery|chef\b|vinho|bebid)/i },
  { pillar: 'saude', re: /\b(nutricion|psic[oó]lo|terape|acupuntur|fisio|pediatr|dentist|ginec|quiropra|coach\s*saude)/i },
  { pillar: 'rede', re: /\b(confrar|mentori|podcast|retir[oa]|comunidade|networking|influencer)/i },
  { pillar: 'imagem', re: /\b(consultor|stylist|moda|maquiag|sal[aã]o|cabele|j[oó]ia|semi-?joia|bolsa|lingerie|calca|[oó]tica|perfum|escov\w*|unh\w*|boutique|ateli|loja\s*(de\s*)?(roupa|festa))/i },
]

const PILLAR_TO_TYPE: Record<string, string> = {
  imagem: 'transactional',
  status: 'transactional',
  fitness: 'transactional',
  saude: 'transactional',
  alimentacao: 'occasion',
  evento: 'occasion',
  institucional: 'institutional',
  rede: 'institutional',
  outros: 'transactional',
}

export function inferPillar(name: string): Pillar | null {
  const n = String(name || '').trim()
  if (n.length < 3) return null
  for (const { pillar, re } of PILLAR_PATTERNS) {
    if (re.test(n)) return pillar
  }
  return null
}

export function inferType(pillar: string | null | undefined): string {
  if (!pillar) return 'transactional'
  return PILLAR_TO_TYPE[pillar] || 'transactional'
}

export function pickComboForPillar(
  pillar: string | null | undefined,
  combos: Array<{ label: string; isActive?: boolean; isDefault?: boolean }>,
): string | null {
  if (!Array.isArray(combos) || !combos.length) return null
  const active = combos.filter((c) => c.isActive !== false)
  if (!active.length) return null
  if (pillar) {
    const p = pillar.toLowerCase()
    const m = active.find((c) => String(c.label || '').toLowerCase().indexOf(p) !== -1)
    if (m) return m.label
  }
  const def = active.find((c) => c.isDefault)
  if (def) return def.label
  return active[0].label
}

export function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}
