import type {
  DeliberationConfig,
  DeliberationMessage,
  LLMProvider,
  Synthesis,
  Synthesizer,
} from '../types.js'
import {
  buildSynthesisUserMessage,
  parseSynthesisResponse,
} from '../utils/synthesis-parser.js'

interface DialecticalSynthesizerOptions {
  model?: string
  temperature?: number
}

const SYSTEM_PROMPT = `You are the Synthesis Moderator for a council deliberation. You have received briefs and rebuttals from multiple council members debating a decision. Your job is to:
1. Weigh evidence over opinion - arguments backed by specific data or precedent outweigh assertions
2. Favor reversibility when confidence is low - if the council is split, recommend the more reversible option
3. Synthesize, don't average - your recommendation should reflect the strongest arguments, not a compromise
4. Calibrate confidence honestly: 90%+ = unanimous agreement with strong evidence; 70-89% = majority with minor dissent; 50-69% = significant split or unknowns; <50% = fundamental disagreement, recommend gathering more data

Respond in EXACTLY this format (no deviations):

RECOMMENDATION: [one sentence]
CONFIDENCE: [number 0-100]
REASONING: [2-3 sentences explaining the recommendation]
RISKS:
- [risk 1]
- [risk 2]
- [risk 3]
DISSENT:
- [strongest counter-argument that survived debate]
VALIDATION_GATES:
- [gate 1 - measurable, time-bound]
- [gate 2]
ASSUMPTIONS:
- [assumption 1 that must hold]
- [assumption 2]`

export class DialecticalSynthesizer implements Synthesizer {
  private readonly model: string
  private readonly temperature: number

  constructor(options: DialecticalSynthesizerOptions = {}) {
    this.model = options.model ?? 'claude-sonnet-4-20250514'
    this.temperature = options.temperature ?? 0.3
  }

  async synthesize(
    config: DeliberationConfig,
    messages: DeliberationMessage[],
    provider: LLMProvider,
  ): Promise<Synthesis> {
    const userMessage = buildSynthesisUserMessage(config, messages)

    const response = await provider.complete({
      model: this.model,
      systemPrompt: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: userMessage }],
      temperature: this.temperature,
    })

    return parseSynthesisResponse(response.content)
  }
}
