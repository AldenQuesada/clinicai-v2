/**
 * AI Service — Lara Agent
 *
 * Replaces the inline Claude call from the n8n workflow.
 * Loads the prompt from prompt/lara-prompt.md, injects lead context,
 * and calls Anthropic Claude with low temperature for clinical adherence.
 */

import { getAnthropicClient } from '@/lib/anthropic';
import { createServerClient } from '@/lib/supabase';
import * as fs from 'fs';
import * as path from 'path';

function getSystemPromptText(funnel?: string): string {
  try {
    const promptPath = path.resolve(process.cwd(), 'src', 'prompt', 'lara-prompt.md');
    let prompt = fs.readFileSync(promptPath, 'utf-8');

    const flowsPath = path.resolve(process.cwd(), 'src', 'prompt', 'flows');
    
    if (funnel === 'olheiras') {
      const olheirasPath = path.join(flowsPath, 'olheiras-flow.md');
      if (fs.existsSync(olheirasPath)) {
        prompt += '\n\n' + fs.readFileSync(olheirasPath, 'utf-8');
      }
    } else if (funnel === 'fullface') {
      const fullfacePath = path.join(flowsPath, 'fullface-flow.md');
      if (fs.existsSync(fullfacePath)) {
        prompt += '\n\n' + fs.readFileSync(fullfacePath, 'utf-8');
      }
    } else {
      // Se não tem funil, empurra ambos para ela decidir e descobrir o funnel do cliente
      const olheirasPath = path.join(flowsPath, 'olheiras-flow.md');
      const fullfacePath = path.join(flowsPath, 'fullface-flow.md');
      if (fs.existsSync(olheirasPath)) prompt += '\n\n' + fs.readFileSync(olheirasPath, 'utf-8');
      if (fs.existsSync(fullfacePath)) prompt += '\n\n' + fs.readFileSync(fullfacePath, 'utf-8');
    }

    // Sempre injeta o módulo de defesa de preços
    const pricesDefensePath = path.join(flowsPath, 'prices-defense-flow.md');
    if (fs.existsSync(pricesDefensePath)) {
      prompt += '\n\n' + fs.readFileSync(pricesDefensePath, 'utf-8');
    }

    return prompt;
  } catch (e) {
    console.error('Falha ao ler construtores de prompt:', e);
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
  
  const basePrompt = getSystemPromptText(funnel);
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
