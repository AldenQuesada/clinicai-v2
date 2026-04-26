'use client'

/**
 * AssinaturaClient · 4-step wizard de assinatura digital.
 *
 * Steps espelham o legacy clinic-dashboard/legal-document.html:
 *   1. Identificacao · confirma nome + CPF
 *   2. Documento · scroll obrigatorio ate o final
 *   3. Assinatura · canvas (touch + mouse)
 *   4. Confirmacao · checkbox + submit
 *
 * Tema luxury dark · Cormorant Garamond + champagne. Mobile-first ·
 * canvas dinamicamente redimensionado pelo container.
 *
 * Lei 14.063/2020 + LGPD: ip/ua sao gravados server-side (server action),
 * geolocation e' opcional e so coletada apos consentimento explicito ·
 * checkbox final.
 */

import { useEffect, useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { signDocumentAction } from './actions'

interface Props {
  slug: string
  token: string
  initialName: string
  initialCpf: string
  content: string
  professionalName: string | null
  professionalReg: string | null
  documentHash: string
}

type Step = 1 | 2 | 3 | 4 | 5

export function AssinaturaClient({
  slug,
  token,
  initialName,
  initialCpf,
  content,
  professionalName,
  professionalReg,
  documentHash,
}: Props) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [step, setStep] = useState<Step>(1)
  const [signerName, setSignerName] = useState(initialName)
  const [signerCpf, setSignerCpf] = useState(initialCpf)
  const [scrolledToBottom, setScrolledToBottom] = useState(false)
  const [signatureData, setSignatureData] = useState<string>('')
  const [accepted, setAccepted] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)

  // ── Step 1 → 2 (validacao de identidade) ──────────────────────────
  function handleStep1Submit() {
    setFeedback(null)
    if (!signerName.trim()) {
      setFeedback('Informe seu nome completo.')
      return
    }
    const cpfDigits = signerCpf.replace(/\D/g, '')
    if (!cpfDigits) {
      setFeedback('Informe seu CPF.')
      return
    }
    if (!validateCpf(cpfDigits)) {
      setFeedback('CPF inválido. Verifique os dígitos.')
      return
    }
    setStep(2)
  }

  // ── Submit final (step 4 → 5 success) ─────────────────────────────
  function handleSubmit() {
    if (!accepted || pending) return
    setFeedback(null)

    // Geolocalizacao opcional · pede com timeout curto · nao bloqueia
    requestGeolocation((geo) => {
      startTransition(async () => {
        const r = await signDocumentAction({
          slug,
          token,
          signerName: signerName.trim(),
          signerCpf: signerCpf.trim() || null,
          signatureData,
          geolocation: geo,
        })
        if (!r.ok) {
          setFeedback(`Erro: ${r.error || 'falha ao assinar'}`)
          return
        }
        setStep(5)
        // Refetch · revalidate caches
        router.refresh()
      })
    })
  }

  return (
    <div style={{ marginTop: 8 }}>
      {/* Stepper */}
      {step >= 1 && step <= 4 ? (
        <Stepper currentStep={step} />
      ) : null}

      {feedback ? <Toast message={feedback} /> : null}

      {step === 1 ? (
        <StepIdentidade
          name={signerName}
          cpf={signerCpf}
          onNameChange={setSignerName}
          onCpfChange={setSignerCpf}
          onNext={handleStep1Submit}
        />
      ) : null}

      {step === 2 ? (
        <StepDocumento
          content={content}
          firstName={firstNameOf(signerName)}
          scrolledToBottom={scrolledToBottom}
          onScrollEnd={() => setScrolledToBottom(true)}
          onNext={() => setStep(3)}
          onBack={() => setStep(1)}
        />
      ) : null}

      {step === 3 ? (
        <StepAssinatura
          firstName={firstNameOf(signerName)}
          onNext={(dataUrl) => {
            setSignatureData(dataUrl)
            setStep(4)
          }}
          onBack={() => setStep(2)}
        />
      ) : null}

      {step === 4 ? (
        <StepConfirmacao
          name={signerName}
          cpf={signerCpf}
          professionalName={professionalName}
          professionalReg={professionalReg}
          signatureData={signatureData}
          accepted={accepted}
          onAcceptToggle={() => setAccepted((v) => !v)}
          documentHash={documentHash}
          submitting={pending}
          onSubmit={handleSubmit}
          onBack={() => setStep(3)}
        />
      ) : null}

      {step === 5 ? (
        <StepSucesso
          name={signerName}
          cpf={signerCpf}
          professionalName={professionalName}
          documentHash={documentHash}
        />
      ) : null}
    </div>
  )
}

