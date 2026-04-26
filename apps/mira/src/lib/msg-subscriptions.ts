/**
 * Helpers de subscription individual de mensagens automaticas (mig 800-30+).
 *
 * Modelo: cada wa_numbers.permissions tem 4 categorias (agenda, pacientes,
 * financeiro, b2b) que ligam acesso UI + recebimento. Alem disso, permissions.msg
 * e um mapa { [msgKey]: boolean } com overrides por mensagem · ausente = subscribed.
 *
 * Crons proativos chamam filterSubscribers/isSubscribed pra honrar a UI de
 * /configuracoes?tab=professionals (cards com checkbox por mensagem).
 */
import type { WaNumberFullDTO } from '@clinicai/repositories'

export type PermissionCategory = 'agenda' | 'pacientes' | 'financeiro' | 'b2b'

type PermissionsLike = {
  agenda?: boolean
  pacientes?: boolean
  financeiro?: boolean
  b2b?: boolean
  msg?: { [key: string]: boolean }
} | null | undefined

/**
 * Inscrito = categoria nao desativada (default true) E key especifica nao
 * marcada como false. Default eh receber.
 */
export function isSubscribed(
  perms: PermissionsLike,
  category: PermissionCategory,
  msgKey: string,
): boolean {
  if (perms?.[category] === false) return false
  return perms?.msg?.[msgKey] !== false
}

/**
 * Filtra wa_numbers ativos + inscritos na categoria + na key especifica.
 * Tambem aplica sanity check de phone (>=10 digitos · E.164 minimo).
 */
export function filterSubscribers(
  numbers: WaNumberFullDTO[],
  category: PermissionCategory,
  msgKey: string,
): WaNumberFullDTO[] {
  return numbers.filter(
    (n) =>
      n.isActive &&
      (n.phone ?? '').replace(/\D/g, '').length >= 10 &&
      isSubscribed(n.permissions, category, msgKey),
  )
}
