/**
 * Copiloto AI · /conversas Sprint B (2026-04-29).
 *
 * 3 features compartilhando 1 chamada Anthropic (Opus 4.7):
 *   - summary: TLDR de 1 linha do lead
 *   - next_actions: 3 acoes sugeridas pro atendente
 *   - smart_replies: 3 chips clicaveis pra responder o paciente
 *
 * Estrategia:
 *   - Modelo: Opus 4.7 (max capability · skill claude-api default)
 *   - Thinking: adaptive (Claude decide profundidade · efficient)
 *   - Effort: high (sweet spot pra extracao + sugestao)
 *   - Output: JSON estruturado via prompt + parse defensivo (sem dep zod)
 *   - System prompt fixo (cacheavel · 1.25x write, 0.1x read)
 *   - Historico de msgs vai pro user turn (volatile · nao cacheia)
 *
 * NAO usa output_config.format · helper callAnthropic do projeto e' generico
 * (string return). Forcamos JSON via prompt + temperatura baixa + parse.
 */

import { callAnthropic, MODELS } from './anthropic'

/**
 * Endereco oficial da clinica · puxado de clinics.address jsonb.
 * Copilot Context A (2026-05-07) · injetado no prompt como fonte de verdade.
 */
export interface CopilotClinicAddress {
  cep?: string | null
  rua?: string | null
  num?: string | null
  comp?: string | null
  bairro?: string | null
  cidade?: string | null
  estado?: string | null
  /** Link Google Maps · pode ser passado pra paciente quando perguntar onde fica */
  maps?: string | null
}

/**
 * Resumo de 1 procedimento ativo · campos seguros · NUNCA preco/custo.
 * Copilot Context A (2026-05-07) · puxado de clinic_procedimentos via
 * ProcedureRepository (que ja exclui campos comerciais no SELECT).
 */
export interface CopilotProcedureSummary {
  nome: string
  categoria: string | null
  /** Texto explicando como funciona · cap em ~200 chars no prompt */
  descricao: string | null
  duracaoMin: number | null
  sessoes: number | null
  observacoes?: string | null
}

/**
 * P7.1 B.1 · Conteudo comercial curado de 1 procedimento.
 * Subset/lookalike de @clinicai/repositories CommercialProcedureDTO ·
 * mantido aqui pra evitar dep cruzada packages/ai → packages/repositories.
 * Caller (rota Copilot) faz a conversao trivial.
 *
 * IMPORTANTE: campos NUNCA contem preco. Esses textos sao curados humano e
 * passam por revisao. Sao seguros pra IA usar literalmente em smart_replies
 * (com adaptacao de tom).
 */
export interface CopilotCommercialProcedure {
  nome: string
  categoria: string | null
  pitch_curto: string | null
  pitch_premium: string | null
  promessa_permitida: string | null
  /** REGRA DURA · IA nunca pode contradizer · prioridade absoluta */
  promessa_proibida: string | null
  /** Lista curada · canonical shape `{objection, answer}` */
  objecoes: Array<{ objection: string; answer: string }>
  quando_indicar: string | null
  quando_nao_indicar: string | null
  /** baixo | medio | alto · alto = tom mais conservador + recomendar avaliacao */
  nivel_risco_comunicacao: string
}

