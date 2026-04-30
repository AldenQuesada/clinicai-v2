// Type declarations for ClinicAI utils exposed on window/globalThis
// Used by tsconfig.checkjs.json to validate JSDoc-typed JS files.

interface ClinicMoney {
  toCents(v: number | string | null | undefined): number
  fromCents(c: number): number
  eq(a: number | string, b: number | string): boolean
  add(...args: Array<number | string>): number
  sub(a: number | string, b: number | string): number
  sum(arr: Array<number | string>): number
  sumEq(arr: Array<number | string>, expected: number | string): boolean
  div(value: number | string, parts: number): number
  parse(s: number | string | null | undefined): number
  format(v: number | string, withSymbol?: boolean): string
  isZero(v: number | string): boolean
  clamp(v: number | string, min: number | string, max: number | string): number
}

interface ClinicHtmlTag {
  (strings: TemplateStringsArray, ...values: any[]): string
  escape(s: any): string
  attr(s: any): string
  raw(value: any): { __rawHtml: boolean; value: string }
}

interface ClinicModal {
  alert(opts: any): { close(reason?: string): void; overlay: HTMLElement; body: HTMLElement }
  confirm(opts: any): Promise<boolean>
  dialog(opts: any): { close(reason?: string): void; overlay: HTMLElement; body: HTMLElement }
  closeAll(): void
}

interface ClinicLogger {
  debug(msg: string, ctx?: object): void
  info(msg: string, ctx?: object): void
  warn(msg: string, ctx?: object): void
  error(msg: string, ctx?: object): void
  setLevel(level: 'debug' | 'info' | 'warn' | 'error'): void
}

interface ClinicFeatureFlags {
  isEnabled(name: string): boolean
  enable(name: string): void
  disable(name: string): void
  list(): Record<string, boolean>
}

interface Window {
  Money: ClinicMoney
  html: ClinicHtmlTag
  Modal: ClinicModal
  Logger: ClinicLogger
  FeatureFlags: ClinicFeatureFlags
}

declare const Money: ClinicMoney
declare const html: ClinicHtmlTag
declare const Modal: ClinicModal
declare const Logger: ClinicLogger
declare const FeatureFlags: ClinicFeatureFlags

interface HTMLElement {
  _closed?: boolean
}

declare const module: { exports: any } | undefined
declare const globalThis: any
