'use client'

import { useEffect, useState } from 'react'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'
import { CommandPalette } from './CommandPalette'
import { MobileDrawer } from './MobileDrawer'

interface Props {
  user: { email: string; isAdmin: boolean } | null
  children: React.ReactNode
}

export function Shell({ user, children }: Props) {
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [drawerOpen, setDrawerOpen] = useState(false)

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
      <Sidebar user={user} />
      <MobileDrawer open={drawerOpen} onClose={() => setDrawerOpen(false)} user={user} />
      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        isAdmin={user?.isAdmin ?? false}
      />

      <div className="lg:pl-[240px] min-h-screen flex flex-col">
        <Topbar
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenMobileNav={() => setDrawerOpen(true)}
        />
        <main className="flex-1">{children}</main>
      </div>
    </>
  )
}