export interface CopilotInput {
  clinicId: string
  userId?: string
  /** Nome da clinica (ex: "Clinica Mirian de Paula") */
  clinicName: string
  /** Nome do responsavel (ex: "Dra. Mirian") · usado nos smart_replies */
  responsibleLabel?: string
  /**
   * Copilot Context A (2026-05-07) · endereco oficial puxado de clinics.address.
   * Quando null, IA deve dizer "vou confirmar o endereco com a equipe", NUNCA
   * inventar.
   */
  address?: CopilotClinicAddress | null
  /**
   * Copilot Context A (2026-05-07) · catalogo de procedimentos ativos puxado
   * de clinic_procedimentos. Quando vazio, IA deve dizer "vou pedir orientacao
   * pra equipe sobre esse procedimento", NUNCA inventar tratamento.
   */
  procedures?: CopilotProcedureSummary[]
  /**
   * P7.1 B.1 (2026-05-10) · conteudo comercial curado opcional · vem da RPC
   * get_procedimentos_comercial via ProcedureRepository.getCommercialContent.
   * Quando presente E nao-vazio, substitui o uso de `procedures` no prompt
   * (procedures vira fallback). Quando ausente/vazio, comportamento atual.
   * Feature flag USE_COMMERCIAL_PROCEDURE_CONTENT controla a leitura na rota.
   */
  commercialProcedures?: CopilotCommercialProcedure[]
  /**
   * Copilot Context A (2026-05-07) · canal/inbox da conversa.
   *  - 'sdr'        · Lara · /conversas (pre-venda)
   *  - 'secretaria' · clinic · /secretaria (pos-venda + administrativo)
   * Define tom + permissoes (ex: secretaria pode citar Pix se existir, SDR nao).
   */
  inboxRole?: 'sdr' | 'secretaria' | null
  /**
   * Copilot Context A (2026-05-07) · chave Pix oficial · puxado de
   * clinics.settings.pix_key (auditoria 2026-05-07: ainda NAO populado · vem
   * null por enquanto). NUNCA inventar quando null · responder "vou confirmar
   * a chave correta com a equipe".
   */
  pixKey?: string | null
  /**
   * J3 opcao B (2026-05-08) · modo de geracao.
   *  - 'full' (default · /conversas) · gera summary + next_actions + smart_replies
   *  - 'smart_replies_only' (/secretaria) · gera APENAS smart_replies ·
   *    summary='' e next_actions=[] no output · economia ~83% nos output tokens.
   *    Mesmo SYSTEM_PROMPT (guardrails preserved) · max_tokens reduzido.
   */
  mode?: 'full' | 'smart_replies_only'
  /** Dados do lead — null se desconhecido */
  lead: {
    name: string | null
    phone: string
    phase: string | null
    funnel: string | null
    score: number
    tags: string[]
    queixas: string[]
  }
  /** Ultimas mensagens da conversa (mais recente por ultimo) */
  messages: Array<{
    role: 'user' | 'assistant'
    content: string
    isManual?: boolean
    sentAt: string
  }>
}

export interface CopilotOutput {
  summary: string
  next_actions: Array<{
    verb: string
    target: string
    rationale: string
  }>
  smart_replies: string[]
}

