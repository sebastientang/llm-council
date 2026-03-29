import { describe, expect, it, vi } from 'vitest'
import { AnthropicProvider } from '../../src/providers/anthropic'

// We test the provider interface without hitting the real API.
// Real API tests are in tests/integration/ (behind INTEGRATION env flag).

describe('AnthropicProvider', () => {
  it('has correct id', () => {
    const provider = new AnthropicProvider({ apiKey: 'test-key' })
    expect(provider.id).toBe('anthropic')
  })

  it('constructs with required config', () => {
    const provider = new AnthropicProvider({ apiKey: 'test-key' })
    expect(provider).toBeDefined()
  })

  it('accepts optional config', () => {
    const provider = new AnthropicProvider({
      apiKey: 'test-key',
      defaultModel: 'claude-haiku-4-5-20251001',
      defaultMaxTokens: 512,
    })
    expect(provider).toBeDefined()
  })
})
