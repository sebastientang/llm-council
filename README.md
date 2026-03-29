# LLM Council

When a decision is too important for one model's opinion, convene a council.

LLM Council is a TypeScript library for structured multi-model deliberation. It orchestrates multiple LLM participants through debate rounds, then synthesizes their arguments into a single recommendation with confidence scores, risks, and validation gates.

## The Problem

Single-model outputs have blind spots. Asking the same model twice gives you correlated errors, not independent verification. Multi-model voting is better, but loses the reasoning behind each vote.

LLM Council fixes this by running structured deliberation protocols where participants build cases, attack assumptions, advocate for alternatives, and narrate failure scenarios — then synthesizes the full debate into a calibrated recommendation.

## Quick Start

```bash
npm install @sebastientang/llm-council
```

### Library

```typescript
import {
  Council,
  AnthropicProvider,
  AdversarialProtocol,
  DialecticalSynthesizer,
  PERSONAS,
} from '@sebastientang/llm-council'

const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
})

const council = new Council({
  providers: new Map([['anthropic', provider]]),
  protocol: new AdversarialProtocol(),
  synthesizer: new DialecticalSynthesizer(),
})

const result = await council.deliberate({
  topic: 'Should we build in-house or buy Salesforce?',
  options: ['Build in-house CRM', 'Buy Salesforce'],
  preferredOption: 'Build in-house CRM',
  context: 'Team of 3 engineers. $50K annual budget. Need CRM in 3 months.',
  participants: [
    { ...PERSONAS.proposer, provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    { ...PERSONAS.challenger, provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    { ...PERSONAS.steelmanner, provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
    { ...PERSONAS.preMortem, provider: 'anthropic', model: 'claude-sonnet-4-20250514' },
  ],
  rounds: 2,
})

console.log(result.synthesis.recommendation)
// "Buy Salesforce — the 3-month timeline and 3-person team make in-house build high-risk."

console.log(result.synthesis.confidence)
// 78
```

### CLI

```bash
# With Anthropic
ANTHROPIC_API_KEY=sk-... npx llm-council "Should we adopt microservices?"

# With OpenRouter (access to GPT-4o, Llama, Mixtral, etc.)
OPENROUTER_API_KEY=sk-... npx llm-council --provider openrouter "Should we adopt microservices?"

# Multi-model deliberation (4 different LLMs debate)
npx llm-council --multi-model "Should we adopt microservices?"

# Full options
npx llm-council --help
```

## Protocols

### Adversarial Protocol (default)

Inspired by Dialectical Inquiry (Mason 1969) and Pre-Mortem analysis (Klein 2007):

1. **Round 1 — Independent Briefs**: Each participant writes their position without seeing others
   - **Proposer**: Builds the strongest case for the preferred option
   - **Challenger**: Red-teams the preferred option, finds vulnerabilities
   - **Steelmanner**: Advocates for the rejected option at full strength
   - **Pre-Mortem**: Assumes the preferred option failed, narrates how

2. **Round 2 — Targeted Rebuttals**: Each participant reads others' briefs and responds

3. **Synthesis**: An LLM reviews all briefs and rebuttals, producing a recommendation with confidence score, risks, dissent, validation gates, and assumptions.

### Peer-Review Protocol

Karpathy-style anonymized ranking:

1. **Round 1 — Independent Briefs**: Same as adversarial
2. **Round 2 — Anonymized Ranking**: Each participant sees all briefs labeled A, B, C, D (including their own) and ranks them with justifications
3. **Round 3 — Re-vote (optional)**: After seeing others' rankings, participants submit a final ranking

```typescript
import { PeerReviewProtocol, ChairmanSynthesizer } from '@sebastientang/llm-council'

const council = new Council({
  providers: new Map([['anthropic', provider]]),
  protocol: new PeerReviewProtocol({ enableRevote: true }),
  synthesizer: new ChairmanSynthesizer(),
})
```

## Synthesizers

### Dialectical Synthesizer (default)

Merges all arguments into a new recommendation. Weighs evidence over opinion, favors reversibility when confidence is low, synthesizes rather than averages.

### Chairman Synthesizer

Selects the best argument rather than creating a new synthesis. Evaluates responses on evidence quality, risk awareness, actionability, and logical coherence.

```typescript
import { ChairmanSynthesizer } from '@sebastientang/llm-council'

const council = new Council({
  providers: new Map([['anthropic', provider]]),
  protocol: new AdversarialProtocol(),
  synthesizer: new ChairmanSynthesizer({ temperature: 0.2 }),
})
```

## Providers

### AnthropicProvider

Direct access to Claude models via the Anthropic API.

