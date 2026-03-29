import type {
  DeliberationConfig,
  DeliberationMessage,
  Protocol,
  PromptRequest,
} from '../types.js'
import { buildInitialUserMessage } from '../utils/prompt-builder.js'

const DEFAULT_REBUTTAL_GUIDANCE: Record<string, string> = {
  proposer:
    "Focus your rebuttal on the Challenger's strongest attack.",
  challenger:
    "Focus on whether the Proposer's acknowledged weakness is actually fatal.",
  steelmanner:
    "Focus on whether the Pre-Mortem's failure story applies equally to the rejected option.",
  'pre-mortem':
    "Focus on which of the Proposer's assumptions appear in your failure cascade.",
}

interface AdversarialProtocolOptions {
  rebuttalGuidance?: Record<string, string>
}

function getRebuttalGuidance(
  participantId: string,
  guidanceMap: Record<string, string>,
): string {
  for (const [key, guidance] of Object.entries(guidanceMap)) {
    if (participantId.toLowerCase().includes(key.toLowerCase())) {
      return guidance
    }
  }
  return 'Address the most critical point from another member.'
}

function buildRebuttalUserMessage(
  participantId: string,
  otherMessages: DeliberationMessage[],
  guidanceMap: Record<string, string>,
): string {
  const parts: string[] = []

  parts.push("Here are the other Council members' briefs:")

  for (const msg of otherMessages) {
    parts.push(`### ${msg.participantName}\n${msg.content}`)
  }

  const guidance = getRebuttalGuidance(participantId, guidanceMap)

  parts.push(
    `Write your rebuttal (100-200 words). ${guidance}`,
  )

  return parts.join('\n\n')
}

export class AdversarialProtocol implements Protocol {
  private readonly rebuttalGuidance: Record<string, string>

  constructor(options?: AdversarialProtocolOptions) {
    this.rebuttalGuidance = options?.rebuttalGuidance ?? DEFAULT_REBUTTAL_GUIDANCE
  }

  getRoundCount(): number {
    return 2
  }

  buildPrompts(
    config: DeliberationConfig,
    history: DeliberationMessage[],
    round: number,
  ): PromptRequest[] {
    if (round === 1) {
      return this.buildInitialBriefs(config)
    }

    if (round === 2) {
      return this.buildRebuttals(config, history)
    }

    return []
  }

  private buildInitialBriefs(config: DeliberationConfig): PromptRequest[] {
    const userMessage = buildInitialUserMessage(config)

    return config.participants.map((participant) => ({
      participantId: participant.id,
      provider: participant.provider,
      model: participant.model,
      systemPrompt: participant.systemPrompt,
      userMessage,
      temperature: participant.temperature ?? 0.7,
      maxTokens: config.tokenBudget?.perResponse,
    }))
  }

  private buildRebuttals(
    config: DeliberationConfig,
    history: DeliberationMessage[],
  ): PromptRequest[] {
    const round1Messages = history.filter((msg) => msg.round === 1)

    return config.participants.map((participant) => {
      const otherMessages = round1Messages.filter(
        (msg) => msg.participantId !== participant.id,
      )

      return {
        participantId: participant.id,
        provider: participant.provider,
        model: participant.model,
        systemPrompt: participant.systemPrompt,
        userMessage: buildRebuttalUserMessage(
          participant.id,
          otherMessages,
          this.rebuttalGuidance,
        ),
        temperature: participant.temperature ?? 0.7,
        maxTokens: config.tokenBudget?.perResponse,
      }
    })
  }
}
