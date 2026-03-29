import { parseArgs } from 'node:util'
import { readFileSync } from 'node:fs'
import { Council } from './engine.js'
import { AnthropicProvider } from './providers/anthropic.js'
import { OpenRouterProvider } from './providers/openrouter.js'
import { AdversarialProtocol } from './protocols/adversarial.js'
import { PeerReviewProtocol } from './protocols/peer-review.js'
import { DialecticalSynthesizer } from './synthesis/dialectical.js'
import { ChairmanSynthesizer } from './synthesis/chairman.js'
import { PERSONAS } from './personas/index.js'
import type { LLMProvider, Protocol, Synthesizer, Participant, DeliberationConfig } from './types.js'

// ANSI helpers
const bold = (s: string) => `\x1b[1m${s}\x1b[0m`
const dim = (s: string) => `\x1b[2m${s}\x1b[0m`
const green = (s: string) => `\x1b[32m${s}\x1b[0m`
const yellow = (s: string) => `\x1b[33m${s}\x1b[0m`
const red = (s: string) => `\x1b[31m${s}\x1b[0m`
const cyan = (s: string) => `\x1b[36m${s}\x1b[0m`

const HELP = `
${bold('llm-council')} — Multi-model deliberation engine

${bold('USAGE')}
  llm-council "Should we adopt microservices?"
  llm-council --provider openrouter --model openai/gpt-4o "topic"
  llm-council --config council.json "topic"

${bold('OPTIONS')}
  --provider     ${dim('anthropic | openrouter')}        ${dim('(default: anthropic)')}
  --protocol     ${dim('adversarial | peer-review')}     ${dim('(default: adversarial)')}
  --synthesizer  ${dim('dialectical | chairman')}        ${dim('(default: dialectical)')}
  --model        ${dim('model ID for all participants')}  ${dim('(default: provider-dependent)')}
  --multi-model  ${dim('use 4 different LLMs via OpenRouter (requires OPENROUTER_API_KEY)')}
  --revote       ${dim('enable 3rd round re-vote (peer-review only)')}
  --config       ${dim('path to JSON config file')}
  --help         ${dim('show this help')}

${bold('ENVIRONMENT')}
  ANTHROPIC_API_KEY     Required when --provider=anthropic
  OPENROUTER_API_KEY    Required when --provider=openrouter

${bold('CONFIG FILE')}
  {
    "provider": "openrouter",
    "protocol": "adversarial",
    "synthesizer": "dialectical",
    "model": "openai/gpt-4o"
  }
`

interface ResolvedConfig {
  provider: LLMProvider
  protocol: Protocol
  synthesizer: Synthesizer
  participants: Participant[]
  topic: string
  rounds: number
}

interface ConfigFile {
  provider?: string
  protocol?: string
  synthesizer?: string
  model?: string
}

