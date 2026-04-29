/**
 * useQuickTemplates · W-09 (SC-02 · Sprint C).
 *
 * Cache local do catalogo de templates ativos · 1 fetch no mount, dali pra
 * frente filtra client-side por keystroke (substring em slug OR name).
 * Sem roundtrip por tecla = autocomplete fluido.
 *
 * Debounce 200ms aplica somente na 1a load (caso o consumidor monte/desmonte
 * varias vezes em sequencia · evita N requests redundantes). Filtragem pos-cache
 * e instantanea (sem debounce, sem rede).
 *
 * Shape retornado: `{ id, slug, name, body }` · pronto pra dropdown render.
 */

import { useEffect, useRef, useState, useMemo } from 'react'

export interface QuickTemplate {
  id: string
  slug: string
  name: string
  body: string
}

const CACHE_KEY = '__lara_quick_templates_cache_v1'
const FETCH_DEBOUNCE_MS = 200

// Cache de modulo · sobrevive umount/mount do hook na mesma sessao,
// reseta no full reload (suficiente · usuarios criam template raramente).
let cachedTemplates: QuickTemplate[] | null = null
let inflight: Promise<QuickTemplate[]> | null = null

async function fetchAllTemplates(): Promise<QuickTemplate[]> {
  if (cachedTemplates) return cachedTemplates
  if (inflight) return inflight

  inflight = (async () => {
    try {
      const res = await fetch('/api/templates/quick')
      if (!res.ok) return []
      const payload = (await res.json()) as { items?: QuickTemplate[] }
      const items = Array.isArray(payload.items) ? payload.items : []
      cachedTemplates = items
      return items
    } catch {
      return []
    } finally {
      inflight = null
    }
  })()

  return inflight
}

/**
 * Hook · query e o filtro client-side aplicado sobre o cache.
 * Retorna `templates` ja filtrado e ordenado pelo backend (sort_order).
 */
export function useQuickTemplates(query: string) {
  const [templates, setTemplates] = useState<QuickTemplate[]>(cachedTemplates ?? [])
  const [isLoading, setIsLoading] = useState<boolean>(cachedTemplates === null)
  const fetchedRef = useRef(false)

  useEffect(() => {
    if (fetchedRef.current) return
    fetchedRef.current = true

    let cancelled = false
    const t = setTimeout(() => {
      fetchAllTemplates().then((items) => {
        if (cancelled) return
        setTemplates(items)
        setIsLoading(false)
      })
    }, FETCH_DEBOUNCE_MS)

    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return templates
    return templates.filter((t) => {
      const slug = (t.slug ?? '').toLowerCase()
      const name = (t.name ?? '').toLowerCase()
      return slug.includes(q) || name.includes(q)
    })
  }, [query, templates])

  return { templates: filtered, isLoading }
}

// Permite reuso/teste · evita warning unused
export const QUICK_TEMPLATES_CACHE_KEY = CACHE_KEY
