export { cn } from './cn'
export { normalizePhoneBR, isValidPhoneBR, formatPhoneBR, phoneVariants } from './phone'
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
