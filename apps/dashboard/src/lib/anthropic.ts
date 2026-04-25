/**
 * Anthropic SDK singleton.
 * Default model: Sonnet 4.6 · ANTHROPIC_MODEL env override.
 */

import Anthropic from '@anthropic-ai/sdk'

let _client: Anthropic | null = null

export function getAnthropicClient(): Anthropic {
  if (!_client) {
    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) throw new Error('ANTHROPIC_API_KEY nao configurada')
    _client = new Anthropic({ apiKey })
  }
  return _client
}

export function getDefaultModel(): string {
  return process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-6'
}
