'use client'

/**
 * MapClient · espelho 1:1 do `b2b-map.ui.js`. Mapa Leaflet vivo de
 * Maringá com pins por parceria.
 *
 * - Tamanho do ponto = tier (T1 14, T2 11, T3 9, default 8)
 * - Cor = health_color (verde/amarelo/vermelho/cinza)
 * - Click no popup → /partnerships/[id]
 *
 * Leaflet é carregado via CDN (CSS link + JS script) on-demand · zero
 * peso no bundle. Cleanup automático ao desmontar.
 */

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { GeoPoint } from '@clinicai/repositories'

const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css'
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
const CENTER: [number, number] = [-23.4205, -51.9333] // Maringá centro
const ZOOM = 13

const HEALTH_COLOR: Record<string, string> = {
  green: '#10B981',
  yellow: '#F59E0B',
  red: '#EF4444',
  unknown: '#94A3B8',
}

function tierRadius(t: number | null): number {
  if (t === 1) return 14
  if (t === 2) return 11
  if (t === 3) return 9
  return 8
}

function escHtml(s: string | null | undefined): string {
  return String(s == null ? '' : s).replace(/[&<>"']/g, (c) =>
    ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] || c,
  )
}

interface LeafletGlobal {
  latLngBounds: (latlngs: Array<[number, number]>) => unknown
  layerGroup: () => { addTo: (m: unknown) => unknown }
  circleMarker: (latlng: [number, number], opts: Record<string, unknown>) => {
    bindPopup: (html: string) => unknown
  }
  map: (el: HTMLElement, opts: Record<string, unknown>) => unknown
  tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (m: unknown) => unknown }
}

declare global {
  interface Window {
    L?: LeafletGlobal
  }
}

function ensureLeaflet(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('SSR'))
  if (window.L) return Promise.resolve()
  return new Promise((resolve, reject) => {
    if (!document.querySelector('link[data-leaflet]')) {
      const link = document.createElement('link')
      link.rel = 'stylesheet'
      link.href = LEAFLET_CSS
      link.setAttribute('data-leaflet', '1')
      document.head.appendChild(link)
    }
    const script = document.createElement('script')
    script.src = LEAFLET_JS
    script.async = true
    script.onload = () => resolve()
    script.onerror = () => reject(new Error('Falha ao carregar Leaflet'))
    document.head.appendChild(script)
  })
}

export function MapClient({ points }: { points: GeoPoint[] }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mapRef = useRef<any>(null)
  const router = useRouter()

  useEffect(() => {
    let cancelled = false

    async function init() {
      try {
        await ensureLeaflet()
      } catch {
        return
      }
      if (cancelled || !containerRef.current || !window.L) return

      const valid = points.filter((p) => p.lat != null && p.lng != null)
      if (!valid.length) return

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const L = window.L as any
      const map = L.map(containerRef.current, {
        center: CENTER,
        zoom: ZOOM,
        scrollWheelZoom: true,
      })
      mapRef.current = map

      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map)

      const layer = L.layerGroup().addTo(map)

      valid.forEach((p) => {
        const color = HEALTH_COLOR[p.health_color || 'unknown'] || HEALTH_COLOR.unknown
        const marker = L.circleMarker([Number(p.lat), Number(p.lng)], {
          radius: tierRadius(p.tier),
          color,
          fillColor: color,
          fillOpacity: 0.75,
          weight: 2,
        })
        const popup = `
          <div style="min-width:180px;font-family:Montserrat,sans-serif">
            <strong style="font-size:14px">${escHtml(p.name)}</strong><br>
            <span style="font-size:11px;color:#666">${escHtml(p.pillar || '')}${p.tier ? ' · T' + p.tier : ''}</span><br>
            <button class="b2b-map-popup-btn" data-map-open="${escHtml(p.id)}"
              style="margin-top:8px;padding:4px 10px;font-size:11px;cursor:pointer;background:#1A1A2E;color:#fff;border:none;border-radius:3px">
              Abrir detalhe
            </button>
          </div>
        `
        marker.bindPopup(popup)
        layer.addLayer(marker)
      })

      // Fit bounds
      const bounds = L.latLngBounds(
        valid.map((p) => [Number(p.lat), Number(p.lng)] as [number, number]),
      )
      map.fitBounds(bounds, { padding: [40, 40], maxZoom: 15 })

      // Click delegation no botão do popup
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      map.on('popupopen', (e: any) => {
        const el = e.popup.getElement()
        if (!el) return
        const btn = el.querySelector('[data-map-open]') as HTMLButtonElement | null
        if (btn) {
          btn.addEventListener('click', () => {
            const id = btn.getAttribute('data-map-open')
            if (id) router.push(`/partnerships/${id}`)
          })
        }
      })
    }

    init()

    return () => {
      cancelled = true
      if (mapRef.current) {
        try {
          mapRef.current.remove()
        } catch {
          // ignore
        }
        mapRef.current = null
      }
    }
  }, [points, router])

  return <div ref={containerRef} className="b2b-map-leaflet" />
}
