/**
 * useSecretariaActions · ações operacionais da inbox da Secretaria.
 *
 * P2 refactor (2026-06-03) · extraído de secretaria/page.tsx pra reduzir a
 * concentração de responsabilidades (o page.tsx tinha ~864 linhas com estado,
 * handleAction gigante, modais, KPIs e layout num único client component · a
 * lógica de `transfer` foi onde moraram os bugs P1 do Prompt 1).
 *
 * Encapsula: modalConfig + handleAction (resolve/archive/transfer Mirian/
 * transfer Alden/devolver) + a validação de response introduzida no Prompt 1
 * (só avisa o paciente após assume + assign confirmados · erro no próprio
 * modal · sem mascarar falha).
 *
 * Regras (escopo fechado · sem mudar produto):
 *   - Hook puro · NÃO importa componente visual nem conhece JSX.
 *   - Pode importar DOCTOR_USER_ID / ALDEN_USER_ID (literals não duplicados
 *     no page.tsx · o page deixou de importar DOCTOR_USER_ID).
 *   - Não envia mensagem automática antes do assign confirmado.
 *   - Não mascara erro (mantém modal aberto + mensagem em description).
 *
 * Nota técnica (PARTE D · drift): /conversas/page.tsx tem padrão parecido
 * (handleAction inline) mas NÃO foi refatorado nesta etapa de propósito —
 * extração compartilhada só depois de estabilizar a /secretaria, pra não
 * forçar uma abstração prematura entre as duas telas que compartilham motor.
 */

import { useState } from 'react';
import type { Dispatch, SetStateAction } from 'react';
import { DOCTOR_USER_ID, ALDEN_USER_ID } from '@/lib/clinic-profiles';
import type { Conversation } from '../../conversas/hooks/useConversations';

export type SecretariaAction =
  | 'assume'
  | 'resolve'
  | 'clear_kpi'
  | 'archive'
  | 'transfer'
  | 'transfer_alden'
  | 'devolver';

export interface SecretariaModalConfig {
  isOpen: boolean;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
}

interface UseSecretariaActionsParams {
  selectedConversation: Conversation | null;
  setSelectedConversation: Dispatch<SetStateAction<Conversation | null>>;
  sendMessage: (
    overrideContent?: string,
    explicitReplyToMessageId?: string | null,
  ) => Promise<void>;
  /** Chamado após "Encerrar" (clear_kpi) p/ atualizar lista + KPIs na hora. */
  onKpiCleared?: () => void | Promise<void>;
}

