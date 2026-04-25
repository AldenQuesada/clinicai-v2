'use server'

/**
 * Server Actions · login + logout.
 * Cookie shared cross-subdomain (.miriandpaula.com.br) configurado no
 * @clinicai/supabase/server (auto-detect via NEXT_PUBLIC_APP_URL).
 */

import { redirect } from 'next/navigation'
import { cookies } from 'next/headers'
import { createServerClient } from '@clinicai/supabase'

export async function loginAction(formData: FormData) {
  const email = String(formData.get('email') || '').trim()
  const password = String(formData.get('password') || '').trim()
  const redirectTo = String(formData.get('redirect') || '/conversas')

  if (!email || !password) {
    redirect('/login?error=' + encodeURIComponent('Email e senha obrigatorios'))
  }

  const cookieStore = await cookies()
  const supabase = createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options)
      })
    },
  })

  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    const msg = error.message === 'Invalid login credentials'
      ? 'Email ou senha incorretos'
      : error.message
    redirect('/login?error=' + encodeURIComponent(msg))
  }

  redirect(redirectTo)
}

export async function logoutAction() {
  const cookieStore = await cookies()
  const supabase = createServerClient({
    getAll: () => cookieStore.getAll(),
    setAll: (cookiesToSet) => {
      cookiesToSet.forEach(({ name, value, options }) => {
        cookieStore.set(name, value, options)
      })
    },
  })

  await supabase.auth.signOut()
  redirect('/login')
}
