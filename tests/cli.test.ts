import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { resolveConfig } from '../src/cli'

describe('CLI resolveConfig', () => {
  const originalEnv = process.env

  beforeEach(() => {
    process.env = { ...originalEnv }
    // Prevent process.exit from actually exiting
    vi.spyOn(process, 'exit').mockImplementation(() => {
      throw new Error('process.exit called')
    })
    vi.spyOn(process.stderr, 'write').mockImplementation(() => true)
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true)
  })

  afterEach(() => {
    process.env = originalEnv
    vi.restoreAllMocks()
  })

  it('defaults to anthropic/adversarial/dialectical', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const config = resolveConfig(['Should we use microservices?'])

    expect(config.provider.id).toBe('anthropic')
    expect(config.topic).toBe('Should we use microservices?')
    expect(config.participants).toHaveLength(4)
  })

  it('respects --provider openrouter flag', () => {
    process.env.OPENROUTER_API_KEY = 'test-key'
    const config = resolveConfig(['--provider', 'openrouter', 'Test topic'])

    expect(config.provider.id).toBe('openrouter')
  })

  it('errors without topic', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'

    expect(() => resolveConfig([])).toThrow('process.exit called')
    expect(process.stderr.write).toHaveBeenCalled()
  })

  it('errors without API key for anthropic', () => {
    delete process.env.ANTHROPIC_API_KEY

    expect(() => resolveConfig(['topic'])).toThrow('process.exit called')
    expect(process.stderr.write).toHaveBeenCalled()
  })

  it('errors without API key for openrouter', () => {
    delete process.env.OPENROUTER_API_KEY

    expect(() => resolveConfig(['--provider', 'openrouter', 'topic'])).toThrow('process.exit called')
    expect(process.stderr.write).toHaveBeenCalled()
  })

  it('uses model override for participants', () => {
    process.env.ANTHROPIC_API_KEY = 'test-key'
    const config = resolveConfig(['--model', 'claude-opus-4-20250514', 'topic'])

    for (const p of config.participants) {
      expect(p.model).toBe('claude-opus-4-20250514')
    }
  })
})
