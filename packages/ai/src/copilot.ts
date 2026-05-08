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
- Se um dado nao estiver listado abaixo (endereco vazio, procedimento ausente, Pix nulo), NUNCA invente · diga "vou confirmar com a equipe" e direcione pra orientacao humana.

REGRAS POR CANAL (inboxRole · quando informado):
- inboxRole='secretaria' · tom direto, administrativo, objetivo. Pode falar de pagamento/Pix QUANDO o paciente pedir e o Pix estiver listado nos dados oficiais. Pode citar endereco e procedimentos ativos.
- inboxRole='sdr' (Lara) · tom consultivo, acolhedor. NUNCA cite Pix automaticamente · so se o paciente perguntar diretamente E o Pix estiver nos dados oficiais. Foca em entender necessidade + apresentar protocolo.
- Se Pix nao estiver listado, NAO cite chave nenhuma · diga "vou pedir pra equipe te enviar a chave correta".

GUARDRAILS DE PROCEDIMENTO:
- NAO prometa resultado especifico ("vai resolver 100%", "garante", "fica perfeito").
- NAO faca diagnostico ("voce tem X").
- NAO indique tratamento que nao esteja listado nos procedimentos ativos · se paciente perguntar de tratamento desconhecido, encaminhe pra equipe.
- Pode explicar "como funciona", duracao, sessoes E cuidados pre/pos · TUDO baseado na descricao oficial · nunca preco/valor.

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

function buildUserPrompt(input: CopilotInput): string {
  const { clinicName, responsibleLabel, address, procedures, inboxRole, pixKey, lead, messages } = input

  const recentMsgs = messages
    .slice(-15) // ultimas 15 msgs · cap pra controlar tokens
    .map((m) => {
      const label = m.role === 'user' ? `[Paciente]` : m.isManual ? `[Atendente]` : `[Lara IA]`
      return `${label} ${m.content}`
    })
    .join('\n')

  const roleLabel = inboxRole === 'secretaria' ? 'Secretaria (administrativo · pos-venda)' : inboxRole === 'sdr' ? 'Lara/SDR (pre-venda · consultivo)' : '(canal nao informado)'

  return [
    `Clinica: ${clinicName}`,
    responsibleLabel ? `Responsavel: ${responsibleLabel}` : '',
    `Canal/Inbox: ${roleLabel}`,
    '',
    'DADOS OFICIAIS DA CLINICA (fonte de verdade · nao inventar):',
    `- Endereco: ${formatAddress(address)}`,
    `- Pix: ${pixKey ? '(disponivel · use APENAS quando paciente perguntar pagamento E inboxRole=secretaria)' : '(nao cadastrado · responder que confirma com a equipe)'}`,
    '',
    'PROCEDIMENTOS ATIVOS (fonte de verdade · nao inventar tratamento):',
    formatProcedures(procedures),
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
 * Gera o copiloto AI · 1 chamada Anthropic Opus 4.7 retorna 3 features.
 *
 * Throws:
 *  - Error('BUDGET_EXCEEDED · ...') se gastos do dia ultrapassam limit
 *  - Erros de rede normais
 *  - Error de parse se modelo retornar JSON invalido (raro)
 */
export async function generateCopilot(input: CopilotInput): Promise<CopilotOutput> {
  const userPrompt = buildUserPrompt(input)

  const raw = await callAnthropic({
    clinic_id: input.clinicId,
    user_id: input.userId,
    source: 'lara.conversas.copilot',
    model: MODELS.OPUS,
    max_tokens: 1500,
    temperature: 0.2,
    system: SYSTEM_PROMPT,
    messages: [{ role: 'user', content: userPrompt }],
  })

  return parseOutput(raw)
}
