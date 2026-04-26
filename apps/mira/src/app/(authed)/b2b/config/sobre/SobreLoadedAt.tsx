'use client'

import { useEffect, useState } from 'react'

/**
 * Mostra timestamp de quando o usuário abriu a página (lado-cliente, igual
 * ao "new Date().toLocaleString" do b2b-config-about.ui.js original).
 */
export function SobreLoadedAt() {
  const [ts, setTs] = useState<string>('')
  useEffect(() => {
    setTs(new Date().toLocaleString('pt-BR'))
  }, [])
  return <strong>{ts || '—'}</strong>
}
