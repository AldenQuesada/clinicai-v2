/**
 * AI Service — Lara Agent
 *
 * Compõe system prompt em camadas: lara-base + flow do funil + prices-defense.
 *
 * Cada camada tenta DB override em clinic_data primeiro · fallback pro arquivo
 * `.md` no repo (seed default). Permite editar prompts via UI sem rebuild.
 *
 * Keys em clinic_data.settings:
 *   - lara_prompt_base
 *   - lara_prompt_olheiras
 *   - lara_prompt_fullface
 *   - lara_prompt_prices_defense
 */

import { getAnthropicClient } from '@/lib/anthropic';
import { createServerClient } from '@/lib/supabase';
import * as fs from 'fs';
import * as path from 'path';

const PROMPT_KEYS = {
  base: 'lara_prompt_base',
  olheiras: 'lara_prompt_olheiras',
  fullface: 'lara_prompt_fullface',
  prices_defense: 'lara_prompt_prices_defense',
} as const;

const FILE_PATHS = {
  base: ['src', 'prompt', 'lara-prompt.md'],
  olheiras: ['src', 'prompt', 'flows', 'olheiras-flow.md'],
  fullface: ['src', 'prompt', 'flows', 'fullface-flow.md'],
  prices_defense: ['src', 'prompt', 'flows', 'prices-defense-flow.md'],
} as const;

