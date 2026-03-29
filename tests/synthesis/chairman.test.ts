import { describe, it, expect } from 'vitest'
import { ChairmanSynthesizer } from '../../src/synthesis/chairman'
import { MockProvider, makeParticipants, MOCK_SYNTHESIS_RESPONSE } from '../helpers'
import type { DeliberationConfig, DeliberationMessage } from '../../src/types'

function createConfig(): DeliberationConfig {
  return {
    topic: 'Should we accept the 600/day contract?',
    options: ['Accept at 600/day', 'Counter at 650/day', 'Walk away'],
    preferredOption: 'Accept at 600/day',
    context: 'Pipeline is thin, need revenue.',
    participants: makeParticipants(),
    rounds: 2,
  }
}

function makeMessages(): DeliberationMessage[] {
  const participants = makeParticipants()
  return participants.flatMap((p) =>
    [1, 2].map((round) => ({
      participantId: p.id,
      participantName: p.name,
      round,
      content: `${p.name}'s argument for round ${round}.`,
      timestamp: new Date(),
      tokenCount: { input: 100, output: 50 },
    })),
  )
}

describe('ChairmanSynthesizer', () => {
  it('calls provider with chairman system prompt', async () => {
    const provider = new MockProvider(MOCK_SYNTHESIS_RESPONSE)
    const synthesizer = new ChairmanSynthesizer()

    await synthesizer.synthesize(createConfig(), makeMessages(), provider)

    expect(provider.calls).toHaveLength(1)
    const systemPrompt = provider.calls[0].systemPrompt
    expect(systemPrompt).toContain('SELECT THE BEST')
    expect(systemPrompt).toContain('Do not synthesize or merge')
  })

  it('parses structured synthesis response', async () => {
    const provider = new MockProvider(MOCK_SYNTHESIS_RESPONSE)
    const synthesizer = new ChairmanSynthesizer()

    const result = await synthesizer.synthesize(createConfig(), makeMessages(), provider)

    expect(result.recommendation).toContain('600/day')
    expect(result.confidence).toBe(75)
    expect(result.risks).toHaveLength(3)
    expect(result.dissent).toHaveLength(1)
    expect(result.validationGates).toHaveLength(2)
    expect(result.assumptions).toHaveLength(3)
    expect(result.raw).toBe(MOCK_SYNTHESIS_RESPONSE)
  })

  it('uses custom model and temperature', async () => {
    const provider = new MockProvider(MOCK_SYNTHESIS_RESPONSE)
    const synthesizer = new ChairmanSynthesizer({
      model: 'custom-model',
      temperature: 0.1,
    })

    await synthesizer.synthesize(createConfig(), makeMessages(), provider)

    expect(provider.calls[0].model).toBe('custom-model')
    expect(provider.calls[0].temperature).toBe(0.1)
  })

  it('uses default temperature of 0.3', async () => {
    const provider = new MockProvider(MOCK_SYNTHESIS_RESPONSE)
    const synthesizer = new ChairmanSynthesizer()

    await synthesizer.synthesize(createConfig(), makeMessages(), provider)

    expect(provider.calls[0].temperature).toBe(0.3)
  })

  it('includes all participant messages grouped by round', async () => {
    const provider = new MockProvider(MOCK_SYNTHESIS_RESPONSE)
    const synthesizer = new ChairmanSynthesizer()

    await synthesizer.synthesize(createConfig(), makeMessages(), provider)

    const userMessage = provider.calls[0].messages[0].content
    expect(userMessage).toContain('Round 1: Initial Briefs')
    expect(userMessage).toContain('Round 2: Rebuttals')
    expect(userMessage).toContain('Proposer')
    expect(userMessage).toContain('Challenger')
    expect(userMessage).toContain('Steelmanner')
    expect(userMessage).toContain('Pre-Mortem')
  })
})
