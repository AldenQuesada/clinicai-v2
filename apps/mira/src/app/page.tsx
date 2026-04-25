/**
 * Mira · root.
 *
 * P0: redirect /dashboard (placeholder · UI admin de parcerias/templates entra na P1).
 * Middleware garante auth antes desse ponto.
 */

import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