const SYSTEM_PROMPT = `Voce e um copiloto AI de atendimento de uma clinica de medicina estetica em Maringa-PR. Esta atendendo via WhatsApp e ajuda atendentes humanos a responder pacientes.

Sua tarefa: dado o contexto do lead + ultimas mensagens, gerar 3 saidas em UM unico JSON:

1. **summary** (string ≤160 chars · 1 frase em PT-BR)
   - TLDR do lead pro atendente saber em 5 segundos quem e' a pessoa e o que precisa
   - Inclua: nome, idade aproximada se possivel, interesse principal, sinal de temperatura (quente/morno), proximo passo logico
   - Exemplo: "Maria · interesse em olheiras Smooth Eyes · pediu data semana que vem · score 75 · quente"

2. **next_actions** (array com EXATAMENTE 3 itens)
   - Cada item: { verb, target, rationale }
   - verb: 1-2 palavras imperativas (Agendar, Enviar, Pedir, Confirmar, Ligar, Apresentar)
   - target: o que/quem (ex: "avaliacao Smooth Eyes", "foto frente e perfil", "alinhar expectativa do protocolo") · NUNCA cifra/valor/orcamento numerico (ver REGRA CRITICA abaixo)
   - rationale: 1 frase ≤80 chars · POR QUE essa acao agora baseado no contexto
   - Ordene por probabilidade de fechar a venda

3. **smart_replies** (array com EXATAMENTE 3 strings)
   - Mensagens prontas pra atendente colar no WhatsApp · adaptadas ao tom do paciente
   - Use linguagem natural, calorosa mas profissional · evite gerundios excessivos ("estaremos enviando")
   - Cada uma cobre uma estrategia diferente: (a) responder ultima msg / (b) aprofundar / (c) chamar pra acao
   - Maximo 280 chars cada · use {nome} se for natural
   - Evite emoji em excesso · 1 emoji discreto OK

REGRA CRITICA · VALOR/PRECO (GLOBAL · TODOS OS CANAIS):
- NUNCA cite preco, valor, tabela, custo, orcamento, promocao, desconto, sinal, entrada, parcelamento ou investimento com numero (R$, reais, "X mil", "a partir de Y").
- NUNCA invente preco. NUNCA leia preco de qualquer fonte do contexto (mesmo se aparecer em mensagens antigas, tags, observacoes ou nome de procedimento).
- NUNCA use a coluna preco de tabela alguma como base. NUNCA cite "tabela de precos".
- Mesmo se o paciente perguntar diretamente "quanto custa?", "qual o valor?", "me passa o preco?", "tem promocao?", "quanto fica?", "qual o investimento?", a resposta NAO PODE conter cifra nem faixa.
- NAO prometa desconto, condicao especial, brinde, cashback ou retorno financeiro. NAO diga "e barato", "e caro", "vale muito", "compensa", "tem promo".
- NAO crie urgencia financeira falsa ("ultima vaga com esse valor", "promo so essa semana").
- NAO empurre agendamento neste contexto · agenda e' tema separado · foque em entender a necessidade do paciente.

RESPOSTA SEGURA quando perguntarem valor (use SEMPRE essa estrutura nas smart_replies):
1. Reconheca a duvida com calor humano (sem desviar bruscamente).
2. Explique que cada caso/rosto/protocolo e' individual · valor depende da avaliacao.
3. Convide a pessoa a contar mais sobre o que incomoda, objetivo ou expectativa · pra equipe orientar com seguranca.
4. Tom: humano, premium, acolhedor · sem pressao comercial.

Modelo conceitual (NAO copiar literal · adapte ao contexto):
"Entendo sua duvida! O valor depende do protocolo certo pro seu caso · cada rosto/objetivo precisa de uma avaliacao individual. Me conta um pouco mais o que voce gostaria de tratar pra eu te orientar com seguranca?"

Aplica tambem em next_actions: o verb/target/rationale NAO podem citar "orcamento R$X", "fechamento R$Y", "promo Z" · apenas referencias qualitativas ("apresentar protocolo", "conduzir avaliacao", "alinhar expectativa").

Aplica em summary: NAO incluir valor monetario mesmo que apareca no historico do lead.

DADOS OFICIAIS DA CLINICA (vindos do banco · use como FONTE DE VERDADE):
- ENDERECO oficial · pode ser citado pra responder "onde fica?", "qual o endereco?", "tem mapa?".
- PROCEDIMENTOS ativos · use a descricao oficial pra explicar "como funciona X" · nao invente protocolo, sessoes, duracao ou cuidados que nao estejam listados.
- CONTEUDO COMERCIAL CURADO (P7.1 B.1) · quando disponivel pra um procedimento, contem campos curados HUMANO: pitch_curto/pitch_premium (use COMO BASE, adapte tom · NAO copie literal robotico), promessa_permitida (o que pode prometer), promessa_proibida (regra DURA · NUNCA contradiga · NUNCA prometa nada listado aqui), objecoes (USE as respostas curadas · NAO invente respostas pra essas perguntas), quando_indicar/quando_nao_indicar (perfil indicado/contraindicado), nivel_risco_comunicacao (baixo/medio/alto). Quando paciente pergunta sobre um procedimento que tem conteudo comercial curado, USE o pitch curado · adapte ao contexto · respeite as restricoes.
- NIVEL DE RISCO ALTO (nivel_risco_comunicacao=alto) · seja MAIS conservador · prefira "vamos avaliar com a equipe" a afirmar protocolo · convide pra avaliacao humana antes de aprofundar · nunca prometa especifico.
- Se um dado nao estiver listado abaixo (endereco vazio, procedimento ausente, Pix nulo, conteudo comercial ausente), NUNCA invente · diga "vou confirmar com a equipe" e direcione pra orientacao humana.

REGRAS POR CANAL (inboxRole · quando informado):
- inboxRole='secretaria' · tom direto, administrativo, objetivo. Pode falar de pagamento/Pix QUANDO o paciente pedir e o Pix estiver listado nos dados oficiais. Pode citar endereco e procedimentos ativos.
- inboxRole='sdr' (Lara) · tom consultivo, acolhedor. NUNCA cite Pix automaticamente · so se o paciente perguntar diretamente E o Pix estiver nos dados oficiais. Foca em entender necessidade + apresentar protocolo.
- Se Pix nao estiver listado, NAO cite chave nenhuma · diga "vou pedir pra equipe te enviar a chave correta".

GUARDRAILS DE PROCEDIMENTO:
- NAO prometa resultado especifico ("vai resolver 100%", "garante", "fica perfeito").
- NAO faca diagnostico ("voce tem X").
- NAO indique tratamento que nao esteja listado nos procedimentos ativos · se paciente perguntar de tratamento desconhecido, encaminhe pra equipe.
- Pode explicar "como funciona", duracao, sessoes E cuidados pre/pos · TUDO baseado na descricao oficial · nunca preco/valor.

REGRA CRITICA · LINGUAGEM ABSOLUTA (P7.1 B.2C · 2026-05-10 · GLOBAL):
- NUNCA use o termo "100%" em QUALQUER contexto. Mesmo frases que parecem positivas ou acolhedoras estao PROIBIDAS:
  - ❌ "100% segura"
  - ❌ "100% natural"
  - ❌ "100% garantido"
  - ❌ "100% eficaz"
  - ❌ "fica 100% bem"
- NUNCA use "garantir", "garantia", "garantido" em contexto de:
  - seguranca ("garantir que voce fica segura")
  - resultado ("garantir resultado natural")
  - naturalidade ("garantir naturalidade")
  - eficacia ("garantir que funciona")
  - melhora estetica ("garantir melhora")
  - procedimento ("garantir resultado do protocolo")
- Razao: comunicacao em medicina estetica nao admite certeza absoluta. Cada caso e individual. "100%" + "garantir" implicam promessa absoluta com risco regulatorio + clinico real.

LINGUAGEM PERMITIDA (substitua absolutos por relativos):
- "com mais seguranca"
- "com mais tranquilidade"
- "com cuidado redobrado"
- "com avaliacao criteriosa"
- "pra entender se faz sentido no seu caso"
- "a Dra. Mirian avalia pessoalmente"
- "depende do historico, indicacao e avaliacao"
- "pra te orientar com seguranca e cuidado"
- "buscar naturalidade respeitando o seu caso"

EXEMPLOS PROIBIDOS · evite mesmo se "soar acolhedor":
- ❌ "pra garantir que voce fica 100% segura"
- ❌ "garantir resultado natural"
- ❌ "vai resolver"
- ❌ "resultado garantido"
- ❌ "fica perfeito"
- ❌ "100% seguro"
- ❌ "garantir naturalidade"
- ❌ "garantir tranquilidade"

EXEMPLOS PERMITIDOS · acolhedores E seguros:
- ✓ "pra te orientar com seguranca e cuidado"
- ✓ "pra avaliar se faz sentido no seu caso"
- ✓ "pra entender seu historico e indicar o caminho mais seguro"
- ✓ "a Dra. Mirian precisa avaliar antes de definir o melhor protocolo"
- ✓ "a ideia e buscar naturalidade, respeitando seu caso e sua avaliacao"

Para procedimentos com nivel_risco_comunicacao="alto":
- Tom MAIS conservador.
- Sempre recomendar avaliacao humana antes de afirmar protocolo.
- Nunca afirmar resultado, eficacia ou seguranca em termos absolutos.
- Preferir "depende da avaliacao" sobre qualquer promessa qualitativa forte.

Em smart_replies:
- NAO usar linguagem absoluta nem mesmo embalada como acolhimento.
- Padrao seguro: acolhimento + avaliacao + proximo passo concreto · sem promessa.

REGRAS GERAIS:
- Responda APENAS com JSON valido. Sem texto antes ou depois. Sem markdown. Sem \`\`\`.
- Mantenha PT-BR coloquial mas correto · sem ingles desnecessario.
- Se faltar contexto critico (ex: paciente nunca respondeu), summary deve dizer isso e next_actions deve focar em primeiro contato.
- Nunca invente fatos: se o lead nao mencionou algo, nao afirme.

Schema do output:
{
  "summary": string,
  "next_actions": [{ "verb": string, "target": string, "rationale": string }, ...3 items],
  "smart_replies": [string, string, string]
}`

