import type {
  DeliberationConfig,
  DeliberationMessage,
  Synthesis,
} from '../types.js'

export function groupMessagesByRound(
  messages: DeliberationMessage[],
): Map<number, DeliberationMessage[]> {
  const grouped = new Map<number, DeliberationMessage[]>()
  for (const msg of messages) {
    const existing = grouped.get(msg.round) ?? []
    existing.push(msg)
    grouped.set(msg.round, existing)
  }
  return grouped
}

export function buildSynthesisUserMessage(
  config: DeliberationConfig,
  messages: DeliberationMessage[],
): string {
  const parts: string[] = []

  parts.push(`# Decision Topic\n${config.topic}`)

  if (config.options && config.options.length > 0) {
    parts.push(`# Options\n${config.options.map((o, i) => `${i + 1}. ${o}`).join('\n')}`)
  }

  if (config.preferredOption) {
    parts.push(`# Preferred Option\n${config.preferredOption}`)
  }

  if (config.context) {
    parts.push(`# Context\n${config.context}`)
  }

  const roundLabels: Record<number, string> = {
    1: 'Initial Briefs',
    2: 'Rebuttals',
    3: 'Final Statements',
    4: 'Closing Arguments',
    5: 'Summary',
  }

  const grouped = groupMessagesByRound(messages)
  const sortedRounds = [...grouped.keys()].sort((a, b) => a - b)

  for (const round of sortedRounds) {
    const label = roundLabels[round] ?? `Round ${round}`
    const roundMessages = grouped.get(round)
    if (!roundMessages) continue

    parts.push(`## Round ${round}: ${label}`)
    for (const msg of roundMessages) {
      parts.push(`### ${msg.participantName}\n${msg.content}`)
    }
  }

  return parts.join('\n\n')
}

export function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function parseListSection(raw: string, header: string): string[] {
  const escaped = escapeRegex(header)
  const pattern = new RegExp(
    `${escaped}:\\s*\\n((?:- .+(?:\\n|$))*)`,
    'i',
  )
  const match = pattern.exec(raw)
  if (!match?.[1]) return []

  return match[1]
    .split('\n')
    .map((line) => line.replace(/^- /, '').trim())
    .filter((line) => line.length > 0)
}

export function parseSynthesisResponse(raw: string): Synthesis {
  const recommendationMatch = /RECOMMENDATION:\s*(.+)/i.exec(raw)
  const confidenceMatch = /CONFIDENCE:\s*(\d+)/i.exec(raw)
  const reasoningMatch = /REASONING:\s*(.+(?:\n(?!RISKS:|DISSENT:|VALIDATION_GATES:|ASSUMPTIONS:).+)*)/i.exec(raw)

  const recommendation = recommendationMatch?.[1]?.trim() ?? raw.slice(0, 200)
  const confidence = confidenceMatch ? parseInt(confidenceMatch[1], 10) : 50
  const reasoning = reasoningMatch?.[1]?.trim() ?? raw

  const risks = parseListSection(raw, 'RISKS')
  const dissent = parseListSection(raw, 'DISSENT')
  const validationGates = parseListSection(raw, 'VALIDATION_GATES')
  const assumptions = parseListSection(raw, 'ASSUMPTIONS')

  return {
    recommendation,
    confidence: Math.min(100, Math.max(0, confidence)),
    reasoning,
    risks,
    dissent,
    validationGates,
    assumptions,
    raw,
  }
}