```typescript
const provider = new AnthropicProvider({
  apiKey: process.env.ANTHROPIC_API_KEY!,
  defaultModel: 'claude-sonnet-4-20250514', // optional
  defaultMaxTokens: 1024, // optional
})
```

### OpenRouterProvider

Access to 100+ models (GPT-4o, Llama, Mixtral, Gemini, etc.) through OpenRouter.

```typescript
import { OpenRouterProvider } from '@sebastientang/llm-council'

const provider = new OpenRouterProvider({
  apiKey: process.env.OPENROUTER_API_KEY!,
  defaultModel: 'openai/gpt-4o', // optional
  appName: 'my-app', // optional, shown in OpenRouter dashboard
})
```

## Architecture

```
Council
├── Provider (LLM API)       → AnthropicProvider, OpenRouterProvider
├── Protocol (rounds)        → AdversarialProtocol, PeerReviewProtocol
└── Synthesizer (final call) → DialecticalSynthesizer, ChairmanSynthesizer
```

Three extension points — implement the interface and plug in:

| Component | Interface | Built-in |
|-----------|-----------|----------|
| **Provider** | `LLMProvider` | `AnthropicProvider`, `OpenRouterProvider` |
| **Protocol** | `Protocol` | `AdversarialProtocol`, `PeerReviewProtocol` |
| **Synthesizer** | `Synthesizer` | `DialecticalSynthesizer`, `ChairmanSynthesizer` |

## Events

Track progress during deliberation:

```typescript
council.on('round:start', ({ round, participantCount }) => {
  console.log(`Round ${round} starting with ${participantCount} participants`)
})

council.on('response', (message) => {
  console.log(`${message.participantName} responded (${message.tokenCount.output} tokens)`)
})

council.on('response:token', (chunk) => {
  // Token-by-token streaming: { participantId, content, done }
  process.stdout.write(chunk.content)
})

council.on('synthesis:start', () => console.log('Synthesizing...'))
council.on('complete', (result) => console.log(`Done in ${result.metadata.durationMs}ms`))
council.on('error', (err) => console.error(err))
```

## Custom Personas

Use the built-in presets or define your own:

```typescript
import { PERSONAS, type PersonaPreset } from '@sebastientang/llm-council'

// Built-in: proposer, challenger, steelmanner, preMortem
const participant = {
  ...PERSONAS.proposer,
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
}

// Custom persona
const financialAnalyst = {
  id: 'financial-analyst',
  name: 'Financial Analyst',
  provider: 'anthropic',
  model: 'claude-sonnet-4-20250514',
  systemPrompt: 'You are a financial analyst. Evaluate decisions through ROI, cash flow, and opportunity cost. Always quantify.',
  temperature: 0.5,
}
```

## Token Budget

Control costs with per-response and total token limits:

```typescript
const result = await council.deliberate({
  // ...
  tokenBudget: {
    perResponse: 512,  // max tokens per participant response
    total: 8000,       // tracked in metadata (not enforced)
  },
})

console.log(result.metadata.totalTokens)
// { input: 4200, output: 2800 }

console.log(result.metadata.modelBreakdown)
// { "anthropic/claude-sonnet-4-20250514": { input: 4200, output: 2800 } }
```

## API Reference

### `Council`

| Method | Description |
|--------|-------------|
| `deliberate(config)` | Run a full deliberation, returns `DeliberationResult` |
| `on(event, handler)` | Subscribe to events |
| `off(event, handler)` | Unsubscribe from events |

### `DeliberationConfig`

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `topic` | `string` | Yes | The decision or question |
| `options` | `string[]` | No | Explicit options to evaluate |
| `preferredOption` | `string` | No | Which way you're leaning |
| `context` | `string` | No | Background, constraints |
| `participants` | `Participant[]` | Yes | Min 2 participants |
| `rounds` | `number` | No | 1-5, default 2 |
| `tokenBudget` | `object` | No | Cost controls |

### `Synthesis`

| Field | Type | Description |
|-------|------|-------------|
| `recommendation` | `string` | The synthesized recommendation |
| `confidence` | `number` | 0-100 confidence score |
| `reasoning` | `string` | Why this recommendation |
| `risks` | `string[]` | Top risks to monitor |
| `dissent` | `string[]` | Counter-arguments that survived |
| `validationGates` | `string[]` | Measurable checkpoints |
| `assumptions` | `string[]` | What must hold true |
| `raw` | `string` | Raw synthesis output |

## Inspired By

- [karpathy/llm-council](https://github.com/karpathy/llm-council) — Multi-model deliberation concept
- Dialectical Inquiry (Mason 1969) — Thesis tested by antithesis
- Pre-Mortem (Klein 2007) — Assume failure, backcast to causes

## License

MIT