/** Formata endereco em 1 linha legivel · "(nao cadastrado)" se vazio. */
function formatAddress(addr: CopilotClinicAddress | null | undefined): string {
  if (!addr) return '(nao cadastrado · responder que confirma com a equipe)'
  const parts: string[] = []
  if (addr.rua) parts.push(addr.rua)
  if (addr.num) parts.push(`n. ${addr.num}`)
  if (addr.comp) parts.push(addr.comp)
  if (addr.bairro) parts.push(addr.bairro)
  const cityState = [addr.cidade, addr.estado].filter(Boolean).join('-')
  if (cityState) parts.push(cityState)
  if (addr.cep) parts.push(`CEP ${addr.cep}`)
  const line = parts.filter(Boolean).join(', ')
  if (!line) return '(nao cadastrado · responder que confirma com a equipe)'
  return addr.maps ? `${line} · maps: ${addr.maps}` : line
}

/**
 * Formata catalogo de procedimentos · cap em 25 itens + 200 chars de descricao
 * pra controlar tokens do prompt. Auditoria 2026-05-07 · clinica Mirian tem
 * 44 ativos · cap em 25 + 'mais N nao listados' incentiva IA a encaminhar pra
 * equipe quando paciente pedir tratamento incomum.
 */
function formatProcedures(procs: CopilotProcedureSummary[] | undefined): string {
  if (!procs || procs.length === 0) {
    return '(nenhum procedimento ativo cadastrado · encaminhar perguntas pra equipe)'
  }
  const MAX_LISTED = 25
  const visible = procs.slice(0, MAX_LISTED)
  const lines = visible.map((p) => {
    const cat = p.categoria ? `[${p.categoria}] ` : ''
    const desc = (p.descricao || '').slice(0, 200)
    const dur = p.duracaoMin ? ` · ${p.duracaoMin}min` : ''
    const sess = p.sessoes ? ` · ${p.sessoes} sess` : ''
    const obs = p.observacoes ? ` · obs: ${p.observacoes.slice(0, 80)}` : ''
    return `- ${cat}${p.nome}${dur}${sess} · ${desc}${obs}`
  })
  if (procs.length > MAX_LISTED) {
    lines.push(`... + ${procs.length - MAX_LISTED} outros · se paciente pedir tratamento nao listado, encaminhar pra equipe.`)
  }
  return lines.join('\n')
}

