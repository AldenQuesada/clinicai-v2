'use client'

import { useEffect, useState } from 'react'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'

interface Props {
  user: { email: string; isAdmin: boolean } | null
  children: React.ReactNode
}

export function Shell({ user, children }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false)

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((v) => !v)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        isAdmin={user?.isAdmin ?? false}
      />

      <div className="min-h-screen flex flex-col">
        <Topbar user={user} />
        <main className="flex-1">{children}</main>
      </div>
    </>
  )
}
