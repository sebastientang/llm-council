import type {
  CompletionRequest,
  CompletionResponse,
  LLMProvider,
} from '../src/types'

export class MockProvider implements LLMProvider {
  id = 'mock'
  private responses: Map<string, string> = new Map()
  private defaultResponse: string
  calls: CompletionRequest[] = []

  constructor(defaultResponse = 'Mock response') {
    this.defaultResponse = defaultResponse
  }

  setResponse(participantSubstring: string, response: string): void {
    this.responses.set(participantSubstring, response)
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.calls.push(request)

    let content = this.defaultResponse
    for (const [key, response] of this.responses) {
      if (request.systemPrompt.toLowerCase().includes(key.toLowerCase())) {
        content = response
        break
      }
    }

    return {
      content,
      tokenCount: { input: 100, output: 50 },
      model: request.model,
    }
  }
}

export function makeParticipants(
  provider = 'mock',
  model = 'test-model',
) {
  return [
    {
      id: 'proposer',
      name: 'Proposer',
      provider,
      model,
      systemPrompt: 'You are the Proposer. Build the case FOR.',
      temperature: 0.7,
    },
    {
      id: 'challenger',
      name: 'Challenger',
      provider,
      model,
      systemPrompt: 'You are the Challenger. Attack the preferred option.',
      temperature: 0.7,
    },
    {
      id: 'steelmanner',
      name: 'Steelmanner',
      provider,
      model,
      systemPrompt: 'You are the Steelmanner. Advocate for the rejected option.',
      temperature: 0.7,
    },
    {
      id: 'pre-mortem',
      name: 'Pre-Mortem',
      provider,
      model,
      systemPrompt: 'You are the Pre-Mortem. Narrate the failure story.',
      temperature: 0.7,
    },
  ]
}

export const MOCK_SYNTHESIS_RESPONSE = `RECOMMENDATION: Accept the 600/day contract
CONFIDENCE: 75
REASONING: The council majority favors the higher rate given the strong market position. The challenger raised valid concerns about timeline risk but these are mitigable with the proposed validation gates.
RISKS:
- Client may reduce scope to fit the higher budget
- Competitor undercutting at 500/day
- Timeline pressure from delayed start
DISSENT:
- The steelmanner made a compelling case that 500/day with guaranteed 6-month duration provides more total revenue and stability
VALIDATION_GATES:
- Client confirms budget within 5 business days
- Contract signed within 2 weeks of verbal agreement
ASSUMPTIONS:
- Client has budget authority for 600/day
- No competing candidates at lower rates
- Scope remains as discussed`
