/**
 * useClinicMembers · lista usuarios ativos da clinic.
 *
 * P-12 multi-atendente · usado pelo dropdown de assignment + (futuro) presence
 * avatares na sidebar. Cache 5min · re-fetch em window focus.
 *
 * Cache em modulo (escopo do app) · evita N hooks fazendo N fetches em
 * paralelo quando varias conversas abrem o painel direito.
 */

import { useEffect, useState } from 'react'

export interface ClinicMember {
  id: string
  firstName: string | null
  lastName: string | null
  fullName: string
  role: string | null
  avatarUrl: string | null
  isActive: boolean
}

const CACHE_TTL_MS = 5 * 60 * 1000

interface CachedPayload {
  items: ClinicMember[]
  me: string | null
  clinicId: string | null
}

let cache: { payload: CachedPayload; fetchedAt: number } | null = null
let inflight: Promise<CachedPayload> | null = null

async function fetchMembers(): Promise<CachedPayload> {
  const res = await fetch('/api/clinic/members')
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  const json = await res.json()
  return {
    items: (json.items ?? []) as ClinicMember[],
    me: (json.me ?? null) as string | null,
    clinicId: (json.clinic_id ?? null) as string | null,
  }
}

async function getMembers(force = false): Promise<CachedPayload> {
  const now = Date.now()
  if (!force && cache && now - cache.fetchedAt < CACHE_TTL_MS) {
    return cache.payload
  }
  if (inflight) return inflight
  inflight = fetchMembers()
    .then((payload) => {
      cache = { payload, fetchedAt: Date.now() }
      return payload
    })
    .finally(() => {
      inflight = null
    })
  return inflight
}

export function useClinicMembers() {
  const [members, setMembers] = useState<ClinicMember[]>(cache?.payload.items ?? [])
  const [me, setMe] = useState<string | null>(cache?.payload.me ?? null)
  const [clinicId, setClinicId] = useState<string | null>(cache?.payload.clinicId ?? null)
  const [isLoading, setIsLoading] = useState(!cache)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    const load = async (force = false) => {
      try {
        if (!cache) setIsLoading(true)
        const payload = await getMembers(force)
        if (!cancelled) {
          setMembers(payload.items)
          setMe(payload.me)
          setClinicId(payload.clinicId)
          setError(null)
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'unknown')
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()

    const onFocus = () => {
      const stale = !cache || Date.now() - cache.fetchedAt > CACHE_TTL_MS
      if (stale) load(true)
    }
    window.addEventListener('focus', onFocus)
    return () => {
      cancelled = true
      window.removeEventListener('focus', onFocus)
    }
  }, [])

  return {
    members,
    me,
    clinicId,
    isLoading,
    error,
    refresh: async () => {
      const p = await getMembers(true)
      setMembers(p.items)
      setMe(p.me)
      setClinicId(p.clinicId)
    },
    findById: (id: string | null | undefined): ClinicMember | null => {
      if (!id) return null
      return members.find((m) => m.id === id) ?? null
    },
  }
}
