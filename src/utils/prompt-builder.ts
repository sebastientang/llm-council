import type { DeliberationConfig } from '../types.js'

export function buildInitialUserMessage(config: DeliberationConfig): string {
  const parts: string[] = []

  parts.push(`## Decision Topic\n${config.topic}`)

  if (config.options && config.options.length > 0) {
    const optionsList = config.options
      .map((opt, i) => `${i + 1}. ${opt}`)
      .join('\n')
    parts.push(`## Options\n${optionsList}`)
  }

  if (config.preferredOption) {
    parts.push(`## Preferred Option\n${config.preferredOption}`)
  }

  if (config.context) {
    parts.push(`## Additional Context\n${config.context}`)
  }

  parts.push(
    'Provide your initial brief (200-400 words). State your position clearly and support it with reasoning.',
  )

  return parts.join('\n\n')
}
