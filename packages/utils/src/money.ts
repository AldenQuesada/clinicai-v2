/**
 * Money · helper TS para somar/comparar valores monetários sem rounding bug.
 *
 * CRM_PARITY_R2 · port do legacy `window.Money` (clinic-dashboard
 * `js/utils/money.js`). Usa centavos (inteiros) internamente para evitar
 * float drift quando soma N parcelas.
 *
 * Contrato:
 *   - Aceita number | string | null | undefined
 *   - Converte para centavos via toCents · trunca em 2 casas (round half away from zero)
 *   - Operações retornam number em 2 casas decimais
 *   - Comparações usam tolerância 0.01 (epsilon de 1 centavo)
 *
 * Limitações conhecidas:
 *   - Não suporta moedas múltiplas (sempre BRL)
 *   - Não localiza separadores · format() retorna "R$ 1.234,56" BRL
 */

const CENTS = 100
const EPS = 0.005 // meio centavo · seguro para comparar floats com 2 casas

type MoneyValue = number | string | null | undefined

function parseValue(v: MoneyValue): number {
  if (v === null || v === undefined || v === '') return 0
  if (typeof v === 'number') {
    return Number.isFinite(v) ? v : 0
  }
  // string · aceita "1.234,56" (BR) ou "1,234.56" (US-like)
  const s = String(v).replace(/[^\d,.-]/g, '')
  if (!s) return 0
  // Se tem vírgula como último separador, é BR (1.234,56 → 1234.56)
  const lastComma = s.lastIndexOf(',')
  const lastDot = s.lastIndexOf('.')
  let normalized: string
  if (lastComma > lastDot) {
    // BR: pontos são milhares, vírgula é decimal
    normalized = s.replace(/\./g, '').replace(',', '.')
  } else {
    // US ou só com ponto
    normalized = s.replace(/,/g, '')
  }
  const n = parseFloat(normalized)
  return Number.isFinite(n) ? n : 0
}

export function toCents(v: MoneyValue): number {
  return Math.round(parseValue(v) * CENTS)
}

export function fromCents(c: number): number {
  if (!Number.isFinite(c)) return 0
  return Math.round(c) / CENTS
}

export function round2(v: MoneyValue): number {
  return fromCents(toCents(v))
}

export function add(a: MoneyValue, b: MoneyValue): number {
  return fromCents(toCents(a) + toCents(b))
}

export function sub(a: MoneyValue, b: MoneyValue): number {
  return fromCents(toCents(a) - toCents(b))
}

export function sum(values: ReadonlyArray<MoneyValue>): number {
  let total = 0
  for (const v of values) total += toCents(v)
  return fromCents(total)
}

export function isZero(v: MoneyValue): boolean {
  return toCents(v) === 0
}

export function eq(a: MoneyValue, b: MoneyValue): boolean {
  return toCents(a) === toCents(b)
}

export function lt(a: MoneyValue, b: MoneyValue): boolean {
  return toCents(a) < toCents(b)
}

export function lte(a: MoneyValue, b: MoneyValue): boolean {
  return toCents(a) <= toCents(b)
}

export function gt(a: MoneyValue, b: MoneyValue): boolean {
  return toCents(a) > toCents(b)
}

export function gte(a: MoneyValue, b: MoneyValue): boolean {
  return toCents(a) >= toCents(b)
}

export function abs(v: MoneyValue): number {
  return fromCents(Math.abs(toCents(v)))
}

export function format(v: MoneyValue): string {
  const n = round2(v)
  return new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
  }).format(n)
}

// ── Domain-specific helpers (CRM_PARITY_R2) ─────────────────────────────────

export interface ProcedureItemLike {
  gross_amount?: MoneyValue
  grossAmount?: MoneyValue
  discount_amount?: MoneyValue
  discountAmount?: MoneyValue
  net_amount?: MoneyValue
  netAmount?: MoneyValue
}

export interface PaymentLike {
  amount?: MoneyValue
  status?: string | null
}

function pickGross(item: ProcedureItemLike): MoneyValue {
  return item.gross_amount ?? item.grossAmount ?? 0
}
function pickDiscount(item: ProcedureItemLike): MoneyValue {
  return item.discount_amount ?? item.discountAmount ?? 0
}
function pickNet(item: ProcedureItemLike): MoneyValue {
  return item.net_amount ?? item.netAmount ?? 0
}

export function sumGross(items: ReadonlyArray<ProcedureItemLike>): number {
  return sum(items.map(pickGross))
}

export function sumDiscount(items: ReadonlyArray<ProcedureItemLike>): number {
  return sum(items.map(pickDiscount))
}

export function sumNet(items: ReadonlyArray<ProcedureItemLike>): number {
  return sum(items.map(pickNet))
}

/**
 * Soma de payments · por default agrega só status='pago'. Passar
 * `{ includePending: true }` para somar pendentes também.
 */
export function sumPayments(
  payments: ReadonlyArray<PaymentLike>,
  opts: { onlyStatus?: 'pago' | 'pendente' | 'cancelado'; includePending?: boolean } = {},
): number {
  const filter = (p: PaymentLike): boolean => {
    if (opts.onlyStatus) return p.status === opts.onlyStatus
    if (opts.includePending) return p.status === 'pago' || p.status === 'pendente'
    return p.status === 'pago'
  }
  return sum(payments.filter(filter).map((p) => p.amount))
}

/**
 * Balance (saldo a pagar) · net_total - paid_total.
 * Negativo significa pagamento em excesso.
 */
export function balance(total: MoneyValue, paid: MoneyValue): number {
  return sub(total, paid)
}

/**
 * Derived payment_status canon · espelha view appointment_financial_summary.
 *
 * Returns:
 *   - 'cortesia'  se net_total = 0 AND tem courtesy item
 *   - 'pendente'  se net_total = 0 AND NÃO tem courtesy item (estado neutro)
 *   - 'pendente'  se paid_total = 0 (algo a cobrar mas nada pago)
 *   - 'parcial'   se 0 < paid_total < net_total
 *   - 'pago'      se paid_total >= net_total AND net_total > 0
 */
export function derivePaymentStatus(input: {
  netTotal: MoneyValue
  paidTotal: MoneyValue
  hasCourtesy?: boolean
}): 'cortesia' | 'pendente' | 'parcial' | 'pago' {
  if (isZero(input.netTotal)) {
    return input.hasCourtesy ? 'cortesia' : 'pendente'
  }
  if (isZero(input.paidTotal)) return 'pendente'
  if (lt(input.paidTotal, input.netTotal)) return 'parcial'
  return 'pago'
}

// ── Namespace export (compat com legacy `window.Money.sum(...)` shape) ──────

export const Money = {
  toCents,
  fromCents,
  round2,
  add,
  sub,
  sum,
  isZero,
  eq,
  lt,
  lte,
  gt,
  gte,
  abs,
  format,
  sumGross,
  sumDiscount,
  sumNet,
  sumPayments,
  balance,
  derivePaymentStatus,
}