export function useSecretariaActions({
  selectedConversation,
  setSelectedConversation,
  sendMessage,
  onKpiCleared,
}: UseSecretariaActionsParams) {
  const [modalConfig, setModalConfig] = useState<SecretariaModalConfig | null>(null);

  const handleAction = async (action: SecretariaAction) => {
    if (!selectedConversation?.conversation_id) return;
    const cid = selectedConversation.conversation_id;

    if (action === 'resolve') {
      // `wa_conversations.status` é text SEM CHECK · 'resolved' é aceito pelo
      // banco e pelo endpoint (ALLOWED). A inbox filtra por status='active',
      // então 'resolved' sai da lista igual 'archived' (e reabre em nova msg),
      // mas analytics/operação distinguem RESOLVIDA de ARQUIVADA. (Corrige
      // comentário antigo equivocado sobre CHECK · P1 auditoria 2026-06-03.)
      setModalConfig({
        isOpen: true,
        title: 'Resolver Conversa',
        description:
          'Marcar conversa como resolvida? Ela sai da lista de pendências.',
        confirmText: 'Resolver',
        onConfirm: async () => {
          await fetch(`/api/conversations/${cid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'resolved' }),
          });
          setSelectedConversation(null);
          setModalConfig(null);
        },
      });
    } else if (action === 'archive') {
      setModalConfig({
        isOpen: true,
        title: 'Arquivar Conversa',
        description:
          'Arquivar essa conversa? Ela volta caso o paciente mande nova mensagem.',
        confirmText: 'Arquivar',
        onConfirm: async () => {
          await fetch(`/api/conversations/${cid}/status`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: 'archived' }),
          });
          setSelectedConversation(null);
          setModalConfig(null);
        },
      });
    } else if (action === 'clear_kpi') {
      // ENCERRAR operacional · seta kpi_cleared_at via /kpi-clear.
      // NÃO muda status, NÃO desseleciona, NÃO remove da lista — só limpa
      // os KPIs Aguardando/Urgente. Reabre sozinho se o paciente falar de novo.
      setModalConfig({
        isOpen: true,
        title: 'Encerrar pendência',
        description:
          'Remove esta conversa de Aguardando/Urgente sem tirar da lista. Se o paciente falar de novo, ela volta automaticamente.',
        confirmText: 'Encerrar',
        onConfirm: async () => {
          const res = await fetch(`/api/conversations/${cid}/kpi-clear`, {
            method: 'POST',
          });
          if (!res.ok) {
            setModalConfig((m) =>
              m ? { ...m, description: '⚠️ Falha ao encerrar. A conversa não foi alterada. Tente novamente.' } : m,
            );
            return;
          }
          // mantém a conversa selecionada e na lista; só sai das lentes de KPI.
          setModalConfig(null);
          await onKpiCleared?.();
        },
      });
    } else if (action === 'transfer') {
      // Transferir para Dra (Caminho A · Alden 2026-05-05)
      // Pausa Lara via /assume + atribui à Mirian via /assign + msg auto.
      setModalConfig({
        isOpen: true,
        title: 'Transferir para Dra. Mirian',
        description:
          'Deseja transferir esta conversa para a Dra. Mirian? A conversa vai pra fila Dra · paciente é avisado.',
        confirmText: 'Transferir',
        onConfirm: async () => {
          // P1 · só avisa o paciente DEPOIS de assume + assign confirmados.
          // Em falha: mantém modal aberto com erro (reusa description · sem
          // toast novo) e NÃO envia "Vou encaminhar..." ao paciente.
          const assumeRes = await fetch(`/api/conversations/${cid}/assume`, { method: 'POST' });
          if (!assumeRes.ok) {
            setModalConfig((m) =>
              m ? { ...m, description: '⚠️ Falha ao pausar a IA. Nada foi enviado ao paciente. Tente novamente.' } : m,
            );
            return;
          }
          const assignRes = await fetch(`/api/conversations/${cid}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: DOCTOR_USER_ID }),
          });
          const assignData = await assignRes.json().catch(() => ({}));
          if (!assignRes.ok || assignData?.ok === false) {
            setModalConfig((m) =>
              m ? { ...m, description: '⚠️ Falha ao atribuir à Dra. Mirian. Nada foi enviado ao paciente. Tente novamente.' } : m,
            );
            return;
          }
          await sendMessage(
            'Vou encaminhar para a Dra. Mirian avaliar com carinho e já te retorno.',
          );
          setSelectedConversation((prev) =>
            prev
              ? {
                  ...prev,
                  ai_enabled: false,
                  assigned_to: DOCTOR_USER_ID,
                  assigned_at: assignData?.assigned_at || new Date().toISOString(),
                }
              : prev,
          );
          setModalConfig(null);
        },
      });
    } else if (action === 'transfer_alden') {
      // Onda 3 (2026-05-08) · Transferir pra Dr Alden · paralelo ao Mirian.
      // Mesmo POST /assign body { user_id: ALDEN_USER_ID } · view (mig 146)
      // reconhece via UUID puro · KPI/aba Alden separados.
      setModalConfig({
        isOpen: true,
        title: 'Transferir para Dr. Alden',
        description:
          'Deseja transferir esta conversa para o Dr. Alden? A conversa vai pra fila Alden · paciente é avisado.',
        confirmText: 'Transferir',
        onConfirm: async () => {
          // P1 · só avisa o paciente DEPOIS de assume + assign confirmados.
          const assumeRes = await fetch(`/api/conversations/${cid}/assume`, { method: 'POST' });
          if (!assumeRes.ok) {
            setModalConfig((m) =>
              m ? { ...m, description: '⚠️ Falha ao pausar a IA. Nada foi enviado ao paciente. Tente novamente.' } : m,
            );
            return;
          }
          const assignRes = await fetch(`/api/conversations/${cid}/assign`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ user_id: ALDEN_USER_ID }),
          });
          const assignData = await assignRes.json().catch(() => ({}));
          if (!assignRes.ok || assignData?.ok === false) {
            setModalConfig((m) =>
              m ? { ...m, description: '⚠️ Falha ao atribuir ao Dr. Alden. Nada foi enviado ao paciente. Tente novamente.' } : m,
            );
            return;
          }
          await sendMessage(
            'Vou encaminhar para o Dr. Alden avaliar com carinho e já te retorno.',
          );
          setSelectedConversation((prev) =>
            prev
              ? {
                  ...prev,
                  ai_enabled: false,
                  assigned_to: ALDEN_USER_ID,
                  assigned_at: assignData?.assigned_at || new Date().toISOString(),
                }
              : prev,
          );
          setModalConfig(null);
        },
      });
    } else if (action === 'devolver') {
      // Devolver para Secretária · DELETE /assign limpa assigned_to.
      // Follow-up audit-check PR #47: só atualiza UI após unassign confirmado.
      setModalConfig({
        isOpen: true,
        title: 'Devolver para Secretária',
        description: 'Deseja devolver essa conversa para a fila da Secretária?',
        confirmText: 'Devolver',
        onConfirm: async () => {
          const unassignRes = await fetch(`/api/conversations/${cid}/assign`, { method: 'DELETE' });
          const unassignData = await unassignRes.json().catch(() => ({}));
          if (!unassignRes.ok || unassignData?.ok === false) {
            setModalConfig((m) =>
              m ? { ...m, description: '⚠️ Falha ao devolver para a Secretária. A conversa não foi alterada. Tente novamente.' } : m,
            );
            return;
          }
          setSelectedConversation((prev) =>
            prev ? { ...prev, assigned_to: null, assigned_at: null } : prev,
          );
          setModalConfig(null);
        },
      });
    }
    // 'assume' nao faz sentido na inbox secretaria (ja e humano)
  };

  const isModalOpen = !!modalConfig?.isOpen;

  return { modalConfig, setModalConfig, handleAction, isModalOpen };
}
