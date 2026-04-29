/**
 * Cliente Asaas API v3 · createCustomer / createPayment / createSubscription /
 * validateWebhookToken.
 *
 * Auth: header `access_token: <ASAAS_API_KEY>`. Token sandbox/prod separados.
 *
 * Webhook signature: Asaas envia `asaas-access-token` header em todo webhook
 * com o valor do `authToken` configurado no painel. Salvar em
 * ASAAS_WEBHOOK_TOKEN e validar com timing-safe compare.
 *
 * Pricing: Asaas usa decimal (47.00), NÃO cents. Helper `centsToAsaas` converte.
 *
 * Docs: https://docs.asaas.com/reference/criar-novo-cliente
 */

const ASAAS_BASE = process.env.ASAAS_API_BASE_URL ?? 'https://api-sandbox.asaas.com/v3'

function getApiKey(): string {
  const key = process.env.ASAAS_API_KEY
  if (!key) throw new Error('ASAAS_API_KEY not configured')
  return key
}

function centsToAsaas(cents: number): number {
  return Math.round(cents) / 100
}

async function asaasFetch<T>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string> } = {},
): Promise<T> {
  const url = new URL(`${ASAAS_BASE}${path}`)
  if (init.query) {
    for (const [k, v] of Object.entries(init.query)) url.searchParams.set(k, v)
  }

  const res = await fetch(url.toString(), {
    method: init.method ?? 'GET',
    headers: {
      'Content-Type': 'application/json',
      access_token: getApiKey(),
      'User-Agent': 'flipbook-clinicai-v2',
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  })

  const text = await res.text()
  let data: unknown = null
  try {
    data = text ? JSON.parse(text) : null
  } catch {
    /* manter texto bruto se não for JSON */
  }

  if (!res.ok) {
    const errorMsg =
      (data as { errors?: Array<{ description: string }> })?.errors
        ?.map((e) => e.description)
        .join(' · ') ?? text ?? `HTTP ${res.status}`
    throw new AsaasError(errorMsg, res.status, data)
  }

  return data as T
}

export class AsaasError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly response?: unknown,
  ) {
    super(message)
    this.name = 'AsaasError'
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// Customers
// ═══════════════════════════════════════════════════════════════════════════

export interface CreateCustomerInput {
  name: string
  cpfCnpj: string                  // Asaas exige · só dígitos
  mobilePhone?: string             // só dígitos · Brasil sem +55 (ex: 44999998888)
  email?: string
  externalReference?: string       // nosso flipbook_buyers.id pra facilitar lookup
  notificationDisabled?: boolean   // bloqueia comm Asaas (queremos enviar nós via Lara)
}

export interface AsaasCustomer {
  id: string
  name: string
  email?: string
  mobilePhone?: string
  cpfCnpj?: string
  externalReference?: string
}

export async function createCustomer(input: CreateCustomerInput): Promise<AsaasCustomer> {
  return asaasFetch<AsaasCustomer>('/customers', {
    method: 'POST',
    body: {
      name: input.name,
      cpfCnpj: input.cpfCnpj.replace(/\D+/g, ''),
      mobilePhone: input.mobilePhone?.replace(/\D+/g, ''),
      email: input.email,
      externalReference: input.externalReference,
      notificationDisabled: input.notificationDisabled ?? true,
    },
  })
}

/**
 * Procura customer existente por externalReference. Idempotência ao re-submeter
 * o mesmo buyer.
 */
export async function findCustomerByExternalReference(
  externalReference: string,
): Promise<AsaasCustomer | null> {
  const res = await asaasFetch<{ data: AsaasCustomer[] }>('/customers', {
    query: { externalReference },
  })
  return res.data[0] ?? null
}

// ═══════════════════════════════════════════════════════════════════════════
// Payments (one_time)
// ═══════════════════════════════════════════════════════════════════════════

export type AsaasBillingType = 'BOLETO' | 'CREDIT_CARD' | 'PIX' | 'UNDEFINED'

export interface CreatePaymentInput {
  customer: string                 // Asaas customer id
  amountCents: number              // converte pra decimal antes de enviar
  description: string
  externalReference?: string       // nosso flipbook_purchases.id
  /** UNDEFINED = cliente escolhe (PIX/boleto/cartão na hosted page) · default */
  billingType?: AsaasBillingType
  dueDateOverride?: string         // ISO date · default = hoje + 3 dias
}

export interface AsaasPayment {
  id: string
  customer: string
  status: string                   // PENDING|RECEIVED|CONFIRMED|OVERDUE|REFUNDED|...
  value: number
  netValue: number
  billingType: AsaasBillingType
  dueDate: string
  invoiceUrl: string
  bankSlipUrl?: string
  externalReference?: string
}

export async function createPayment(input: CreatePaymentInput): Promise<AsaasPayment> {
  const dueDate = input.dueDateOverride ?? defaultDueDate(3)
  return asaasFetch<AsaasPayment>('/payments', {
    method: 'POST',
    body: {
      customer: input.customer,
      billingType: input.billingType ?? 'UNDEFINED',
      value: centsToAsaas(input.amountCents),
      dueDate,
      description: input.description,
      externalReference: input.externalReference,
    },
  })
}

export async function getPayment(id: string): Promise<AsaasPayment> {
  return asaasFetch<AsaasPayment>(`/payments/${id}`)
}

// ═══════════════════════════════════════════════════════════════════════════
// Subscriptions (recurring)
// ═══════════════════════════════════════════════════════════════════════════

export type AsaasCycle = 'WEEKLY' | 'BIWEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'SEMIANNUALLY' | 'YEARLY'

export interface CreateSubscriptionInput {
  customer: string
  amountCents: number
  cycle: AsaasCycle
  description: string
  externalReference?: string
  billingType?: AsaasBillingType
  /** ISO date da primeira cobrança · default = hoje */
  nextDueDate?: string
  /** Quando termina (null = recurring sem fim) */
  endDate?: string
}

export interface AsaasSubscription {
  id: string
  customer: string
  status: string                   // ACTIVE|EXPIRED
  value: number
  cycle: AsaasCycle
  nextDueDate: string
  externalReference?: string
}

export async function createSubscription(input: CreateSubscriptionInput): Promise<AsaasSubscription> {
  return asaasFetch<AsaasSubscription>('/subscriptions', {
    method: 'POST',
    body: {
      customer: input.customer,
      billingType: input.billingType ?? 'UNDEFINED',
      value: centsToAsaas(input.amountCents),
      cycle: input.cycle,
      nextDueDate: input.nextDueDate ?? defaultDueDate(0),
      description: input.description,
      externalReference: input.externalReference,
      endDate: input.endDate,
    },
  })
}

/**
 * Pega a primeira (mais recente) cobrança gerada pra uma subscription. Útil pra
 * obter `invoiceUrl` da primeira parcela auto-gerada — Asaas cria o payment
 * imediatamente após criar a subscription.
 */
export async function findFirstPaymentBySubscription(
  subscriptionId: string,
): Promise<AsaasPayment | null> {
  const res = await asaasFetch<{ data: AsaasPayment[] }>(`/payments`, {
    query: { subscription: subscriptionId, limit: '1', order: 'desc' },
  })
  return res.data[0] ?? null
}

// ═══════════════════════════════════════════════════════════════════════════
// Webhook signature validation
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Asaas envia o token configurado no painel via header `asaas-access-token`
 * em CADA webhook recebido. Validação = comparar com env timing-safe.
 *
 * Configuração no painel Asaas:
 *   1. Settings → Webhooks → Adicionar URL
 *   2. URL: https://flipbook.../api/webhooks/asaas
 *   3. Events: PAYMENT_CONFIRMED, PAYMENT_RECEIVED, PAYMENT_REFUNDED,
 *      SUBSCRIPTION_CREATED, SUBSCRIPTION_DELETED, etc
 *   4. Auth Token: gerar string aleatória, salvar em ASAAS_WEBHOOK_TOKEN env
 */
export function validateWebhookToken(receivedToken: string | null): boolean {
  const expected = process.env.ASAAS_WEBHOOK_TOKEN
  if (!expected) {
    console.error('[asaas] ASAAS_WEBHOOK_TOKEN not configured — webhook rejected')
    return false
  }
  if (!receivedToken) return false
  return timingSafeEqual(receivedToken, expected)
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let mismatch = 0
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return mismatch === 0
}

// ═══════════════════════════════════════════════════════════════════════════
// Utils
// ═══════════════════════════════════════════════════════════════════════════

function defaultDueDate(plusDays: number): string {
  const d = new Date()
  d.setDate(d.getDate() + plusDays)
  return d.toISOString().split('T')[0] // YYYY-MM-DD
}

/**
 * Mapeia billing do nosso flipbook_offers.billing → Asaas cycle.
 * one_time não vira subscription (vira payment). Esses 2 casos cobrem nosso uso.
 */
export function offerBillingToAsaasCycle(billing: 'monthly' | 'yearly'): AsaasCycle {
  return billing === 'yearly' ? 'YEARLY' : 'MONTHLY'
}