/**
 * P7.1 B.1 · Normaliza string pra match defensivo (lower + sem acentos).
 * Usado pra detectar mencoes de procedimento em mensagens/queixas.
 */
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    // eslint-disable-next-line no-misleading-character-class
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * P7.1 B.1 · Decide quais procs comerciais incluir no prompt (cap inteligente).
 *
 * Estrategia:
 *   1. Score por match textual contra (a) ultimas 10 mensagens user (b) lead.queixas
 *      (c) lead.tags. Match parcial em palavras do nome do procedimento OU categoria.
 *   2. Top N por score · empate quebrado por nome (deterministico).
 *   3. Se nenhum match, fallback: top N por categoria prioritaria
 *      (injetavel > tecnologia > resto).
 *   4. Hard caps:
 *       - default 8 procs · 12 quando matches > 6.
 *       - max 7000 chars total formatado.
 *
 * Sempre retorna objetos no shape de CopilotCommercialProcedure ·
 * mantem ordem de relevancia (matches primeiro).
 */
export function pickRelevantCommercialProcedures(
  pool: CopilotCommercialProcedure[],
  lead: CopilotInput['lead'],
  messages: CopilotInput['messages'],
): CopilotCommercialProcedure[] {
  if (pool.length === 0) return []

  // Coleta haystack normalizado das ultimas msgs + queixas + tags do lead.
  const recentUserText = messages
    .slice(-10)
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ')
  const haystack = normalizeForMatch(
    [
      recentUserText,
      ...(lead.queixas || []),
      ...(lead.tags || []),
    ].join(' '),
  )

  const scored = pool.map((p) => {
    const nomeNorm = normalizeForMatch(p.nome)
    const catNorm = normalizeForMatch(p.categoria || '')
    let score = 0
    if (nomeNorm && haystack.includes(nomeNorm)) score += 100
    // Match parcial por tokens do nome (>=4 chars cada · evita ruido "de", "do")
    nomeNorm
      .split(' ')
      .filter((tok) => tok.length >= 4)
      .forEach((tok) => {
        if (haystack.includes(tok)) score += 10
      })
    if (catNorm && haystack.includes(catNorm)) score += 5
    return { proc: p, score }
  })

  const matches = scored
    .filter((s) => s.score > 0)
    .sort(
      (a, b) =>
        b.score - a.score || a.proc.nome.localeCompare(b.proc.nome, 'pt-BR'),
    )

  let picked: CopilotCommercialProcedure[]
  if (matches.length === 0) {
    // Fallback · top 8 por prioridade de categoria + ordem alfabetica.
    const categoryOrder: Record<string, number> = {
      injetavel: 1,
      tecnologia: 2,
    }
    picked = [...pool]
      .sort((a, b) => {
        const ca = categoryOrder[a.categoria || ''] ?? 99
        const cb = categoryOrder[b.categoria || ''] ?? 99
        if (ca !== cb) return ca - cb
        return a.nome.localeCompare(b.nome, 'pt-BR')
      })
      .slice(0, 8)
  } else {
    const cap = matches.length > 6 ? 12 : 8
    picked = matches.slice(0, cap).map((m) => m.proc)
  }

  return picked
}

