/**
 * Root page · redirect direto pro dashboard.
 * Middleware ja garantiu que user ta autenticado antes de chegar aqui.
 */

import { redirect } from 'next/navigation'

export default function Home() {
  redirect('/dashboard')
}
