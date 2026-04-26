/**
 * NextStepHint · sec 3 do modal admin legacy.
 *
 * Mirror 1:1 de `_nextStepHint(p)` em b2b-detail.ui.js (linhas 63-99).
 * Mostra "Proximo passo" baseado no status + DNA da parceria.
 *
 * Aparece no topo da tab Detalhe.
 */

import type { B2BPartnershipDTO } from '@clinicai/repositories'

export function NextStepHint({ partnership }: { partnership: B2BPartnershipDTO }) {
  const dnaScore = partnership.dnaScore ?? 0
  const dnaOk = dnaScore >= 7
  const dnaFilled =
    partnership.dnaExcelencia != null &&
    partnership.dnaEstetica != null &&
    partnership.dnaProposito != null

  let next: string | null = null
  let reason: string | null = null
  let action: string | null = null

  if (partnership.status === 'prospect') {
    next = 'Avaliar DNA'
    reason = 'Prospect precisa passar pela avaliacao DNA antes de virar contrato.'
    action = !dnaFilled
      ? 'Preencha as notas DNA no botao Editar ou va direto pra "Avaliar DNA" aqui.'
      : null
  } else if (partnership.status === 'dna_check') {
    if (!dnaFilled) {
      next = 'Preencher DNA'
      reason = 'Faltam notas de DNA (excelencia, estetica, proposito).'
      action = 'Clique em Editar e preencha as 3 notas (cada uma de 0 a 10).'
    } else if (!dnaOk) {
      next = 'DNA insuficiente'
      reason = `Score atual ${dnaScore.toFixed(1)}/10 (minimo 7 pra avancar). Reavalie ou encerre.`
    } else {
      next = 'Ativar'
      reason = `DNA aprovado (${dnaScore.toFixed(1)}/10). Pode ativar direto (boca-a-boca) ou passar por contrato primeiro.`
    }
  } else if (partnership.status === 'contract') {
    next = 'Ativa'
    reason = 'Contrato fechado? Ative pra Mira comecar a enviar vouchers.'
  }

  if (!next) return null

  return (
    <div className="b2b-next-step">
      <div className="b2b-next-step-label">Proximo passo</div>
      <div className="b2b-next-step-title">{next}</div>
      <div className="b2b-next-step-reason">{reason}</div>
      {action ? <div className="b2b-next-step-action">{action}</div> : null}
    </div>
  )
}
