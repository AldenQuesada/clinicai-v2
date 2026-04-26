'use client'

/**
 * AlertsBanner · espelho 1:1 de `b2bm2-alerts.widget.js`.
 *
 * Banner sticky que aparece em todas as sub-tabs de Analytics. Agrupa
 * alertas por severity (critical → warning → celebrate → personal).
 * Click numa parceria navega pra /partnerships/[id].
 */

import { useRouter } from 'next/navigation'
import type { CriticalAlert, AlertSeverity } from '@clinicai/repositories'

const ICONS: Record<AlertSeverity, string> = {
  critical: '🔴',
  warning: '🟡',
  celebrate: '🌟',
  personal: '📅',
}

const ORDER: AlertSeverity[] = ['critical', 'warning', 'celebrate', 'personal']

export function AlertsBanner({ alerts }: { alerts: CriticalAlert[] }) {
  const router = useRouter()

  const grouped: Partial<Record<AlertSeverity, CriticalAlert[]>> = {}
  for (const a of alerts) {
    if (!grouped[a.severity]) grouped[a.severity] = []
    grouped[a.severity]!.push(a)
  }

  return (
    <section className="b2bm2-alerts-host">
      <div className="b2bm2-alerts">
        {ORDER.map((sev) =>
          (grouped[sev] || []).map((a, i) => (
            <button
              key={`${sev}-${i}`}
              type="button"
              className={`b2bm2-alert b2bm2-alert-${sev}`}
              onClick={() => {
                if (a.partnership_id) router.push(`/partnerships/${a.partnership_id}`)
              }}
              disabled={!a.partnership_id}
            >
              <span className="b2bm2-alert-icon">{ICONS[sev] || '•'}</span>
              <div className="b2bm2-alert-body">
                <div className="b2bm2-alert-top">
                  {a.partnership_name ? (
                    <>
                      <strong>{a.partnership_name}</strong>
                      {a.is_image_partner ? (
                        <span className="b2bm2-img-pill" title="Parceria de imagem">
                          💎
                        </span>
                      ) : null}
                    </>
                  ) : (
                    <strong>Você</strong>
                  )}
                  <span className="b2bm2-alert-msg">{a.message}</span>
                </div>
                {a.suggested_action ? (
                  <div className="b2bm2-alert-action">→ {a.suggested_action}</div>
                ) : null}
              </div>
            </button>
          )),
        )}
      </div>
    </section>
  )
}
