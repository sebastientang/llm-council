import { describe, expect, it } from 'vitest'
import { Council } from '../src/engine'
import { AdversarialProtocol } from '../src/protocols/adversarial'
import { DialecticalSynthesizer } from '../src/synthesis/dialectical'
import type {
  CompletionRequest,
  CompletionResponse,
  LLMProvider,
  StreamChunk,
} from '../src/types'
import { makeParticipants, MOCK_SYNTHESIS_RESPONSE } from './helpers'

class MockStreamingProvider implements LLMProvider {
  id = 'mock-streaming'
  calls: CompletionRequest[] = []
  private defaultResponse: string

  constructor(defaultResponse = 'Mock streaming response') {
    this.defaultResponse = defaultResponse
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    this.calls.push(request)
    return {
      content: this.defaultResponse,
      tokenCount: { input: 100, output: 50 },
      model: request.model,
    }
  }

  async *completeStream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    this.calls.push(request)
    const words = this.defaultResponse.split(' ')

    for (const word of words) {
      yield {
        participantId: '',
        content: word + ' ',
        done: false,
      }
    }

    yield {
      participantId: '',
      content: '',
      done: true,
      tokenCount: { input: 100, output: 50 },
    }
  }
}

describe('Streaming', () => {
  it('emits response:token events when provider supports streaming', async () => {
    const provider = new MockStreamingProvider('Hello world from stream')
    const synthProvider = new MockStreamingProvider(MOCK_SYNTHESIS_RESPONSE)

    const council = new Council({
      providers: new Map([
        ['mock-streaming', provider],
        ['mock-synth', synthProvider],
      ]),
      protocol: new AdversarialProtocol(),
      synthesizer: new DialecticalSynthesizer(),
      synthesisProvider: { providerId: 'mock-synth', model: 'test-model' },
    })

    const tokens: StreamChunk[] = []
    council.on('response:token', (chunk) => tokens.push(chunk))

    const result = await council.deliberate({
      topic: 'Test streaming',
      preferredOption: 'Option A',
      options: ['Option A', 'Option B'],
      participants: makeParticipants('mock-streaming', 'test-model'),
      rounds: 2,
    })

    expect(tokens.length).toBeGreaterThan(0)
    // Each participant streams tokens — 4 participants per round, 2 rounds = 8 responses
    // Each response has 4 words + 1 done chunk, so tokens should have 4 words x 8 = 32 token chunks
    const contentTokens = tokens.filter((t) => !t.done)
    expect(contentTokens.length).toBe(32)

    // Verify participantId is set correctly (engine patches it)
    const participantIds = new Set(tokens.map((t) => t.participantId))
    expect(participantIds).toContain('proposer')
    expect(participantIds).toContain('challenger')
    expect(participantIds).toContain('steelmanner')
    expect(participantIds).toContain('pre-mortem')

    // Full response event still fires with accumulated content
    expect(result.messages).toHaveLength(8) // 4 participants x 2 rounds
    for (const msg of result.messages) {
      expect(msg.content).toBe('Hello world from stream ')
    }
  })

  it('falls back to non-streaming when completeStream is not available', async () => {
    // MockProvider from helpers does NOT have completeStream
    const { MockProvider } = await import('./helpers')
    const provider = new MockProvider('Non-streaming response')

    const synthProvider = new MockProvider(MOCK_SYNTHESIS_RESPONSE)

    const council = new Council({
      providers: new Map([
        ['mock', provider],
        ['mock-synth', synthProvider],
      ]),
      protocol: new AdversarialProtocol(),
      synthesizer: new DialecticalSynthesizer(),
      synthesisProvider: { providerId: 'mock-synth', model: 'test-model' },
    })

    const tokens: StreamChunk[] = []
    council.on('response:token', (chunk) => tokens.push(chunk))

    const result = await council.deliberate({
      topic: 'Test non-streaming fallback',
      preferredOption: 'Option A',
      options: ['Option A', 'Option B'],
      participants: makeParticipants('mock', 'test-model'),
      rounds: 2,
    })

    // No streaming tokens emitted
    expect(tokens).toHaveLength(0)

    // But responses are still complete
    expect(result.messages).toHaveLength(8)
    for (const msg of result.messages) {
      expect(msg.content).toBe('Non-streaming response')
    }
  })

  it('preserves token counts from streaming', async () => {
    const provider = new MockStreamingProvider('Test tokens')
    const synthProvider = new MockStreamingProvider(MOCK_SYNTHESIS_RESPONSE)

    const council = new Council({
      providers: new Map([
        ['mock-streaming', provider],
        ['mock-synth', synthProvider],
      ]),
      protocol: new AdversarialProtocol(),
      synthesizer: new DialecticalSynthesizer(),
      synthesisProvider: { providerId: 'mock-synth', model: 'test-model' },
    })

    const result = await council.deliberate({
      topic: 'Token count test',
      preferredOption: 'A',
      options: ['A', 'B'],
      participants: makeParticipants('mock-streaming', 'test-model'),
      rounds: 1,
    })

    // 4 participants x 1 round, each with 100 input + 50 output
    expect(result.metadata.totalTokens.input).toBeGreaterThanOrEqual(400)
    expect(result.metadata.totalTokens.output).toBeGreaterThanOrEqual(200)

    // Each message has correct token count
    for (const msg of result.messages) {
      expect(msg.tokenCount).toEqual({ input: 100, output: 50 })
    }
  })
})
