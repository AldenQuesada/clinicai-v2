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

export interface CopilotInput {
  clinicId: string
  userId?: string
  /** Nome da clinica (ex: "Clinica Mirian de Paula") */
  clinicName: string
  /** Nome do responsavel (ex: "Dra. Mirian") · usado nos smart_replies */
  responsibleLabel?: string
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
   - target: o que/quem (ex: "avaliacao Smooth Eyes", "orcamento R$2.4k", "foto frente e perfil")
   - rationale: 1 frase ≤80 chars · POR QUE essa acao agora baseado no contexto
   - Ordene por probabilidade de fechar a venda

3. **smart_replies** (array com EXATAMENTE 3 strings)
   - Mensagens prontas pra atendente colar no WhatsApp · adaptadas ao tom do paciente
   - Use linguagem natural, calorosa mas profissional · evite gerundios excessivos ("estaremos enviando")
   - Cada uma cobre uma estrategia diferente: (a) responder ultima msg / (b) aprofundar / (c) chamar pra acao
   - Maximo 280 chars cada · use {nome} se for natural
   - Evite emoji em excesso · 1 emoji discreto OK

REGRAS:
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

function buildUserPrompt(input: CopilotInput): string {
  const { clinicName, responsibleLabel, lead, messages } = input

  const recentMsgs = messages
    .slice(-15) // ultimas 15 msgs · cap pra controlar tokens
    .map((m) => {
      const label = m.role === 'user' ? `[Paciente]` : m.isManual ? `[Atendente]` : `[Lara IA]`
      return `${label} ${m.content}`
    })
    .join('\n')

  return [
    `Clinica: ${clinicName}`,
    responsibleLabel ? `Responsavel: ${responsibleLabel}` : '',
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