/**
 * P7.1 B.1 · Formata array de procs comerciais respeitando hard cap de chars.
 *
 * Cada item carrega: nome, categoria, pitch_curto (sempre), promessa_permitida
 * (curta), promessa_proibida (curta · OBRIGATORIA · IA precisa respeitar),
 * top 2 objecoes (pergunta+resposta), quando_indicar/nao_indicar truncados,
 * nivel_risco_comunicacao. Pitch_premium SO se houver espaco (cap residual).
 *
 * Hard cap: 7000 chars. Quando cap atinge, trunca lista (nao trunca campo
 * dentro de item · evita meio-texto · prefere desistir do item inteiro).
 */
function formatCommercialProcedures(
  procs: CopilotCommercialProcedure[],
): string {
  if (procs.length === 0) {
    return '(nenhum conteudo comercial curado disponivel · use PROCEDIMENTOS ATIVOS abaixo como base · encaminhar pra equipe se duvida especifica)'
  }
  const HARD_CAP = 7000
  const lines: string[] = []
  let total = 0

  for (const p of procs) {
    const block: string[] = []
    block.push(`- ${p.nome}${p.categoria ? ` [${p.categoria}]` : ''} · risco=${p.nivel_risco_comunicacao}`)
    if (p.pitch_curto) {
      block.push(`  pitch_curto: ${p.pitch_curto.slice(0, 200)}`)
    }
    if (p.promessa_permitida) {
      block.push(`  promessa_permitida: ${p.promessa_permitida.slice(0, 200)}`)
    }
    if (p.promessa_proibida) {
      block.push(`  promessa_proibida (NUNCA prometer): ${p.promessa_proibida.slice(0, 220)}`)
    }
    if (p.quando_indicar) {
      block.push(`  quando_indicar: ${p.quando_indicar.slice(0, 160)}`)
    }
    if (p.quando_nao_indicar) {
      block.push(`  quando_nao_indicar: ${p.quando_nao_indicar.slice(0, 160)}`)
    }
    if (p.objecoes && p.objecoes.length > 0) {
      const top = p.objecoes.slice(0, 2)
      block.push(`  objecoes (use respostas curadas):`)
      top.forEach((o) => {
        const q = (o.objection || '').slice(0, 80)
        const a = (o.answer || '').slice(0, 200)
        block.push(`    - Q: ${q}`)
        block.push(`      A: ${a}`)
      })
    }
    const text = block.join('\n')
    if (total + text.length + 1 > HARD_CAP) {
      // Cap atingido · para incluir mais.
      lines.push(`... + ${procs.length - lines.length} outros nao listados (cap de tokens · se paciente pedir, encaminhar pra equipe).`)
      break
    }
    lines.push(text)
    total += text.length + 1
  }

  return lines.join('\n')
}

