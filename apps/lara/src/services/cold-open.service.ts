/**
 * Cold-open service · primeira mensagem proativa pra lead após anatomy quiz.
 *
 * Audit gap B1-B7 (P0) · paridade com Lara legacy `lara-dispatch` edge function.
 *
 * 6 templates suportados:
 *   - aq_novo_lead         · NOVO LEAD msg 1 de 5 (onboarding+rapport+permissão)
 *   - aq_lead_frio         · LEAD FRIO retornando · reconexão sem cobrança
 *   - aq_orcamento_aberto  · ORÇAMENTO ABERTO · re-engajamento direto
 *   - aq_agendado_futuro   · JÁ AGENDADA com data futura · injeta [DATA]
 *   - aq_paciente_ativo    · PACIENTE ATIVA · oferece reavaliação
 *   - aq_requiz_recente    · RE-QUIZ <24h · humor leve
 *
 * Modelo: Haiku 4.5 (legacy usava · barato + suficiente pra primeira ancoragem).
 *
 * Audit gap B8 (P1): A/B testing via RPC `lara_pick_template(p_key)` que
 * retorna variante ativa por weight. Se RPC retornar NULL, cai pro DB
 * override (clinic_data) e depois .md no filesystem. Caller pode salvar
 * template_id/version/variant pra audit em anatomy_quiz_lara_dispatch.
 *
 * Contrato canônico:
 *  - ADR-012: usa repos (LeadRepository, ConversationRepository, MessageRepository)
 *  - ADR-028: clinic_id resolvido via wa_number_id ou explicito no payload
 *  - callAnthropic com cost tracking (_ai_budget)
 *  - Prioridade prompt: lara_templates RPC > clinic_data > .md filesystem
 */

import * as fs from 'fs';
import * as path from 'path';
import { callAnthropic, MODELS } from '@clinicai/ai';
import { ClinicDataRepository } from '@clinicai/repositories';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@clinicai/supabase'

export type ColdOpenTemplateKey =
  | 'aq_novo_lead'
  | 'aq_lead_frio'
  | 'aq_orcamento_aberto'
  | 'aq_agendado_futuro'
  | 'aq_paciente_ativo'
  | 'aq_requiz_recente';

export const COLD_OPEN_TEMPLATE_KEYS: readonly ColdOpenTemplateKey[] = [
  'aq_novo_lead',
  'aq_lead_frio',
  'aq_orcamento_aberto',
  'aq_agendado_futuro',
  'aq_paciente_ativo',
  'aq_requiz_recente',
];

export interface QueixaItem {
  label: string;
  protocol?: string;
}

export interface ColdOpenContext {
  /** scheduled_for date pra aq_agendado_futuro · formato livre ("12/05 às 14h") */
  lifecycle?: { scheduled_for?: string };
  /** outros campos que a IA pode usar · livres */
  [k: string]: unknown;
}

export interface ColdOpenInput {
  templateKey: ColdOpenTemplateKey;
  /** primeiro nome ou nome completo · split em ' ' */
  name: string;
  /** array de queixas · primeiras 2 são as principais */
  queixas: QueixaItem[];
  /** lifecycle / context livres pra template injetar [DATA] etc */
  context?: ColdOpenContext;
  /** clinicId pra DB override · null usa só FS prompt */
  clinicId?: string | null;
  /** lifecycle sortido · vai pro user prompt como contexto extra */
  lifecycle?: string | null;
}

const PROMPT_KEY_PREFIX = 'lara_prompt_cold_open_';
const FILE_BASE = ['src', 'prompt', 'cold-open'];

const DEFAULT_SYSTEM = `Voce eh a Lara, assistente da Dra. Mirian de Paula (Clinica Mirian de Paula em Maringa/PR · medicina estetica facial). Voce conversa via WhatsApp · sempre se apresenta como Lara · usa portugues brasileiro coloquial profissional. NUNCA usa "se quiser" ou "sem compromisso" (Never Split the Difference). Sempre tem CTA claro. Tom acolhedor + autoridade da Dra. Mirian + foco em conversao SDR. Maximo 6 linhas. Pode usar 1 emoji 💛. Sem hashtags.`;

function readFromFile(key: ColdOpenTemplateKey): string | null {
  try {
    const fullPath = path.resolve(process.cwd(), ...FILE_BASE, `${key}.md`);
    if (fs.existsSync(fullPath)) {
      return fs.readFileSync(fullPath, 'utf-8');
    }
    return null;
  } catch {
    return null;
  }
}

interface PickedTemplate {
  user_template: string;
  system_prompt: string | null;
  template_id: string | null;
  template_version: number | null;
  template_variant: string | null;
}

/**
 * Audit gap B8: tenta RPC lara_pick_template (variante ativa por weight).
 * Retorna null se RPC falhar ou não houver variante ativa pra essa key.
 */
async function pickFromRpc(
  supabase: SupabaseClient<Database>,
  key: ColdOpenTemplateKey,
): Promise<PickedTemplate | null> {
  try {
    const { data, error } = await supabase.rpc('lara_pick_template', {
      p_key: key,
    });
    if (error) return null;
    if (!data || typeof data !== 'object') return null;
    const record = data as Record<string, unknown>;
    if (typeof record.user_template !== 'string') return null;
    return {
      user_template: record.user_template,
      system_prompt: typeof record.system_prompt === 'string' ? record.system_prompt : null,
      template_id: typeof record.id === 'string' ? record.id : null,
      template_version: typeof record.version === 'number' ? record.version : null,
      template_variant: typeof record.variant === 'string' ? record.variant : null,
    };
  } catch {
    return null;
  }
}

