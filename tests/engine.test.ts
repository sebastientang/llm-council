import { describe, expect, it, vi } from 'vitest'
import { Council } from '../src/engine'
import { AdversarialProtocol } from '../src/protocols/adversarial'
import { DialecticalSynthesizer } from '../src/synthesis/dialectical'
import type { DeliberationConfig } from '../src/types'
import {
  MockProvider,
  MOCK_SYNTHESIS_RESPONSE,
  makeParticipants,
} from './helpers'

function createCouncil(provider?: MockProvider) {
  const mock = provider ?? new MockProvider()
  return {
    council: new Council({
      providers: new Map([['mock', mock]]),
      protocol: new AdversarialProtocol(),
      synthesizer: new DialecticalSynthesizer(),
    }),
    provider: mock,
  }
}

function createConfig(
  overrides: Partial<DeliberationConfig> = {},
): DeliberationConfig {
  return {
    topic: 'Should we accept 500/day or negotiate for 600/day?',
    options: ['Accept 500/day', 'Negotiate for 600/day'],
    preferredOption: 'Negotiate for 600/day',
    context: 'Current pipeline is thin. Cash runway is 3 months.',
    participants: makeParticipants(),
    rounds: 2,
    ...overrides,
  }
}

describe('Council', () => {
  it('runs a full deliberation and returns a result', async () => {
    const mock = new MockProvider()
    mock.setResponse('proposer', '## Proposer Brief\n**Recommendation:** Go for 600/day')
    mock.setResponse('challenger', '## Challenger Brief\n**Verdict:** Risky')
    mock.setResponse('steelmanner', '## Steelmanner Brief\n**The case for 500/day:** Stability')
    mock.setResponse('pre-mortem', '## Pre-Mortem Brief\n**Timeframe:** 3 months')

    // The synthesizer will also call the provider — set a catch-all for synthesis
    const originalComplete = mock.complete.bind(mock)
    let callCount = 0
    mock.complete = async (req) => {
      callCount++
      // The 9th call (after 4+4 round calls) is synthesis
      if (callCount > 8) {
        return {
          content: MOCK_SYNTHESIS_RESPONSE,
          tokenCount: { input: 500, output: 200 },
          model: req.model,
        }
      }
      return originalComplete(req)
    }

    const { council } = createCouncil(mock)
    const config = createConfig()
    const result = await council.deliberate(config)

    expect(result.messages).toHaveLength(8) // 4 participants x 2 rounds
    expect(result.synthesis.recommendation).toContain('600/day')
    expect(result.synthesis.confidence).toBe(75)
    expect(result.synthesis.risks).toHaveLength(3)
    expect(result.metadata.durationMs).toBeGreaterThan(0)
  })

  it('emits events during deliberation', async () => {
    const mock = new MockProvider(MOCK_SYNTHESIS_RESPONSE)
    const { council } = createCouncil(mock)

    const events: string[] = []
    council.on('round:start', () => events.push('round:start'))
    council.on('response', () => events.push('response'))
    council.on('synthesis:start', () => events.push('synthesis:start'))
    council.on('complete', () => events.push('complete'))

    await council.deliberate(createConfig())

    expect(events.filter((e) => e === 'round:start')).toHaveLength(2)
    expect(events.filter((e) => e === 'response')).toHaveLength(8)
    expect(events).toContain('synthesis:start')
    expect(events).toContain('complete')
  })

  it('emits error event on failure', async () => {
    const { council } = createCouncil()
    const errors: Error[] = []
    council.on('error', (err) => errors.push(err))

    const config = createConfig({
      participants: makeParticipants('nonexistent'),
    })

    await expect(council.deliberate(config)).rejects.toThrow()
    expect(errors).toHaveLength(1)
    expect(errors[0].message).toContain('nonexistent')
  })

  it('throws when provider is missing', async () => {
    const { council } = createCouncil()
    const config = createConfig({
      participants: makeParticipants('nonexistent'),
    })

    await expect(council.deliberate(config)).rejects.toThrow(
      "Provider 'nonexistent' not found",
    )
  })

  it('validates config with Zod', async () => {
    const { council } = createCouncil()

    await expect(
      council.deliberate({
        topic: '',
        participants: [],
        rounds: 2,
      } as DeliberationConfig),
    ).rejects.toThrow()
  })

  it('respects rounds limit', async () => {
    const mock = new MockProvider(MOCK_SYNTHESIS_RESPONSE)
    const { council } = createCouncil(mock)
    const config = createConfig({ rounds: 1 })

    const result = await council.deliberate(config)

    // 1 round x 4 participants = 4 messages
    expect(result.messages).toHaveLength(4)
  })

  it('tracks token metadata per model', async () => {
    const mock = new MockProvider(MOCK_SYNTHESIS_RESPONSE)
    const { council } = createCouncil(mock)
    const result = await council.deliberate(createConfig())

    const breakdown = result.metadata.modelBreakdown
    expect(breakdown['mock/test-model']).toBeDefined()
    expect(breakdown['mock/test-model'].input).toBeGreaterThan(0)
    expect(breakdown['mock/test-model'].output).toBeGreaterThan(0)
  })
})
