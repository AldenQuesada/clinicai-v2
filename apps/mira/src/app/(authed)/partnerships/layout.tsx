/**
 * /partnerships layout · adiciona slot @modal pra intercepting route.
 *
 * Pedido Alden 2026-04-26: clicar no card de parceira abre OVERLAY
 * (nao navega) · poupa 1 click · lista fica visivel atras.
 *
 * Padrao Next.js parallel + intercepting routes:
 *   - children          · /partnerships (lista) renderiza sempre
 *   - @modal slot       · /partnerships/(.)[id] intercepta navegacao
 *                          do link e renderiza overlay sobre a lista
 *   - @modal/default    · null quando nenhum modal ativo
 *
 * Acesso direto a /partnerships/[id] (URL ou reload) cai em [id]/page.tsx
 * full screen · intercepting NAO ativa em hard navigation.
 */

export default function PartnershipsLayout({
  children,
  modal,
}: {
  children: React.ReactNode
  modal: React.ReactNode
}) {
  return (
    <>
      {children}
      {modal}
    </>
  )
}