/**
 * Resolve template em 3 camadas (audit gap B8):
 *   1. RPC lara_pick_template (A/B testing por weight)
 *   2. clinic_data.lara_prompt_cold_open_<key> (DB override single)
 *   3. .md no filesystem (default seed)
 */
async function readTemplate(
  supabase: SupabaseClient<Database>,
  clinicId: string | null,
  key: ColdOpenTemplateKey,
): Promise<{
  text: string | null;
  fromRpc: PickedTemplate | null;
}> {
  // 1. RPC A/B testing
  const picked = await pickFromRpc(supabase, key);
  if (picked) {
    return { text: picked.user_template, fromRpc: picked };
  }

  // 2. clinic_data override
  if (clinicId) {
    try {
      const clinicData = new ClinicDataRepository(supabase);
      const value = await clinicData.getSetting<unknown>(
        clinicId,
        `${PROMPT_KEY_PREFIX}${key}`,
      );
      if (typeof value === 'string' && value.trim().length > 0) {
        return { text: value, fromRpc: null };
      }
      if (
        value &&
        typeof value === 'object' &&
        'content' in value &&
        typeof (value as { content: unknown }).content === 'string'
      ) {
        return { text: (value as { content: string }).content, fromRpc: null };
      }
    } catch {
      // falha silenciosa · cai pro filesystem
    }
  }

  // 3. filesystem
  return { text: readFromFile(key), fromRpc: null };
}

function formatQueixas(queixas: QueixaItem[]): { queixasStr: string; protosStr: string } {
  const q1 = queixas[0]?.label || '(sem queixa)';
  const q2 = queixas[1]?.label;
  const p1 = queixas[0]?.protocol || '';
  const p2 = queixas[1]?.protocol;
  const queixasStr = q1 + (q2 ? ' e ' + q2 : '');
  const protosStr = p1 + (p2 ? ' / ' + p2 : '');
  return { queixasStr, protosStr };
}

export interface ColdOpenResult {
  /** mensagem final gerada (string vazia em caso de erro) */
  messageText: string;
  /** template metadata (audit gap B8) · null se veio do .md */
  templateId: string | null;
  templateVersion: number | null;
  templateVariant: string | null;
  /** source do template usado · pra debug/audit */
  source: 'rpc' | 'clinic_data' | 'filesystem' | 'fallback';
}

/**
 * Compõe e gera a primeira mensagem cold-open via Claude Haiku.
 * Audit gap B8: retorna template_id/version/variant pra audit trail.
 */
export async function generateColdOpenMessage(
  supabase: SupabaseClient<Database>,
  input: ColdOpenInput,
): Promise<ColdOpenResult> {
  const { templateKey, name, queixas, context, clinicId, lifecycle } = input;
  const firstName = (name || '').split(' ')[0] || 'Olá';
  const { queixasStr, protosStr } = formatQueixas(queixas);

  // 1. Carrega instructions do template (RPC > clinic_data > FS)
  const resolved = await readTemplate(supabase, clinicId ?? null, templateKey);
  let templateInstr = resolved.text;
  let source: ColdOpenResult['source'];
  if (resolved.fromRpc) {
    source = 'rpc';
  } else if (resolved.text) {
    source = 'clinic_data'; // ou filesystem · readTemplate cobre ambos como text
    // Tentar discriminar: se o text bate exato com .md, é filesystem
    if (templateInstr === readFromFile(templateKey)) source = 'filesystem';
  } else {
    source = 'fallback';
  }
  if (!templateInstr) {
    templateInstr = `Apresente-se como Lara · cite as queixas: ${queixasStr} · faça uma pergunta carinhosa de qualificação. Maximo 6 linhas.`;
  }

  // 2. Injeta [DATA] dinâmica para aq_agendado_futuro
  if (templateKey === 'aq_agendado_futuro') {
    const dataStr = context?.lifecycle?.scheduled_for || '(data a confirmar)';
    templateInstr = templateInstr.replace(/\[DATA\]/g, dataStr);
  }

  // 3. Compõe system prompt · RPC pode ter system_prompt customizado por variant
  const baseSystem = resolved.fromRpc?.system_prompt || DEFAULT_SYSTEM;
  const system =
    baseSystem +
    `\n\nMencione SEMPRE as queixas: ${queixasStr}.` +
    (protosStr ? `\nMencione protocolo quando fizer sentido: ${protosStr}.` : '');

  const userPrompt =
    `Contexto: NOME=${firstName} · TEMPLATE=${templateKey}` +
    (lifecycle ? ` · LIFECYCLE=${lifecycle}` : '') +
    ` · QUEIXAS=${queixasStr}\n\nGere a mensagem da Lara seguindo:\n\n${templateInstr}`;

  // 4. Chama Claude Haiku via callAnthropic (cost tracking + retry/fallback automaticos)
  let messageText = '';
  try {
    const text = await callAnthropic({
      clinic_id: clinicId || '00000000-0000-0000-0000-000000000001',
      source: `lara.cold-open.${templateKey}`,
      model: MODELS.HAIKU,
      max_tokens: 600,
      temperature: 0.4, // cold-open precisa de mais variacao que conversa
      system,
      messages: [{ role: 'user', content: userPrompt }],
    });
    // Filtro travessões
    messageText = text.replace(/ — /g, ', ').replace(/—/g, '-').replace(/ – /g, ', ');
  } catch (e) {
    console.error('[cold-open.service] callAnthropic failed:', (e as Error)?.message);
    messageText = '';
  }

  return {
    messageText,
    templateId: resolved.fromRpc?.template_id ?? null,
    templateVersion: resolved.fromRpc?.template_version ?? null,
    templateVariant: resolved.fromRpc?.template_variant ?? null,
    source,
  };
}