// ─── Stepper ──────────────────────────────────────────────────────────
function Stepper({ currentStep }: { currentStep: Step }) {
  return (
    <div style={ui.stepper}>
      {[1, 2, 3, 4].map((i) => {
        const isActive = i === currentStep
        const isDone = i < currentStep
        return (
          <div key={i} style={ui.stepperItem}>
            <div
              style={{
                ...ui.stepperDot,
                ...(isActive ? ui.stepperDotActive : null),
                ...(isDone ? ui.stepperDotDone : null),
              }}
            >
              {isDone ? '✓' : i}
            </div>
            {i < 4 ? (
              <div
                style={{
                  ...ui.stepperLine,
                  ...(isDone ? ui.stepperLineDone : null),
                }}
              />
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

// ─── Step 1 · Identidade ─────────────────────────────────────────────
function StepIdentidade({
  name,
  cpf,
  onNameChange,
  onCpfChange,
  onNext,
}: {
  name: string
  cpf: string
  onNameChange: (v: string) => void
  onCpfChange: (v: string) => void
  onNext: () => void
}) {
  return (
    <div>
      <SectionTitle eyebrow="Etapa 1 de 4" title="Identificação" />
      <p style={ui.bodyText}>
        Confirme seus dados pessoais para prosseguir com a assinatura.
      </p>
      <Field label="Nome completo">
        <input
          type="text"
          value={name}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder="Seu nome completo"
          autoComplete="name"
          style={ui.input}
        />
      </Field>
      <Field label="CPF">
        <input
          type="text"
          value={cpf}
          onChange={(e) => onCpfChange(formatCpf(e.target.value))}
          placeholder="000.000.000-00"
          inputMode="numeric"
          maxLength={14}
          autoComplete="off"
          style={{ ...ui.input, fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace' }}
        />
      </Field>
      <div style={{ marginTop: 28 }}>
        <button type="button" onClick={onNext} style={ui.btnPrimary}>
          Continuar
        </button>
      </div>
    </div>
  )
}

// ─── Step 2 · Documento ──────────────────────────────────────────────
function StepDocumento({
  content,
  firstName,
  scrolledToBottom,
  onScrollEnd,
  onNext,
  onBack,
}: {
  content: string
  firstName: string
  scrolledToBottom: boolean
  onScrollEnd: () => void
  onNext: () => void
  onBack: () => void
}) {
  const docRef = useRef<HTMLDivElement>(null)

  // Scroll detection · marca ao chegar perto do fim
  useEffect(() => {
    const el = docRef.current
    if (!el) return
    // Auto-completa se conteudo couber sem scroll
    if (el.scrollHeight <= el.clientHeight + 10) {
      onScrollEnd()
      return
    }
    function onScroll() {
      if (!el) return
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 24) {
        onScrollEnd()
      }
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [onScrollEnd])

  return (
    <div>
      <SectionTitle eyebrow="Etapa 2 de 4" title="Leia o Documento" />
      <p style={ui.bodyText}>
        {firstName ? `${firstName}, role` : 'Role'} até o final do documento para
        poder continuar.
      </p>

      <div ref={docRef} style={ui.docText}>
        <SafeHtml html={content} />
      </div>
      {!scrolledToBottom ? (
        <div style={ui.scrollHint}>↓ Role até o final para continuar</div>
      ) : null}

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={onNext}
          disabled={!scrolledToBottom}
          style={scrolledToBottom ? ui.btnPrimary : ui.btnPrimaryDisabled}
        >
          {scrolledToBottom ? 'Li e desejo continuar' : 'Role até o final'}
        </button>
        <button type="button" onClick={onBack} style={ui.btnSecondary}>
          Voltar
        </button>
      </div>
    </div>
  )
}

// ─── Step 3 · Assinatura ─────────────────────────────────────────────
function StepAssinatura({
  firstName,
  onNext,
  onBack,
}: {
  firstName: string
  onNext: (dataUrl: string) => void
  onBack: () => void
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [hasDrawn, setHasDrawn] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Setup canvas events
  useEffect(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    // Resize canvas pra largura real do container
    const w = container.clientWidth
    const h = Math.max(Math.round(w * 0.4), 180)
    canvas.width = w
    canvas.height = h

    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.strokeStyle = '#1a1a2e'
    ctx.lineWidth = 2.5
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    // Fundo branco · senao toDataURL fica transparente em tema dark
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    let drawing = false
    let lastX = 0
    let lastY = 0

    function getPos(e: MouseEvent | TouchEvent): { x: number; y: number } {
      if (!canvas) return { x: 0, y: 0 }
      const rect = canvas.getBoundingClientRect()
      let clientX: number, clientY: number
      if ('touches' in e && e.touches.length > 0) {
        clientX = e.touches[0].clientX
        clientY = e.touches[0].clientY
      } else if ('clientX' in e) {
        clientX = e.clientX
        clientY = e.clientY
      } else {
        return { x: 0, y: 0 }
      }
      return { x: clientX - rect.left, y: clientY - rect.top }
    }

    function onStart(e: MouseEvent | TouchEvent) {
      e.preventDefault()
      drawing = true
      const p = getPos(e)
      lastX = p.x
      lastY = p.y
    }
    function onMove(e: MouseEvent | TouchEvent) {
      if (!drawing || !ctx) return
      e.preventDefault()
      const p = getPos(e)
      ctx.beginPath()
      ctx.moveTo(lastX, lastY)
      ctx.lineTo(p.x, p.y)
      ctx.stroke()
      lastX = p.x
      lastY = p.y
      setHasDrawn(true)
    }
    function onEnd() {
      drawing = false
    }

    canvas.addEventListener('mousedown', onStart)
    canvas.addEventListener('mousemove', onMove)
    canvas.addEventListener('mouseup', onEnd)
    canvas.addEventListener('mouseleave', onEnd)
    canvas.addEventListener('touchstart', onStart, { passive: false })
    canvas.addEventListener('touchmove', onMove, { passive: false })
    canvas.addEventListener('touchend', onEnd)

    return () => {
      canvas.removeEventListener('mousedown', onStart)
      canvas.removeEventListener('mousemove', onMove)
      canvas.removeEventListener('mouseup', onEnd)
      canvas.removeEventListener('mouseleave', onEnd)
      canvas.removeEventListener('touchstart', onStart)
      canvas.removeEventListener('touchmove', onMove)
      canvas.removeEventListener('touchend', onEnd)
    }
  }, [])

  function clearCanvas() {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    setHasDrawn(false)
  }

  function continueToNext() {
    const canvas = canvasRef.current
    if (!canvas || !hasDrawn) {
      setError('Desenhe sua assinatura no campo.')
      return
    }
    const dataUrl = canvas.toDataURL('image/png')
    if (!dataUrl || dataUrl === 'data:,') {
      setError('Falha ao capturar assinatura. Tente novamente.')
      return
    }
    setError(null)
    onNext(dataUrl)
  }

  return (
    <div>
      <SectionTitle eyebrow="Etapa 3 de 4" title="Sua Assinatura" />
      <p style={ui.bodyText}>
        {firstName ? `${firstName}, desenhe` : 'Desenhe'} sua assinatura no campo abaixo
        usando o dedo (toque) ou o mouse.
      </p>

      <div ref={containerRef} style={ui.sigContainer}>
        <canvas ref={canvasRef} style={ui.sigCanvas} />
        {!hasDrawn ? (
          <div style={ui.sigPlaceholder}>Toque ou clique para assinar</div>
        ) : null}
      </div>

      <div style={ui.sigActions}>
        <button type="button" onClick={clearCanvas} style={ui.btnClear}>
          Limpar assinatura
        </button>
      </div>

      {error ? <Toast message={error} /> : null}

      <div style={{ marginTop: 24 }}>
        <button type="button" onClick={continueToNext} style={ui.btnPrimary}>
          Continuar
        </button>
        <button type="button" onClick={onBack} style={ui.btnSecondary}>
          Voltar
        </button>
      </div>
    </div>
  )
}

// ─── Step 4 · Confirmacao ────────────────────────────────────────────
function StepConfirmacao({
  name,
  cpf,
  professionalName,
  professionalReg,
  signatureData,
  accepted,
  onAcceptToggle,
  documentHash,
  submitting,
  onSubmit,
  onBack,
}: {
  name: string
  cpf: string
  professionalName: string | null
  professionalReg: string | null
  signatureData: string
  accepted: boolean
  onAcceptToggle: () => void
  documentHash: string
  submitting: boolean
  onSubmit: () => void
  onBack: () => void
}) {
  const today = new Date().toLocaleDateString('pt-BR')
  return (
    <div>
      <SectionTitle eyebrow="Etapa 4 de 4" title="Confirmação Final" />
      <p style={ui.bodyText}>Revise todos os dados e confirme sua assinatura.</p>

      <div style={ui.summaryBox}>
        <SummaryRow label="Paciente" value={name} />
        <SummaryRow label="CPF" value={cpf} />
        <SummaryRow label="Profissional" value={professionalName || '—'} />
        {professionalReg ? <SummaryRow label="Registro" value={professionalReg} /> : null}
        <SummaryRow label="Data" value={today} />
      </div>

      <div style={ui.sigPreview}>
        <div style={ui.sigPreviewLabel}>Sua assinatura</div>
        {signatureData ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={signatureData} alt="Assinatura" style={ui.sigPreviewImg} />
        ) : null}
      </div>

      <label style={ui.checkBox} onClick={onAcceptToggle}>
        <input
          type="checkbox"
          checked={accepted}
          onChange={onAcceptToggle}
          style={{ marginTop: 2, accentColor: '#C9A96E', width: 18, height: 18 }}
        />
        <span style={ui.checkText}>
          Li, compreendi e concordo com todos os termos deste documento. Declaro que
          as informações prestadas são verdadeiras.
        </span>
      </label>

      {documentHash ? (
        <div style={ui.hashLine}>
          Hash de integridade · <code>{documentHash.substring(0, 16)}…</code>
        </div>
      ) : null}

      <div style={{ marginTop: 24 }}>
        <button
          type="button"
          onClick={onSubmit}
          disabled={!accepted || submitting}
          style={accepted && !submitting ? ui.btnPrimary : ui.btnPrimaryDisabled}
        >
          {submitting ? 'Registrando assinatura…' : 'Assinar Documento'}
        </button>
        <button
          type="button"
          onClick={onBack}
          disabled={submitting}
          style={ui.btnSecondary}
        >
          Voltar
        </button>
      </div>
    </div>
  )
}

// ─── Step 5 · Sucesso ────────────────────────────────────────────────
function StepSucesso({
  name,
  cpf,
  professionalName,
  documentHash,
}: {
  name: string
  cpf: string
  professionalName: string | null
  documentHash: string
}) {
  const sigDate = new Date().toLocaleString('pt-BR')
  const firstName = firstNameOf(name)
  return (
    <div style={{ textAlign: 'center', padding: '20px 0' }}>
      <div style={ui.successCheck}>
        <svg width="36" height="36" viewBox="0 0 24 24" fill="none" stroke="#0E0E18" strokeWidth="2.5" strokeLinecap="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      </div>
      <h2 style={ui.successTitle}>Documento Assinado</h2>
      <p style={ui.successText}>
        Obrigado, <strong>{firstName}</strong>! Sua assinatura foi registrada com
        validade jurídica conforme a Lei 14.063/2020.
      </p>

      <div style={ui.successCard}>
        <div style={ui.successCardTitle}>Comprovante de Assinatura</div>
        <SummaryRow label="Signatário" value={name} dark />
        <SummaryRow label="CPF" value={cpf} dark />
        <SummaryRow label="Profissional" value={professionalName || '—'} dark />
        <SummaryRow label="Data/Hora" value={sigDate} dark />
      </div>

      <div style={ui.seal}>ASSINADO DIGITALMENTE</div>

      {documentHash ? (
        <div style={ui.hashFull}>
          <div style={ui.hashLabel}>Código de Autenticidade (SHA-256)</div>
          <div style={ui.hashCode}>{documentHash}</div>
        </div>
      ) : null}

      <p style={ui.muted}>
        Você já pode fechar esta página. Em caso de dúvida, contate a clínica.
      </p>
    </div>
  )
}

// ─── Helpers ─────────────────────────────────────────────────────────
function SectionTitle({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={ui.sectionEyebrow}>{eyebrow}</div>
      <h2 style={ui.sectionTitle}>{title}</h2>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <label style={ui.label}>{label}</label>
      {children}
    </div>
  )
}

function SummaryRow({
  label,
  value,
  dark = false,
}: {
  label: string
  value: string
  dark?: boolean
}) {
  return (
    <div style={dark ? ui.summaryRowDark : ui.summaryRow}>
      <span style={dark ? ui.summaryLabelDark : ui.summaryLabel}>{label}</span>
      <span style={dark ? ui.summaryValueDark : ui.summaryValue}>{value}</span>
    </div>
  )
}

function Toast({ message }: { message: string }) {
  return <div style={ui.toast}>{message}</div>
}

function SafeHtml({ html }: { html: string }) {
  // O conteudo vem do snapshot ja salvo no banco · admin gerou e nao e' input
  // direto de paciente. Mesmo assim usamos um sanitizer minimo: remove <script>
  // e atributos event handlers (on*).
  const cleaned = sanitizeHtml(html)
  return <div dangerouslySetInnerHTML={{ __html: cleaned }} />
}

function sanitizeHtml(html: string): string {
  if (!html) return ''
  // Remove <script>...</script>
  let s = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
  // Remove on* event handlers
  s = s.replace(/\son\w+\s*=\s*"[^"]*"/gi, '')
  s = s.replace(/\son\w+\s*=\s*'[^']*'/gi, '')
  // Remove javascript: hrefs
  s = s.replace(/\shref\s*=\s*"javascript:[^"]*"/gi, '')
  s = s.replace(/\shref\s*=\s*'javascript:[^']*'/gi, '')
  return s
}

function firstNameOf(full: string): string {
  return (full || '').trim().split(/\s+/)[0] || ''
}

function formatCpf(v: string): string {
  const d = (v || '').replace(/\D/g, '').substring(0, 11)
  if (d.length > 9) return d.replace(/(\d{3})(\d{3})(\d{3})(\d{1,2})/, '$1.$2.$3-$4')
  if (d.length > 6) return d.replace(/(\d{3})(\d{3})(\d{1,3})/, '$1.$2.$3')
  if (d.length > 3) return d.replace(/(\d{3})(\d{1,3})/, '$1.$2')
  return d
}

function validateCpf(cpfDigits: string): boolean {
  const d = cpfDigits.replace(/\D/g, '')
  if (d.length !== 11) return false
  if (/^(\d)\1{10}$/.test(d)) return false
  for (let t = 9; t < 11; t++) {
    let sum = 0
    for (let i = 0; i < t; i++) sum += parseInt(d[i], 10) * (t + 1 - i)
    const r = ((sum * 10) % 11) % 10
    if (parseInt(d[t], 10) !== r) return false
  }
  return true
}

function requestGeolocation(
  cb: (geo: { lat: number; lng: number; acc?: number } | null) => void,
) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    cb(null)
    return
  }
  let resolved = false
  const timer = window.setTimeout(() => {
    if (!resolved) {
      resolved = true
      cb(null)
    }
  }, 3000)
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      if (resolved) return
      resolved = true
      window.clearTimeout(timer)
      cb({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy })
    },
    () => {
      if (resolved) return
      resolved = true
      window.clearTimeout(timer)
      cb(null)
    },
    { timeout: 3000, maximumAge: 60_000 },
  )
}

// ─── Inline styles · luxury dark · espelho VouchersClient ─────────────
const FONT_SERIF = `'Cormorant Garamond', Georgia, serif`
const FONT_SANS = `'Montserrat', sans-serif`
const COLOR_GOLD = '#C9A96E'
const COLOR_GOLD_LIGHT = '#D4B978'
const COLOR_IVORY = '#E8E4D9'
const COLOR_TEXT_MUTED = '#9C9788'
const COLOR_BORDER = 'rgba(201, 169, 110, 0.22)'
const COLOR_INPUT_BG = '#0F0F1F'

const ui: Record<string, React.CSSProperties> = {
  stepper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    margin: '0 0 24px',
    padding: '12px 0',
    borderBottom: `1px solid ${COLOR_BORDER}`,
  },
  stepperItem: {
    display: 'flex',
    alignItems: 'center',
  },
  stepperDot: {
    width: 30,
    height: 30,
    borderRadius: '50%',
    border: `2px solid ${COLOR_BORDER}`,
    color: COLOR_TEXT_MUTED,
    fontFamily: FONT_SANS,
    fontSize: 12,
    fontWeight: 600,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'transparent',
  },
  stepperDotActive: {
    borderColor: COLOR_GOLD,
    background: `linear-gradient(135deg, ${COLOR_GOLD}, ${COLOR_GOLD_LIGHT})`,
    color: '#0E0E18',
    boxShadow: '0 0 0 4px rgba(201,169,110,0.18)',
  },
  stepperDotDone: {
    borderColor: '#10B981',
    background: '#10B981',
    color: '#fff',
  },
  stepperLine: {
    width: 28,
    height: 2,
    background: COLOR_BORDER,
    margin: '0 4px',
  },
  stepperLineDone: {
    background: '#10B981',
  },
  sectionEyebrow: {
    fontFamily: FONT_SANS,
    fontSize: 10,
    letterSpacing: 2,
    textTransform: 'uppercase',
    color: COLOR_GOLD,
    fontWeight: 500,
    marginBottom: 4,
  },
  sectionTitle: {
    fontFamily: FONT_SERIF,
    fontSize: 24,
    fontWeight: 300,
    margin: 0,
    color: COLOR_IVORY,
    lineHeight: 1.1,
  },
  bodyText: {
    fontFamily: FONT_SANS,
    fontSize: 13,
    color: COLOR_TEXT_MUTED,
    lineHeight: 1.6,
    margin: '0 0 18px',
  },
  label: {
    fontFamily: FONT_SANS,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    color: COLOR_GOLD,
    fontWeight: 500,
    marginBottom: 6,
    display: 'block',
  },
  input: {
    width: '100%',
    padding: '12px 14px',
    background: COLOR_INPUT_BG,
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: 10,
    color: COLOR_IVORY,
    fontSize: 15,
    fontFamily: FONT_SERIF,
    outline: 'none',
    boxSizing: 'border-box',
  },
  docText: {
    maxHeight: '55vh',
    overflowY: 'auto',
    padding: '20px 22px',
    background: COLOR_INPUT_BG,
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: 12,
    fontSize: 14,
    lineHeight: 1.75,
    color: COLOR_IVORY,
    fontFamily: FONT_SERIF,
    wordWrap: 'break-word',
  },
  scrollHint: {
    textAlign: 'center',
    padding: '10px',
    fontFamily: FONT_SANS,
    fontSize: 11,
    color: COLOR_GOLD,
    fontWeight: 500,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  sigContainer: {
    border: `2px dashed ${COLOR_BORDER}`,
    borderRadius: 14,
    background: '#FFFFFF',
    position: 'relative',
    overflow: 'hidden',
    touchAction: 'none',
  },
  sigCanvas: {
    width: '100%',
    display: 'block',
    cursor: 'crosshair',
  },
  sigPlaceholder: {
    position: 'absolute',
    inset: 0,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#9CA3AF',
    fontFamily: FONT_SANS,
    fontSize: 12,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    pointerEvents: 'none',
  },
  sigActions: {
    display: 'flex',
    justifyContent: 'flex-end',
    marginTop: 8,
  },
  btnPrimary: {
    width: '100%',
    padding: '14px',
    border: 'none',
    borderRadius: 12,
    background: `linear-gradient(135deg, ${COLOR_GOLD}, ${COLOR_GOLD_LIGHT})`,
    color: '#0E0E18',
    fontFamily: FONT_SANS,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase',
    cursor: 'pointer',
    boxShadow: '0 4px 14px rgba(201,169,110,0.35)',
  },
  btnPrimaryDisabled: {
    width: '100%',
    padding: '14px',
    border: 'none',
    borderRadius: 12,
    background: '#3A3A4A',
    color: '#6B6B7B',
    fontFamily: FONT_SANS,
    fontSize: 12,
    fontWeight: 600,
    letterSpacing: 2,
    textTransform: 'uppercase',
    cursor: 'not-allowed',
  },
  btnSecondary: {
    width: '100%',
    padding: '12px',
    marginTop: 10,
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: 12,
    background: 'transparent',
    color: COLOR_TEXT_MUTED,
    fontFamily: FONT_SANS,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    cursor: 'pointer',
  },
  btnClear: {
    padding: '8px 16px',
    border: `1px solid rgba(217,122,122,0.4)`,
    background: 'transparent',
    color: '#D97A7A',
    fontFamily: FONT_SANS,
    fontSize: 11,
    fontWeight: 500,
    letterSpacing: 1.4,
    textTransform: 'uppercase',
    borderRadius: 10,
    cursor: 'pointer',
  },
  toast: {
    margin: '12px 0',
    padding: '10px 14px',
    background: 'rgba(217,122,122,0.12)',
    border: `1px solid rgba(217,122,122,0.4)`,
    borderRadius: 10,
    color: '#F4B6B6',
    fontFamily: FONT_SANS,
    fontSize: 13,
    textAlign: 'center',
  },
  summaryBox: {
    background: COLOR_INPUT_BG,
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: 12,
    padding: '14px 18px',
    marginBottom: 14,
  },
  summaryRow: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: `1px solid ${COLOR_BORDER}`,
    fontFamily: FONT_SANS,
    fontSize: 12,
  },
  summaryLabel: {
    color: COLOR_TEXT_MUTED,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  summaryValue: {
    color: COLOR_IVORY,
    fontWeight: 500,
  },
  summaryRowDark: {
    display: 'flex',
    justifyContent: 'space-between',
    padding: '6px 0',
    borderBottom: '1px solid rgba(255,255,255,0.10)',
    fontFamily: FONT_SANS,
    fontSize: 12,
  },
  summaryLabelDark: {
    color: '#9CA3AF',
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  summaryValueDark: {
    color: '#FFFFFF',
    fontWeight: 500,
  },
  sigPreview: {
    background: '#FFFFFF',
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: 12,
    padding: 14,
    textAlign: 'center',
    marginBottom: 14,
  },
  sigPreviewLabel: {
    fontFamily: FONT_SANS,
    fontSize: 9,
    letterSpacing: 1.6,
    textTransform: 'uppercase',
    color: '#9CA3AF',
    fontWeight: 600,
    marginBottom: 6,
  },
  sigPreviewImg: {
    maxWidth: 220,
    maxHeight: 90,
    height: 'auto',
  },
  checkBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 12,
    margin: '14px 0',
    padding: 14,
    background: 'rgba(201,169,110,0.06)',
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: 12,
    cursor: 'pointer',
  },
  checkText: {
    fontFamily: FONT_SANS,
    fontSize: 12,
    color: COLOR_IVORY,
    lineHeight: 1.55,
  },
  hashLine: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 10,
    color: COLOR_TEXT_MUTED,
    textAlign: 'center',
    margin: '12px 0',
  },
  successCheck: {
    width: 70,
    height: 70,
    borderRadius: '50%',
    background: `linear-gradient(135deg, ${COLOR_GOLD}, ${COLOR_GOLD_LIGHT})`,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    margin: '0 auto 16px',
    boxShadow: '0 8px 24px rgba(201,169,110,0.4)',
  },
  successTitle: {
    fontFamily: FONT_SERIF,
    fontSize: 30,
    fontWeight: 300,
    color: COLOR_IVORY,
    margin: '0 0 8px',
    letterSpacing: 0.5,
  },
  successText: {
    fontFamily: FONT_SANS,
    fontSize: 13,
    color: COLOR_TEXT_MUTED,
    lineHeight: 1.6,
    margin: '0 0 24px',
  },
  successCard: {
    background: '#0E0E18',
    border: `1px solid ${COLOR_BORDER}`,
    borderRadius: 14,
    padding: 20,
    margin: '0 0 18px',
    color: '#fff',
    textAlign: 'left',
  },
  successCardTitle: {
    fontFamily: FONT_SANS,
    fontSize: 9.5,
    letterSpacing: 1.8,
    textTransform: 'uppercase',
    color: COLOR_GOLD,
    fontWeight: 600,
    marginBottom: 10,
  },
  seal: {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '8px 18px',
    background: 'rgba(16,185,129,0.10)',
    border: '1.5px solid #10B981',
    borderRadius: 10,
    color: '#10B981',
    fontFamily: FONT_SANS,
    fontWeight: 600,
    fontSize: 11,
    letterSpacing: 2,
    margin: '0 0 14px',
  },
  hashFull: {
    background: 'rgba(255,255,255,0.04)',
    border: `1px solid ${COLOR_BORDER}`,
    padding: '12px 14px',
    borderRadius: 10,
    margin: '0 0 18px',
    textAlign: 'left',
  },
  hashLabel: {
    fontFamily: FONT_SANS,
    fontSize: 9,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: COLOR_TEXT_MUTED,
    fontWeight: 600,
    marginBottom: 4,
  },
  hashCode: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace',
    fontSize: 10.5,
    color: COLOR_IVORY,
    wordBreak: 'break-all',
    lineHeight: 1.6,
  },
  muted: {
    fontFamily: FONT_SANS,
    fontSize: 12,
    color: COLOR_TEXT_MUTED,
    lineHeight: 1.6,
  },
}
