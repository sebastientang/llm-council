import type {
  DeliberationConfig,
  DeliberationMessage,
  Protocol,
  PromptRequest,
} from '../types.js'
import {
  anonymizeMessages,
  createAnonymizationMap,
  type AnonymizationMap,
} from '../utils/anonymizer.js'
import { buildInitialUserMessage } from '../utils/prompt-builder.js'

interface PeerReviewProtocolOptions {
  enableRevote?: boolean
}

export class PeerReviewProtocol implements Protocol {
  private readonly enableRevote: boolean

  constructor(options?: PeerReviewProtocolOptions) {
    this.enableRevote = options?.enableRevote ?? false
  }

  getRoundCount(): number {
    return this.enableRevote ? 3 : 2
  }

  buildPrompts(
    config: DeliberationConfig,
    history: DeliberationMessage[],
    round: number,
  ): PromptRequest[] {
    if (round === 1) {
      return this.buildInitialBriefs(config)
    }

    // Create anonymization map fresh from participant list for rounds 2+
    const anonMap = createAnonymizationMap(config.participants.map((p) => p.id))

    if (round === 2) {
      return this.buildRankingRound(config, history, anonMap)
    }

    if (round === 3 && this.enableRevote) {
      return this.buildRevoteRound(config, history, anonMap)
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

  private buildRankingRound(
    config: DeliberationConfig,
    history: DeliberationMessage[],
    anonMap: AnonymizationMap,
  ): PromptRequest[] {
    const round1Messages = history.filter((msg) => msg.round === 1)
    const anonymized = anonymizeMessages(round1Messages, anonMap)
    const briefsText = anonymized
      .map((entry) => `### ${entry.label}\n${entry.content}`)
      .join('\n\n')

    const labelList = anonymized.map((e) => e.label).join(', ')

    return config.participants.map((participant) => ({
      participantId: participant.id,
      provider: participant.provider,
      model: participant.model,
      systemPrompt: participant.systemPrompt,
      userMessage: buildRankingUserMessage(briefsText, labelList),
      temperature: participant.temperature ?? 0.7,
      maxTokens: config.tokenBudget?.perResponse,
    }))
  }

  private buildRevoteRound(
    config: DeliberationConfig,
    history: DeliberationMessage[],
    anonMap: AnonymizationMap,
  ): PromptRequest[] {
    const round2Messages = history.filter((msg) => msg.round === 2)
    const anonymizedRankings = anonymizeMessages(round2Messages, anonMap)
    const rankingsText = anonymizedRankings
      .map((entry) => `### ${entry.label}'s Rankings\n${entry.content}`)
      .join('\n\n')

    const round1Messages = history.filter((msg) => msg.round === 1)
    const anonymizedBriefs = anonymizeMessages(round1Messages, anonMap)
    const labelList = anonymizedBriefs.map((e) => e.label).join(', ')

    return config.participants.map((participant) => ({
      participantId: participant.id,
      provider: participant.provider,
      model: participant.model,
      systemPrompt: participant.systemPrompt,
      userMessage: buildRevoteUserMessage(rankingsText, labelList),
      temperature: participant.temperature ?? 0.7,
      maxTokens: config.tokenBudget?.perResponse,
    }))
  }
}

function buildRankingUserMessage(briefsText: string, labelList: string): string {
  const parts: string[] = []

  parts.push('You are participating in an anonymized peer review. Below are briefs from all council members (including yours, but you do not know which one is yours).')
  parts.push(briefsText)
  parts.push(`Rank ALL responses from best to worst (${labelList}). For each, provide a one-sentence justification.

Respond in EXACTLY this format:

RANKING:
1. [Label] - [one-sentence justification]
2. [Label] - [one-sentence justification]
3. [Label] - [one-sentence justification]
4. [Label] - [one-sentence justification]`)

  return parts.join('\n\n')
}

function buildRevoteUserMessage(rankingsText: string, labelList: string): string {
  const parts: string[] = []

  parts.push('You have seen the other council members\' anonymous rankings. Review them and submit your final ranking.')
  parts.push(rankingsText)
  parts.push(`Submit your FINAL ranking of all responses (${labelList}). Consider the other members\' perspectives.

Respond in EXACTLY this format:

RANKING:
1. [Label] - [one-sentence justification]
2. [Label] - [one-sentence justification]
3. [Label] - [one-sentence justification]
4. [Label] - [one-sentence justification]`)

  return parts.join('\n\n')
}
