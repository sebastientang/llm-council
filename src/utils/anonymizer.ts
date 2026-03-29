import type { DeliberationMessage } from '../types.js'

const LABELS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

export interface AnonymizationMap {
  labelToParticipant: Map<string, string>
  participantToLabel: Map<string, string>
}

export function createAnonymizationMap(
  participantIds: string[],
): AnonymizationMap {
  const labelToParticipant = new Map<string, string>()
  const participantToLabel = new Map<string, string>()

  for (let i = 0; i < participantIds.length; i++) {
    const label = `Response ${LABELS[i] ?? String(i + 1)}`
    labelToParticipant.set(label, participantIds[i])
    participantToLabel.set(participantIds[i], label)
  }

  return { labelToParticipant, participantToLabel }
}

export function anonymizeMessages(
  messages: DeliberationMessage[],
  map: AnonymizationMap,
): Array<{ label: string; content: string }> {
  return messages.map((msg) => ({
    label: map.participantToLabel.get(msg.participantId) ?? 'Unknown',
    content: msg.content,
  }))
}

export function deanonymizeLabel(
  label: string,
  map: AnonymizationMap,
): string | undefined {
  return map.labelToParticipant.get(label)
}
