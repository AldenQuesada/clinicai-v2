/**
 * Mira · dashboard placeholder (P0).
 *
 * P1: lista de parcerias, vouchers, templates B2B, audit log.
 * P0: tela informativa pra confirmar deploy + porta 3006 OK.
 */

export const dynamic = 'force-dynamic'

export default function DashboardPage() {
  return (
    <main className="flex-1 flex items-center justify-center p-8">
      <div className="max-w-xl text-center space-y-4">
        <h1 className="text-3xl font-display tracking-wide">Mira · WhatsApp B2B</h1>
        <p className="text-sm opacity-80">
          P0 deployed · webhook ativo em <code>/api/webhook/evolution</code>.
        </p>
        <p className="text-xs opacity-60">
          UI admin (parcerias, vouchers, templates) entra na fase P1.
        </p>
      </div>
    </main>
  )
}
