/**
 * /b2b/analytics layout · pass-through.
 *
 * 2026-04-26: AlertsBanner removido daqui · todos os alertas (critical_alerts +
 * insights cross-partnership + system insights) agora consolidados no sino do
 * AppHeader. Pedido Alden: "notificacao da Dani Mendes continua aparecendo
 * dentro da tela e nao nas alertas".
 */

export default function AnalyticsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col w-full h-full overflow-hidden">{children}</div>
  )
}
