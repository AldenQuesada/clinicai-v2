/**
 * Mira · dashboard placeholder.
 *
 * Bloco 3 substitui isso por KPIs B2B reais (parcerias, vouchers, conversoes,
 * top performers, alerts). Pra Bloco 2 mantem placeholder mas dentro do
 * (authed) layout pra validar o header.
 */

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-xl text-center space-y-4">
        <h1 className="text-3xl font-display tracking-wide">
          <span className="font-cursive-italic text-[hsl(var(--primary))]">Mira</span>
          {' · '}WhatsApp B2B
        </h1>
        <p className="text-sm opacity-80">
          Webhook ativo em <code>/api/webhook/evolution</code>.
        </p>
        <p className="text-xs opacity-60">
          KPIs B2B + lista de parcerias + vouchers vem nas proximas blocos da P1.
        </p>
      </div>
    </main>
  )
}
