/**
 * Handler: admin.query
 *
 * Admin perguntando coisa que NAO e approve/reject/create · delega pra RPC
 * wa_pro_handle_message ja em prod no clinic-dashboard. RPC tem 10+ intents
 * cobertos: agenda_today/tomorrow/week/free, patient_lookup, finance_revenue,
 * commission, register, schedule, help, etc.
 *
 * Decisao Alden: nao duplicar logica · apenas wrap. Se RPC falhar/timeout,
 * resposta educada + audit. RPC retorna { ok, intent, reply_text, intent_metadata }.
 *
 * Boundary ADR-012: a chamada e via supabase.rpc() direto · esse e o unico
 * lugar permitido (RPC ja encapsula logica de negocio · nao e supabase.from()).
 *
 * Sender admin tambem pode estar em uma whitelist B2B (multi-role) · esse
 * handler so roda quando role==='admin' ja foi confirmado em route.ts.
 */

import type { Handler, HandlerResult } from './types'
import { createServerClient } from '@/lib/supabase'

interface WaProRpcResult {
  ok?: boolean
  intent?: string | null
  reply_text?: string | null
  intent_metadata?: Record<string, unknown> | null
  error?: string | null
}

export const b2bAdminQueryHandler: Handler = async (ctx): Promise<HandlerResult> => {
  const { repos, phone, clinicId, role, text } = ctx

  if (role !== 'admin') {
    return {
      replyText: 'Esse comando é só pra admin.',
      actions: [],
      stateTransitions: [],
      meta: { handler: 'b2b-admin-query', error: 'not_admin' },
    }
  }

  // Chama RPC wa_pro_handle_message (ja em prod · clinic-dashboard)
  // RPC e service-side · cuida de normalizar texto, detectar intent,
  // executar tool, formatar response. Centraliza toda logica admin.
  const supabase = createServerClient()
  let rpcResult: WaProRpcResult | null = null
  let rpcError: string | null = null

  try {
    const { data, error } = await supabase.rpc('wa_pro_handle_message', {
      p_phone: phone,
      p_text: text,
    })
    if (error) {
      rpcError = error.message
    } else {
      rpcResult = data as WaProRpcResult
    }
  } catch (err) {
    rpcError = (err as Error).message
  }

  if (rpcError || !rpcResult) {
    await repos.waProAudit.logQuery({
      msg: {
        clinicId,
        phone,
        direction: 'inbound',
        content: text,
        intent: 'admin.query',
        intentData: { rpc_error: rpcError },
        status: 'failed',
      },
      audit: {
        clinicId,
        phone,
        query: text,
        intent: 'admin.query',
        rpcCalled: 'wa_pro_handle_message',
        success: false,
        errorMessage: rpcError,
      },
    })
    return {
      replyText:
        'Tive um problema pra processar sua consulta agora. Tenta de novo em instantes?',
      actions: [],
      stateTransitions: [],
      meta: {
        handler: 'b2b-admin-query',
        error: 'rpc_failed',
        rpc_error: rpcError,
      },
    }
  }

  const replyText =
    rpcResult.reply_text ??
    'Não consegui processar sua consulta · pode reformular?'
  const innerIntent = rpcResult.intent ?? 'admin.query.unknown'

  // Audit (best-effort) · logQuery do WaProAuditRepository ja escreve em
  // wa_pro_messages + wa_pro_audit_log (RPC pode ter feito o seu proprio
  // audit interno · log adicional aqui e defensivo · fail-tolerante).
  await repos.waProAudit.logQuery({
    msg: {
      clinicId,
      phone,
      direction: 'inbound',
      content: text,
      intent: innerIntent,
      intentData: rpcResult.intent_metadata ?? null,
      status: 'sent',
    },
    audit: {
      clinicId,
      phone,
      query: text,
      intent: innerIntent,
      rpcCalled: 'wa_pro_handle_message',
      success: rpcResult.ok !== false,
      resultSummary: replyText.slice(0, 200),
    },
  })

  return {
    replyText,
    actions: [],
    stateTransitions: [],
    meta: {
      handler: 'b2b-admin-query',
      inner_intent: innerIntent,
      intent_metadata: rpcResult.intent_metadata ?? null,
    },
  }
}