function buildUserPrompt(input: CopilotInput): string {
  const {
    clinicName,
    responsibleLabel,
    address,
    procedures,
    commercialProcedures,
    inboxRole,
    pixKey,
    lead,
    messages,
  } = input

  const recentMsgs = messages
    .slice(-15) // ultimas 15 msgs · cap pra controlar tokens
    .map((m) => {
      const label = m.role === 'user' ? `[Paciente]` : m.isManual ? `[Atendente]` : `[Lara IA]`
      return `${label} ${m.content}`
    })
    .join('\n')

  const roleLabel = inboxRole === 'secretaria' ? 'Secretaria (administrativo · pos-venda)' : inboxRole === 'sdr' ? 'Lara/SDR (pre-venda · consultivo)' : '(canal nao informado)'

  // P7.1 B.1 · Quando comercial disponivel, usa cap inteligente + bloco enriquecido.
  // Procedures simples vira fallback (mantido sempre como ultima linha por seguranca).
  const hasCommercial = !!(commercialProcedures && commercialProcedures.length > 0)
  const pickedCommercial = hasCommercial
    ? pickRelevantCommercialProcedures(commercialProcedures!, lead, messages)
    : []

  return [
    `Clinica: ${clinicName}`,
    responsibleLabel ? `Responsavel: ${responsibleLabel}` : '',
    `Canal/Inbox: ${roleLabel}`,
    '',
    'DADOS OFICIAIS DA CLINICA (fonte de verdade · nao inventar):',
    `- Endereco: ${formatAddress(address)}`,
    `- Pix: ${pixKey ? '(disponivel · use APENAS quando paciente perguntar pagamento E inboxRole=secretaria)' : '(nao cadastrado · responder que confirma com a equipe)'}`,
    '',
    hasCommercial
      ? 'CONTEUDO COMERCIAL CURADO (P7.1 B.1 · use pitch_curto/objecoes/promessas literalmente · respeite promessa_proibida como gate · adapte tom):'
      : 'PROCEDIMENTOS ATIVOS (fonte de verdade · nao inventar tratamento):',
    hasCommercial ? formatCommercialProcedures(pickedCommercial) : formatProcedures(procedures),
    '',
    'LEAD:',
    `- Nome: ${lead.name || 'desconhecido'}`,
    `- Telefone: ${lead.phone}`,
    `- Fase: ${lead.phase || 'novo'}`,
    `- Funil: ${lead.funnel || 'geral'}`,
    `- Score quiz: ${lead.score}`,
    lead.tags.length > 0 ? `- Tags: ${lead.tags.join(', ')}` : '',
    lead.queixas.length > 0 ? `- Queixas detectadas: ${lead.queixas.join(', ')}` : '',
    '',
    'ULTIMAS MENSAGENS (mais antigas em cima):',
    recentMsgs || '(nenhuma mensagem ainda)',
  ]
    .filter(Boolean)
    .join('\n')
}