export function resolveConfig(args: string[]): ResolvedConfig {
  const { values, positionals } = parseArgs({
    args,
    options: {
      provider: { type: 'string', default: 'anthropic' },
      protocol: { type: 'string', default: 'adversarial' },
      synthesizer: { type: 'string', default: 'dialectical' },
      model: { type: 'string' },
      'multi-model': { type: 'boolean', default: false },
      revote: { type: 'boolean', default: false },
      config: { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    allowPositionals: true,
  })

  if (values.help) {
    process.stdout.write(HELP)
    process.exit(0)
  }

  // Load config file if provided
  let fileConfig: ConfigFile = {}
  if (values.config) {
    const raw = readFileSync(values.config, 'utf-8')
    fileConfig = JSON.parse(raw) as ConfigFile
  }

  // Flags override config file
  const providerName = values.provider ?? fileConfig.provider ?? 'anthropic'
  const protocolName = values.protocol ?? fileConfig.protocol ?? 'adversarial'
  const synthesizerName = values.synthesizer ?? fileConfig.synthesizer ?? 'dialectical'
  const modelOverride = values.model ?? fileConfig.model

  const topic = positionals[0]
  if (!topic) {
    process.stderr.write(red('Error: topic is required. Usage: llm-council "your topic"\n'))
    process.exit(1)
  }

  // Multi-model mode: 4 different LLMs via OpenRouter
  const multiModel = values['multi-model'] ?? false

  if (multiModel) {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) {
      process.stderr.write(red('Error: --multi-model requires OPENROUTER_API_KEY environment variable\n'))
      process.exit(1)
    }

    const provider = new OpenRouterProvider({ apiKey, appName: 'llm-council' })
    const enableRevote = values.revote ?? false
    const protocol = resolveProtocol(protocolName, enableRevote)
    const synthesisModel = modelOverride ?? 'anthropic/claude-sonnet-4'
    const synthesizer = resolveSynthesizer(synthesizerName, synthesisModel)

    const participants: Participant[] = [
      { ...PERSONAS.proposer, provider: 'openrouter', model: 'anthropic/claude-opus-4.6' },
      { ...PERSONAS.challenger, provider: 'openrouter', model: 'openai/gpt-5.4' },
      { ...PERSONAS.steelmanner, provider: 'openrouter', model: 'google/gemini-3.1-pro-preview' },
      { ...PERSONAS.preMortem, provider: 'openrouter', model: 'meta-llama/llama-4-maverick' },
    ]

    const rounds = protocol.getRoundCount()
    return { provider, protocol, synthesizer, participants, topic, rounds }
  }

  // Standard mode: single provider, single model
  const provider = resolveProvider(providerName, modelOverride)

  const enableRevote = values.revote ?? false
  const protocol = resolveProtocol(protocolName, enableRevote)

  const synthesizer = resolveSynthesizer(synthesizerName, modelOverride)

  const model = modelOverride ?? getDefaultModel(providerName)
  const participants: Participant[] = [
    { ...PERSONAS.proposer, provider: providerName, model },
    { ...PERSONAS.challenger, provider: providerName, model },
    { ...PERSONAS.steelmanner, provider: providerName, model },
    { ...PERSONAS.preMortem, provider: providerName, model },
  ]

  const rounds = protocol.getRoundCount()

  return { provider, protocol, synthesizer, participants, topic, rounds }
}

function resolveProvider(name: string, modelOverride?: string): LLMProvider {
  switch (name) {
    case 'anthropic': {
      const apiKey = process.env.ANTHROPIC_API_KEY
      if (!apiKey) {
        process.stderr.write(red('Error: ANTHROPIC_API_KEY environment variable is required\n'))
        process.exit(1)
      }
      return new AnthropicProvider({
        apiKey,
        ...(modelOverride && { defaultModel: modelOverride }),
      })
    }
    case 'openrouter': {
      const apiKey = process.env.OPENROUTER_API_KEY
      if (!apiKey) {
        process.stderr.write(red('Error: OPENROUTER_API_KEY environment variable is required\n'))
        process.exit(1)
      }
      return new OpenRouterProvider({
        apiKey,
        appName: 'llm-council',
        ...(modelOverride && { defaultModel: modelOverride }),
      })
    }
    default:
      process.stderr.write(red(`Error: unknown provider "${name}". Use: anthropic, openrouter\n`))
      process.exit(1)
  }
}

function resolveProtocol(name: string, enableRevote: boolean): Protocol {
  switch (name) {
    case 'adversarial':
      return new AdversarialProtocol()
    case 'peer-review':
      return new PeerReviewProtocol({ enableRevote })
    default:
      process.stderr.write(red(`Error: unknown protocol "${name}". Use: adversarial, peer-review\n`))
      process.exit(1)
  }
}

function resolveSynthesizer(name: string, modelOverride?: string): Synthesizer {
  switch (name) {
    case 'dialectical':
      return new DialecticalSynthesizer(modelOverride ? { model: modelOverride } : {})
    case 'chairman':
      return new ChairmanSynthesizer(modelOverride ? { model: modelOverride } : {})
    default:
      process.stderr.write(red(`Error: unknown synthesizer "${name}". Use: dialectical, chairman\n`))
      process.exit(1)
  }
}

function getDefaultModel(providerName: string): string {
  switch (providerName) {
    case 'anthropic':
      return 'claude-sonnet-4-20250514'
    case 'openrouter':
      return 'openai/gpt-4o'
    default:
      return 'claude-sonnet-4-20250514'
  }
}

async function main() {
  const resolved = resolveConfig(process.argv.slice(2))

  const config: DeliberationConfig = {
    topic: resolved.topic,
    participants: resolved.participants,
    rounds: resolved.rounds,
  }

  const providerName = resolved.participants[0].provider
  const providers = new Map([[providerName, resolved.provider]])

  const council = new Council({
    providers,
    protocol: resolved.protocol,
    synthesizer: resolved.synthesizer,
  })

  process.stdout.write(`\n${bold('LLM Council')} — deliberating on: ${cyan(config.topic)}\n\n`)

  council.on('round:start', ({ round, participantCount }) => {
    process.stdout.write(cyan(`Round ${round} — ${participantCount} participants\n`))
  })

  council.on('response', (msg) => {
    process.stdout.write(dim(`  ${msg.participantName} responded (${msg.tokenCount.output} tokens)\n`))
  })

  council.on('synthesis:start', () => {
    process.stdout.write(yellow('\nSynthesizing...\n'))
  })

  const result = await council.deliberate(config)

  process.stdout.write(`\n${bold(green('RECOMMENDATION'))}\n`)
  process.stdout.write(`${result.synthesis.recommendation}\n\n`)

  process.stdout.write(`${bold('Confidence:')} ${formatConfidence(result.synthesis.confidence)}\n\n`)

  process.stdout.write(`${bold('Reasoning:')}\n${result.synthesis.reasoning}\n\n`)

  if (result.synthesis.risks.length > 0) {
    process.stdout.write(`${bold('Risks:')}\n`)
    for (const risk of result.synthesis.risks) {
      process.stdout.write(`  ${red('!')} ${risk}\n`)
    }
    process.stdout.write('\n')
  }

  if (result.synthesis.dissent.length > 0) {
    process.stdout.write(`${bold('Dissent:')}\n`)
    for (const d of result.synthesis.dissent) {
      process.stdout.write(`  ${yellow('>')} ${d}\n`)
    }
    process.stdout.write('\n')
  }

  if (result.synthesis.validationGates.length > 0) {
    process.stdout.write(`${bold('Validation Gates:')}\n`)
    for (const gate of result.synthesis.validationGates) {
      process.stdout.write(`  ${green('*')} ${gate}\n`)
    }
    process.stdout.write('\n')
  }

  const total = result.metadata.totalTokens
  const durationSec = (result.metadata.durationMs / 1000).toFixed(1)
  process.stdout.write(dim(`Tokens: ${total.input} in / ${total.output} out | Duration: ${durationSec}s\n`))
}

function formatConfidence(confidence: number): string {
  if (confidence >= 90) return green(`${confidence}% (high)`)
  if (confidence >= 70) return green(`${confidence}% (moderate-high)`)
  if (confidence >= 50) return yellow(`${confidence}% (moderate)`)
  return red(`${confidence}% (low)`)
}

// Only auto-run when executed directly, not when imported for testing
const isTesting = process.env.VITEST === 'true' || process.env.NODE_ENV === 'test'
if (!isTesting) {
  main().catch((error: Error) => {
    process.stderr.write(red(`\nError: ${error.message}\n`))
    process.exit(1)
  })
}
