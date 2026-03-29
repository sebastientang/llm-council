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

interface ChairmanSynthesizerOptions {
  model?: string
  temperature?: number
}

const SYSTEM_PROMPT = `You are the Chairman of a council deliberation. Your job is to evaluate the arguments presented and SELECT THE BEST ONE. Do not synthesize or merge arguments. Pick the winner.

Evaluation criteria:
1. Evidence quality - arguments backed by specific data, precedent, or measurable outcomes score highest
2. Risk awareness - the best argument acknowledges its own weaknesses honestly
3. Actionability - prefer arguments with clear, concrete next steps over abstract reasoning
4. Logical coherence - the argument's conclusion must follow from its premises

Your confidence score reflects how clear the winner is:
- 90%+ = one argument is clearly superior, others have significant flaws
- 70-89% = a clear winner exists but the runner-up has merit
- 50-69% = close race between two or more arguments
- <50% = no clear winner, recommend gathering more data

Respond in EXACTLY this format (no deviations):

RECOMMENDATION: [state which participant's argument wins and why in one sentence]
CONFIDENCE: [number 0-100]
REASONING: [2-3 sentences explaining why this argument won over the others]
RISKS:
- [risk 1 from the winning argument]
- [risk 2]
- [risk 3]
DISSENT:
- [the runner-up's strongest point that nearly won]
VALIDATION_GATES:
- [gate 1 - measurable, time-bound]
- [gate 2]
ASSUMPTIONS:
- [assumption 1 the winning argument depends on]
- [assumption 2]`

export class ChairmanSynthesizer implements Synthesizer {
  private readonly model: string
  private readonly temperature: number

  constructor(options: ChairmanSynthesizerOptions = {}) {
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