/**
 * Parse defensivo · tolera formatacoes ruins do modelo (raras com Opus 4.7
 * + temperatura 0.2 + prompt explicito, mas defenda).
 */
function parseOutput(raw: string): CopilotOutput {
  let text = raw.trim()
  // Remove fences ``` se modelo escapou
  if (text.startsWith('```')) {
    text = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')
  }
  // Recorta apenas o objeto JSON principal (do { ao } final)
  const firstBrace = text.indexOf('{')
  const lastBrace = text.lastIndexOf('}')
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    text = text.slice(firstBrace, lastBrace + 1)
  }
  const parsed = JSON.parse(text) as Partial<CopilotOutput>

  // Sanity checks · garante shape minimo · trunca arrays se vier maior
  const summary = typeof parsed.summary === 'string' ? parsed.summary.slice(0, 200) : ''
  const next_actions = Array.isArray(parsed.next_actions)
    ? parsed.next_actions
        .slice(0, 3)
        .map((a) => ({
          verb: typeof a?.verb === 'string' ? a.verb.slice(0, 32) : '',
          target: typeof a?.target === 'string' ? a.target.slice(0, 120) : '',
          rationale: typeof a?.rationale === 'string' ? a.rationale.slice(0, 160) : '',
        }))
        .filter((a) => a.verb && a.target)
    : []
  const smart_replies = Array.isArray(parsed.smart_replies)
    ? parsed.smart_replies
        .slice(0, 3)
        .filter((s): s is string => typeof s === 'string' && s.trim().length > 0)
        .map((s) => s.slice(0, 320))
    : []

  return { summary, next_actions, smart_replies }
}

/**
 * Gera o copiloto AI · 1 chamada Anthropic Opus 4.7.
 *
 * Mode default ('full') · retorna summary + next_actions + smart_replies.
 * Mode 'smart_replies_only' (J3 opcao B · /secretaria) · retorna apenas
 * smart_replies; summary='' e next_actions=[] no output. Mesmo SYSTEM_PROMPT
 * (guardrails preservados) · max_tokens reduzido pra economizar output tokens.
 *
 * Throws:
 *  - Error('BUDGET_EXCEEDED · ...') se gastos do dia ultrapassam limit
 *  - Erros de rede normais
 *  - Error de parse se modelo retornar JSON invalido (raro)
 */
export async function generateCopilot(input: CopilotInput): Promise<CopilotOutput> {
  const isSmartOnly = input.mode === 'smart_replies_only'
  const userPrompt = buildUserPrompt(input)
  const finalUserPrompt = isSmartOnly
    ? `${userPrompt}\n\nMODE: SMART_REPLIES_ONLY · gere APENAS o campo "smart_replies" (3 strings). "summary" deve ser string vazia "" e "next_actions" deve ser array vazio []. Todas as guardrails de preco/promessa/endereco/Pix/procedimento continuam OBRIGATORIAS.`
    : userPrompt

  const raw = await callAnthropic({
    clinic_id: input.clinicId,
    user_id: input.userId,
    source: isSmartOnly ? 'lara.conversas.copilot.smart_only' : 'lara.conversas.copilot',
    model: MODELS.OPUS,
    max_tokens: isSmartOnly ? 600 : 1500,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: finalUserPrompt }],
  })

  return parseOutput(raw)
}
