import { describe, expect, it } from 'vitest'
import { DialecticalSynthesizer } from '../../src/synthesis/dialectical'
import type { DeliberationConfig, DeliberationMessage } from '../../src/types'
import { MockProvider, MOCK_SYNTHESIS_RESPONSE, makeParticipants } from '../helpers'

function createConfig(): DeliberationConfig {
  return {
    topic: 'Accept 500/day or negotiate for 600/day?',
    options: ['Accept 500/day', 'Negotiate for 600/day'],
    preferredOption: 'Negotiate for 600/day',
    participants: makeParticipants(),
    rounds: 2,
  }
}

function createMessages(): DeliberationMessage[] {
  return [
    {
      participantId: 'proposer',
      participantName: 'Proposer',
      round: 1,
      content: '## Proposer Brief\n**Recommendation:** Go for 600/day',
      timestamp: new Date(),
      tokenCount: { input: 100, output: 50 },
    },
    {
      participantId: 'challenger',
      participantName: 'Challenger',
      round: 1,
      content: '## Challenger Brief\n**Verdict:** The 600/day rate is risky',
      timestamp: new Date(),
      tokenCount: { input: 100, output: 50 },
    },
    {
      participantId: 'proposer',
      participantName: 'Proposer',
      round: 2,
      content: 'Rebuttal: The risk is manageable because...',
      timestamp: new Date(),
      tokenCount: { input: 100, output: 50 },
    },
    {
      participantId: 'challenger',
      participantName: 'Challenger',
      round: 2,
      content: 'Rebuttal: The weakness is potentially fatal...',
      timestamp: new Date(),
      tokenCount: { input: 100, output: 50 },
    },
  ]
}

describe('DialecticalSynthesizer', () => {
  it('calls provider with structured system and user messages', async () => {
    const mock = new MockProvider(MOCK_SYNTHESIS_RESPONSE)
    const synth = new DialecticalSynthesizer()

    await synth.synthesize(createConfig(), createMessages(), mock)

    expect(mock.calls).toHaveLength(1)
    const call = mock.calls[0]
    expect(call.systemPrompt).toContain('Synthesis Moderator')
    expect(call.messages[0].content).toContain('500/day or negotiate for 600/day')
    expect(call.messages[0].content).toContain('Round 1: Initial Briefs')
    expect(call.messages[0].content).toContain('Round 2: Rebuttals')
  })

  it('parses structured synthesis response', async () => {
    const mock = new MockProvider(MOCK_SYNTHESIS_RESPONSE)
    const synth = new DialecticalSynthesizer()

    const result = await synth.synthesize(
      createConfig(),
      createMessages(),
      mock,
    )

    expect(result.recommendation).toContain('600/day')
    expect(result.confidence).toBe(75)
    expect(result.reasoning).toContain('council majority')
    expect(result.risks).toHaveLength(3)
    expect(result.risks[0]).toContain('scope')
    expect(result.dissent).toHaveLength(1)
    expect(result.validationGates).toHaveLength(2)
    expect(result.assumptions).toHaveLength(3)
    expect(result.raw).toBe(MOCK_SYNTHESIS_RESPONSE)
  })

  it('handles malformed response with defaults', async () => {
    const mock = new MockProvider('This is just plain text with no structure')
    const synth = new DialecticalSynthesizer()

    const result = await synth.synthesize(
      createConfig(),
      createMessages(),
      mock,
    )

    expect(result.confidence).toBe(50) // default
    expect(result.risks).toHaveLength(0) // no parseable risks
    expect(result.raw).toBe('This is just plain text with no structure')
  })

  it('clamps confidence to 0-100', async () => {
    const mock = new MockProvider(
      'RECOMMENDATION: Do it\nCONFIDENCE: 150\nREASONING: Very confident',
    )
    const synth = new DialecticalSynthesizer()

    const result = await synth.synthesize(
      createConfig(),
      createMessages(),
      mock,
    )

    expect(result.confidence).toBe(100)
  })

  it('uses custom model and temperature', async () => {
    const mock = new MockProvider(MOCK_SYNTHESIS_RESPONSE)
    const synth = new DialecticalSynthesizer({
      model: 'claude-haiku-4-5-20251001',
      temperature: 0.1,
    })

    await synth.synthesize(createConfig(), createMessages(), mock)

    expect(mock.calls[0].model).toBe('claude-haiku-4-5-20251001')
    expect(mock.calls[0].temperature).toBe(0.1)
  })

  it('includes all participant messages grouped by round', async () => {
    const mock = new MockProvider(MOCK_SYNTHESIS_RESPONSE)
    const synth = new DialecticalSynthesizer()

    await synth.synthesize(createConfig(), createMessages(), mock)

    const userMsg = mock.calls[0].messages[0].content
    expect(userMsg).toContain('### Proposer')
    expect(userMsg).toContain('### Challenger')
    expect(userMsg).toContain('Round 1')
    expect(userMsg).toContain('Round 2')
  })
})
