import { describe, expect, it } from 'vitest'
import { AdversarialProtocol } from '../../src/protocols/adversarial'
import type { DeliberationConfig, DeliberationMessage } from '../../src/types'
import { makeParticipants } from '../helpers'

function createConfig(): DeliberationConfig {
  return {
    topic: 'Build in-house or buy off-the-shelf CRM?',
    options: ['Build in-house', 'Buy Salesforce'],
    preferredOption: 'Build in-house',
    context: 'Team has 3 engineers. Budget is limited.',
    participants: makeParticipants(),
    rounds: 2,
  }
}

describe('AdversarialProtocol', () => {
  const protocol = new AdversarialProtocol()

  it('returns 2 rounds', () => {
    expect(protocol.getRoundCount()).toBe(2)
  })

  describe('Round 1 — Initial Briefs', () => {
    it('builds prompts for all participants', () => {
      const prompts = protocol.buildPrompts(createConfig(), [], 1)
      expect(prompts).toHaveLength(4)
    })

    it('includes topic and options in user message', () => {
      const prompts = protocol.buildPrompts(createConfig(), [], 1)
      const first = prompts[0]
      expect(first.userMessage).toContain('Build in-house or buy off-the-shelf CRM?')
      expect(first.userMessage).toContain('Build in-house')
      expect(first.userMessage).toContain('Buy Salesforce')
    })

    it('includes preferred option', () => {
      const prompts = protocol.buildPrompts(createConfig(), [], 1)
      expect(prompts[0].userMessage).toContain('Build in-house')
    })

    it('includes context', () => {
      const prompts = protocol.buildPrompts(createConfig(), [], 1)
      expect(prompts[0].userMessage).toContain('Team has 3 engineers')
    })

    it('uses participant system prompts', () => {
      const prompts = protocol.buildPrompts(createConfig(), [], 1)
      expect(prompts[0].systemPrompt).toContain('Proposer')
      expect(prompts[1].systemPrompt).toContain('Challenger')
    })

    it('passes temperature from participant config', () => {
      const prompts = protocol.buildPrompts(createConfig(), [], 1)
      expect(prompts[0].temperature).toBe(0.7)
    })
  })

  describe('Round 2 — Rebuttals', () => {
    const round1Messages: DeliberationMessage[] = [
      {
        participantId: 'proposer',
        participantName: 'Proposer',
        round: 1,
        content: 'Build in-house gives full control.',
        timestamp: new Date(),
        tokenCount: { input: 100, output: 50 },
      },
      {
        participantId: 'challenger',
        participantName: 'Challenger',
        round: 1,
        content: 'Building in-house is too expensive.',
        timestamp: new Date(),
        tokenCount: { input: 100, output: 50 },
      },
      {
        participantId: 'steelmanner',
        participantName: 'Steelmanner',
        round: 1,
        content: 'Salesforce offers ecosystem advantages.',
        timestamp: new Date(),
        tokenCount: { input: 100, output: 50 },
      },
      {
        participantId: 'pre-mortem',
        participantName: 'Pre-Mortem',
        round: 1,
        content: 'The project ran over budget by 200%.',
        timestamp: new Date(),
        tokenCount: { input: 100, output: 50 },
      },
    ]

    it('builds rebuttal prompts excluding own message', () => {
      const prompts = protocol.buildPrompts(
        createConfig(),
        round1Messages,
        2,
      )

      // Proposer should see Challenger, Steelmanner, Pre-Mortem but not self
      const proposerPrompt = prompts.find((p) => p.participantId === 'proposer')
      expect(proposerPrompt?.userMessage).toContain('Challenger')
      expect(proposerPrompt?.userMessage).toContain('Steelmanner')
      expect(proposerPrompt?.userMessage).not.toContain('### Proposer')
    })

    it('includes rebuttal guidance for proposer', () => {
      const prompts = protocol.buildPrompts(
        createConfig(),
        round1Messages,
        2,
      )
      const proposerPrompt = prompts.find((p) => p.participantId === 'proposer')
      expect(proposerPrompt?.userMessage).toContain("Challenger's strongest attack")
    })

    it('includes rebuttal guidance for challenger', () => {
      const prompts = protocol.buildPrompts(
        createConfig(),
        round1Messages,
        2,
      )
      const challengerPrompt = prompts.find(
        (p) => p.participantId === 'challenger',
      )
      expect(challengerPrompt?.userMessage).toContain("Proposer's acknowledged weakness")
    })
  })

  describe('Custom rebuttal guidance', () => {
    it('accepts custom rebuttal guidance', () => {
      const custom = new AdversarialProtocol({
        rebuttalGuidance: {
          proposer: 'Defend your position with data.',
        },
      })

      const messages: DeliberationMessage[] = [
        {
          participantId: 'proposer',
          participantName: 'Proposer',
          round: 1,
          content: 'Test',
          timestamp: new Date(),
          tokenCount: { input: 10, output: 10 },
        },
        {
          participantId: 'challenger',
          participantName: 'Challenger',
          round: 1,
          content: 'Test',
          timestamp: new Date(),
          tokenCount: { input: 10, output: 10 },
        },
      ]

      const config: DeliberationConfig = {
        topic: 'Test',
        participants: makeParticipants().slice(0, 2),
        rounds: 2,
      }

      const prompts = custom.buildPrompts(config, messages, 2)
      const proposer = prompts.find((p) => p.participantId === 'proposer')
      expect(proposer?.userMessage).toContain('Defend your position with data')
    })
  })

  it('returns empty array for rounds beyond 2', () => {
    const prompts = protocol.buildPrompts(createConfig(), [], 3)
    expect(prompts).toHaveLength(0)
  })
})
