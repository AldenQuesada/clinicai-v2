export { cn } from './cn'
export { normalizePhoneBR, isValidPhoneBR, formatPhoneBR, phoneVariants, canonicalPhoneBR } from './phone'
export { isGoodHumanName, shouldUpdateName } from './name'
export { formatDateBR, daysAgo, isToday } from './date'
export { renderTemplate, extractTemplateVars } from './render-template'
export type { TemplateVars, RenderTemplateOptions } from './render-template'
export { validateCronSecret, timingSafeEqualString } from './cron'
export type { CronAuthRejection } from './cron'

// Camada 7 (2026-04-28) · masks de formulario + sex map
export {
  maskCpf,
  unmaskCpf,
  isValidCpfFormat,
  maskRg,
  unmaskRg,
  maskPhoneDisplay,
  maskCep,
  unmaskCep,
  isValidEmail,
} from './masks'
export {
  SEX_OPTIONS,
  normalizeSex,
  sexLabel,
  type PatientSex,
} from './sex-map'

// CRM_PARITY_R2 · Money helper (port de window.Money legacy)
export {
  Money,
  toCents,
  fromCents,
  round2,
  add as moneyAdd,
  sub as moneySub,
  sum as moneySum,
  isZero as moneyIsZero,
  eq as moneyEq,
  lt as moneyLt,
  lte as moneyLte,
  gt as moneyGt,
  gte as moneyGte,
  abs as moneyAbs,
  format as moneyFormat,
  sumGross,
  sumDiscount,
  sumNet,
  sumPayments,
  balance as moneyBalance,
  derivePaymentStatus,
  type ProcedureItemLike,
  type PaymentLike,
} from './money'
