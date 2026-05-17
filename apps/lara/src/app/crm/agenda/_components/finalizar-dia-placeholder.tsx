/**
 * FinalizarDiaPlaceholder · botão visual disabled · R3_CRM_3B.5.
 *
 * Espelha o botão "Fechar o Dia" do header legacy (clinic-dashboard
 * `js/api.js:2066 abrirFecharDia()`). Audit confirmou que a função
 * legacy é UI-only: abre modal listando appointments com flag
 * `pendente_finalizar=true AND status !== 'finalizado'`, e cada item
 * linka pra `openFinalizarModal(id)` (mutation real isolada lá).
 *
 * Pra V2 implementar de fato:
 *   1. schema precisa de campo `pendente_finalizar` em appointments OU
 *      derivação canônica (ex: status `aguardando` + scheduled_date < hoje)
 *   2. RPC/Server Action equivalente a `openFinalizarModal`
 *   3. lista + finalização individual em modal
 *
 * Nada disso está canonizado ainda · Alden autorizou apenas placeholder
 * visual sem mutation. Botão fica disabled com tooltip explicativo.
 *
 * ZERO mutation · ZERO chamada API · zero side effect.
 */

import { Button } from '@clinicai/ui'

const PLACEHOLDER_TITLE =
  'Finalização do dia será ativada após validação do fluxo operacional.'

export function FinalizarDiaPlaceholder() {
  return (
    <Button
      size="sm"
      variant="outline"
      disabled
      title={PLACEHOLDER_TITLE}
      aria-label="Finalizar Dia (em validação)"
    >
      Finalizar Dia
    </Button>
  )
}