function readFromFile(key: keyof typeof FILE_PATHS): string | null {
  try {
    const fullPath = path.resolve(process.cwd(), ...FILE_PATHS[key]);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

async function readPromptLayer(
  clinicId: string | null,
  key: keyof typeof PROMPT_KEYS,
): Promise<string | null> {
  // 1. Tenta DB override · clinic_data.settings (key=PROMPT_KEYS[key])
  if (clinicId) {
    try {
      const supabase = createServerClient();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data } = await (supabase.from('clinic_data') as any)
        .select('value')
        .eq('clinic_id', clinicId)
        .eq('key', PROMPT_KEYS[key])
        .maybeSingle();

      if (data?.value && typeof data.value === 'string' && data.value.trim().length > 0) {
        return data.value as string;
      }
      if (data?.value?.content && typeof data.value.content === 'string') {
        return data.value.content as string;
      }
    } catch {
      // falha silenciosa · cai pro filesystem
    }
  }

  // 2. Fallback pro arquivo no repo
  return readFromFile(key);
}

async function getSystemPromptText(funnel: string | undefined, clinicId: string | null): Promise<string> {
  try {
    const base = await readPromptLayer(clinicId, 'base');
    let prompt = base || 'Você é a Lara, assistente virtual da Dra. Mirian de Paula.';

    if (funnel === 'olheiras') {
      const olheiras = await readPromptLayer(clinicId, 'olheiras');
      if (olheiras) prompt += '\n\n' + olheiras;
    } else if (funnel === 'fullface') {
      const fullface = await readPromptLayer(clinicId, 'fullface');
      if (fullface) prompt += '\n\n' + fullface;
    } else {
      // Se não tem funil, empurra ambos para ela decidir e descobrir o funnel do cliente
      const olheiras = await readPromptLayer(clinicId, 'olheiras');
      const fullface = await readPromptLayer(clinicId, 'fullface');
      if (olheiras) prompt += '\n\n' + olheiras;
      if (fullface) prompt += '\n\n' + fullface;
    }

    // Sempre injeta defesa de preços
    const prices = await readPromptLayer(clinicId, 'prices_defense');
    if (prices) prompt += '\n\n' + prices;

    return prompt;
  } catch (e) {
    console.error('Falha ao compor prompt:', e);
    return 'Você é a Lara, assistente virtual da Dra. Mirian de Paula. Responda de forma calorosa e profissional.';
  }
}

interface LeadContext {
  name: string;
  phone: string;
  queixas_faciais?: string[];
  idade?: string;
  phase?: string;
  temperature?: string;
  day_bucket?: number;
  lead_score?: number;
  ai_persona?: string;
  funnel?: string;
  last_response_at?: string;
  is_returning?: boolean;
  message_count?: number;
  conversation_count?: number;
  is_audio_message?: boolean; // true quando o lead enviou um áudio (já transcrito)
  clinic_id?: string; // multi-tenant ADR-028 · resolvido pelo webhook via wa_numbers
}

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * Generate AI response using Claude with lead context injection.
 */
export async function generateResponse(
  leadContext: LeadContext,
  messages: ChatMessage[],
  messageCount: number
): Promise<string> {
  const anthropic = getAnthropicClient();

  const persona = leadContext.ai_persona || 'onboarder';
  const funnel = leadContext.funnel;

  const basePrompt = await getSystemPromptText(funnel, leadContext.clinic_id || null);
  const isReturning = leadContext.is_returning || false;

  const systemPrompt = `${basePrompt}

## Contexto atual do lead:
- Nome: ${leadContext.name || 'Lead'}
- Telefone: ${leadContext.phone}
- Queixas: ${(leadContext.queixas_faciais || []).join(', ') || 'não informadas'}
- Idade: ${leadContext.idade || 'não informada'}
- Fase: ${leadContext.phase || 'lead'}
- Temperatura: ${leadContext.temperature || 'warm'}
- Dia no funil: ${leadContext.day_bucket || 0}
- Score quiz: ${leadContext.lead_score || 0}
- Persona ativa: ${persona}
- Funil: ${funnel === 'fullface' ? 'FULL FACE (lifting 5D)' : funnel === 'olheiras' ? 'OLHEIRAS (smooth eyes)' : funnel === 'procedimentos' ? 'PROCEDIMENTOS ISOLADOS' : 'nao definido'}
- Última resposta: ${leadContext.last_response_at || 'primeira mensagem'}
- É retorno: ${isReturning ? 'SIM (' + messageCount + ' mensagens trocadas)' : 'NÃO (primeira mensagem)'}
- Total de conversas: ${leadContext.conversation_count || 0}

## Regras desta conversa:
- Persona: ${persona.toUpperCase()}
- Máximo 3 parágrafos curtos
- Termine com pergunta ou call-to-action
${isReturning ? '- IMPORTANTE: NÃO repita boas-vindas nem se apresente novamente.' : '- Primeiro contato. Apresente-se como Lara da equipe da Dra. Mirian.'}
${leadContext.phase === 'unknown' ? '- Número NÃO cadastrado. Pergunte gentilmente o nome.' : ''}
${leadContext.is_audio_message ? '- MENSAGEM DE ÁUDIO: O lead enviou um áudio de voz que foi transcrito automaticamente. Reconheça isso de forma natural e calorosa (ex: "Que bom ouvir sua voz!", "Adorei seu áudio!"). Responda de forma um pouco mais informal e acolhedora, como se fosse uma conversa por voz.' : ''}`;
  const model = process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-20241022';
  
  const response = await anthropic.messages.create({
    model: model,
    max_tokens: 600,
    temperature: 0.2, // Low temperature for clinical rule adherence
    system: systemPrompt,
    messages: messages.map((m) => ({
      role: m.role,
      content: m.content,
    })),
  });

  // Extract text from response
  const textBlock = response.content.find((b) => b.type === 'text');
  let finalResponse = textBlock?.text || 'Desculpe, não consegui gerar uma resposta. Vou encaminhar para a equipe.';

  // Filtro de segurança: às vezes a IA teima em usar travessões mesmo com bloqueio no prompt.
  // Limpamos eles forçadamente no código final:
  finalResponse = finalResponse.replace(/ — /g, ', ');
  finalResponse = finalResponse.replace(/—/g, '-');
  finalResponse = finalResponse.replace(/ – /g, ', ');

  return finalResponse;
}

/**
 * Generate fixed responses for first interactions (zero token cost).
 */
export function getFixedResponse(
  messageCount: number,
  firstName: string,
  funnel?: string
): string | null {
  if (messageCount === 0) {
    return 'Que bom ter voce aqui! Sou a Lara, assessora da Dra. Mirian de Paula.\n\nFico muito feliz que tenha tomado essa decisao. Vai ser um prazer te acompanhar nesse primeiro contato com a clinica.\n\nPra comecarmos, me conta seu nome?';
  }
  if (messageCount === 1 && firstName) {
    // Inteligência Condicional: Se o paciente já destrinchou o problema logo no "Oi" 
    // e o NLP já carimbou um funil super específico, ignoramos a mensagem engessada e pulamos pro combate do Claude.
    if (funnel === 'olheiras' || funnel === 'fullface') {
      return null;
    }
    // Caso contrário (ele apenas disse um "Oi" limpo ou seu nome), soltamos a ancoragem inicial.
    return `Prazer, ${firstName}!\n\nMe conta uma coisa para eu entender como a Dra. Mirian pode te ajudar de forma perfeita: o que mais te incomoda hoje no seu rosto ou o que você gostaria de melhorar de imediato?`;
  }
  return null;
}
