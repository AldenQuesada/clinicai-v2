/**
 * /api/diag/prompts · runtime diagnostic
 *
 * Roda os mesmos passos que /prompts/page.tsx faz (loadServerReposContext,
 * getSettings, fs.readFileSync) e retorna JSON detalhado de cada step ·
 * incluindo erros completos com message + stack.
 *
 * Use pra debugar 'digest opaco' do RSC sem precisar de Easypanel logs.
 *
 * GET /api/diag/prompts
 */

import { NextResponse } from 'next/server'
import * as fs from 'fs'
import * as path from 'path'
import { loadServerReposContext } from '@/lib/repos'

export const dynamic = 'force-dynamic'

interface StepResult {
  step: string
  ok: boolean
  durationMs: number
  data?: unknown
  error?: { name: string; message: string; stack?: string }
}

function runStep<T>(step: string, fn: () => T): StepResult {
  const t0 = Date.now()
  try {
    const data = fn()
    return { step, ok: true, durationMs: Date.now() - t0, data }
  } catch (e) {
    const err = e as Error
    return {
      step,
      ok: false,
      durationMs: Date.now() - t0,
      error: { name: err.name, message: err.message, stack: err.stack?.slice(0, 3000) },
    }
  }
}

async function runStepAsync<T>(step: string, fn: () => Promise<T>): Promise<StepResult> {
  const t0 = Date.now()
  try {
    const data = await fn()
    return { step, ok: true, durationMs: Date.now() - t0, data }
  } catch (e) {
    const err = e as Error
    return {
      step,
      ok: false,
      durationMs: Date.now() - t0,
      error: { name: err.name, message: err.message, stack: err.stack?.slice(0, 3000) },
    }
  }
}

export async function GET() {
  const steps: StepResult[] = []

  // 1. loadServerReposContext
  const ctxStep = await runStepAsync('loadServerReposContext', async () => {
    const { ctx, repos } = await loadServerReposContext()
    return {
      clinic_id: ctx.clinic_id,
      role: ctx.role,
      user_id: ctx.user_id,
      hasRepos: !!repos,
    }
  })
  steps.push(ctxStep)

  if (!ctxStep.ok) {
    return NextResponse.json({ steps, summary: 'failed at loadServerReposContext' })
  }

  // 2. clinic_id capture
  let clinic_id: string
  try {
    const { ctx } = await loadServerReposContext()
    clinic_id = ctx.clinic_id
  } catch {
    return NextResponse.json({ steps, summary: 'context lost between steps' })
  }

  // 3. getSettings
  const keys = [
    'lara_prompt_base',
    'lara_fixed_msg_0',
    'lara_fixed_msg_1',
    'lara_prompt_compact',
    'lara_prompt_olheiras',
    'lara_prompt_fullface',
  ]
  const getStep = await runStepAsync('clinicData.getSettings', async () => {
    const { repos } = await loadServerReposContext()
    const map = await repos.clinicData.getSettings(clinic_id, keys)
    return Array.from(map.entries()).map(([k, v]) => ({
      key: k,
      type: typeof v,
      length: typeof v === 'string' ? v.length : null,
      preview:
        typeof v === 'string'
          ? v.slice(0, 80)
          : v && typeof v === 'object'
            ? JSON.stringify(v).slice(0, 80)
            : null,
    }))
  })
  steps.push(getStep)

  // 4. cwd
  steps.push(runStep('process.cwd()', () => process.cwd()))

  // 5. fs.readFileSync test (lara-prompt.md)
  const filePaths = [
    ['src', 'prompt', 'lara-prompt.md'],
    ['src', 'prompt', 'fixed', 'msg-0.md'],
    ['src', 'prompt', 'flows', 'olheiras-flow.md'],
  ]
  for (const fp of filePaths) {
    const full = path.resolve(process.cwd(), ...fp)
    steps.push(
      runStep(`fs.readFile · ${fp.join('/')}`, () => {
        const exists = fs.existsSync(full)
        if (!exists) return { path: full, exists: false }
        const content = fs.readFileSync(full, 'utf-8')
        return { path: full, exists: true, length: content.length }
      }),
    )
  }

  // 6. clinic-context test (the SP halucination fix · also runs in webhook)
  const clinicCtxStep = await runStepAsync('buildClinicInfoBlock', async () => {
    const { buildClinicInfoBlock } = await import('@/lib/clinic-context')
    const block = await buildClinicInfoBlock(clinic_id)
    return { length: block.length, preview: block.slice(0, 200) }
  })
  steps.push(clinicCtxStep)

  // 7. lara-config test
  const configStep = await runStepAsync('getLaraConfig', async () => {
    const { getLaraConfig } = await import('@/lib/lara-config')
    return await getLaraConfig(clinic_id)
  })
  steps.push(configStep)

  const failedAt = steps.find((s) => !s.ok)?.step

  return NextResponse.json(
    {
      summary: failedAt ? `FAILED at: ${failedAt}` : 'all OK',
      steps,
      meta: {
        clinic_id,
        node: process.version,
        cwd: process.cwd(),
        env_node: process.env.NODE_ENV,
      },
    },
    { status: 200 },
  )
}
