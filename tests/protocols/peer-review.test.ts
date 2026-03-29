import { describe, it, expect } from 'vitest'
import { PeerReviewProtocol } from '../../src/protocols/peer-review'
import { makeParticipants } from '../helpers'
import type { DeliberationConfig, DeliberationMessage } from '../../src/types'

function createConfig(overrides: Partial<DeliberationConfig> = {}): DeliberationConfig {
  return {
    topic: 'Should we adopt microservices?',
    options: ['Microservices', 'Monolith'],
    preferredOption: 'Microservices',
    context: 'Current system handles 10k RPM',
    participants: makeParticipants(),
    rounds: 2,
    ...overrides,
  }
}

function makeRound1Messages(): DeliberationMessage[] {
  const participants = makeParticipants()
  const briefs = [
    'We should adopt microservices for better scalability.',
    'The monolith is safer given our team size.',
    'A modular monolith gives us the best of both worlds.',
    'If we adopt microservices, deployment complexity will cause outages within 6 months.',
  ]
  return participants.map((p, i) => ({
    participantId: p.id,
    participantName: p.name,
    round: 1,
    content: briefs[i],
    timestamp: new Date(),
    tokenCount: { input: 100, output: 50 },
  }))
}

function makeRound2Messages(): DeliberationMessage[] {
  const participants = makeParticipants()
  return participants.map((p) => ({
    participantId: p.id,
    participantName: p.name,
    round: 2,
    content: `RANKING:\n1. Response A - Strongest evidence\n2. Response B - Good structure\n3. Response C - Valid concerns\n4. Response D - Weak support`,
    timestamp: new Date(),
    tokenCount: { input: 100, output: 50 },
  }))
}

describe('PeerReviewProtocol', () => {
  it('returns 2 rounds by default', () => {
    const protocol = new PeerReviewProtocol()
    expect(protocol.getRoundCount()).toBe(2)
  })

  it('returns 3 rounds when enableRevote is true', () => {
    const protocol = new PeerReviewProtocol({ enableRevote: true })
    expect(protocol.getRoundCount()).toBe(3)
  })

  it('Round 1 builds prompts for all participants', () => {
    const protocol = new PeerReviewProtocol()
    const config = createConfig()
    const prompts = protocol.buildPrompts(config, [], 1)

    expect(prompts).toHaveLength(4)
    expect(prompts[0].participantId).toBe('proposer')
    expect(prompts[0].userMessage).toContain('Decision Topic')
    expect(prompts[0].userMessage).toContain('Microservices')
  })

  it('Round 2 anonymizes all round-1 messages', () => {
    const protocol = new PeerReviewProtocol()
    const config = createConfig()
    const history = makeRound1Messages()
    const prompts = protocol.buildPrompts(config, history, 2)

    expect(prompts).toHaveLength(4)

    const userMessage = prompts[0].userMessage
    expect(userMessage).toContain('Response A')
    expect(userMessage).toContain('Response B')
    expect(userMessage).toContain('Response C')
    expect(userMessage).toContain('Response D')

    // Must NOT contain real participant names
    expect(userMessage).not.toContain('Proposer')
    expect(userMessage).not.toContain('Challenger')
    expect(userMessage).not.toContain('Steelmanner')
    expect(userMessage).not.toContain('Pre-Mortem')
  })

  it('Round 2 includes all briefs including own', () => {
    const protocol = new PeerReviewProtocol()
    const config = createConfig()
    const history = makeRound1Messages()
    const prompts = protocol.buildPrompts(config, history, 2)

    // All 4 briefs should appear in each participant's message
    const userMessage = prompts[0].userMessage
    const responseLabels = ['Response A', 'Response B', 'Response C', 'Response D']
    for (const label of responseLabels) {
      expect(userMessage).toContain(label)
    }
  })

  it('Round 2 prompt asks for ranking with justification', () => {
    const protocol = new PeerReviewProtocol()
    const config = createConfig()
    const history = makeRound1Messages()
    const prompts = protocol.buildPrompts(config, history, 2)

    const userMessage = prompts[0].userMessage
    expect(userMessage).toContain('RANKING:')
    expect(userMessage).toContain('Rank ALL responses')
    expect(userMessage).toContain('justification')
  })

  it('Round 3 includes other participants rankings when enabled', () => {
    const protocol = new PeerReviewProtocol({ enableRevote: true })
    const config = createConfig({ rounds: 3 })
    const history = [...makeRound1Messages(), ...makeRound2Messages()]
    const prompts = protocol.buildPrompts(config, history, 3)

    expect(prompts).toHaveLength(4)
    const userMessage = prompts[0].userMessage
    expect(userMessage).toContain('Rankings')
    expect(userMessage).toContain('FINAL ranking')
  })

  it('returns empty array for rounds beyond max', () => {
    const protocol = new PeerReviewProtocol()
    const config = createConfig()
    const prompts = protocol.buildPrompts(config, [], 3)
    expect(prompts).toEqual([])
  })

  it('anonymization map is consistent across rounds', () => {
    const protocol = new PeerReviewProtocol({ enableRevote: true })
    const config = createConfig({ rounds: 3 })
    const round1History = makeRound1Messages()

    // Build round 2 prompts to create the anonymization map
    const round2Prompts = protocol.buildPrompts(config, round1History, 2)

    // Build round 3 prompts — should use the same map
    const fullHistory = [...round1History, ...makeRound2Messages()]
    const round3Prompts = protocol.buildPrompts(config, fullHistory, 3)

    // Both rounds should reference the same Response labels
    expect(round2Prompts[0].userMessage).toContain('Response A')
    expect(round3Prompts[0].userMessage).toContain('Response A')
  })
})
