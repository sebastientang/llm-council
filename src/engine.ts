import mitt from 'mitt'
import type {
  CompletionRequest,
  CouncilEvents,
  DeliberationConfig,
  DeliberationMessage,
  DeliberationMetadata,
  DeliberationResult,
  LLMProvider,
  Protocol,
  StreamChunk,
  Synthesizer,
} from './types.js'
import { DeliberationConfigSchema } from './types.js'

export interface CouncilOptions {
  providers: Map<string, LLMProvider>
  protocol: Protocol
  synthesizer: Synthesizer
  synthesisProvider?: { providerId: string; model: string }
}

export class Council {
  private providers: Map<string, LLMProvider>
  private protocol: Protocol
  private synthesizer: Synthesizer
  private synthesisProvider: { providerId: string; model: string } | undefined
  private emitter = mitt<CouncilEvents>()

  constructor(options: CouncilOptions) {
    this.providers = options.providers
    this.protocol = options.protocol
    this.synthesizer = options.synthesizer
    this.synthesisProvider = options.synthesisProvider
  }

  on<K extends keyof CouncilEvents>(
    event: K,
    handler: (payload: CouncilEvents[K]) => void,
  ): void {
    this.emitter.on(event, handler)
  }

  off<K extends keyof CouncilEvents>(
    event: K,
    handler: (payload: CouncilEvents[K]) => void,
  ): void {
    this.emitter.off(event, handler)
  }

  async deliberate(rawConfig: DeliberationConfig): Promise<DeliberationResult> {
    try {
      const config = DeliberationConfigSchema.parse(rawConfig)
      const startTime = Date.now()
      const allMessages: DeliberationMessage[] = []
      const tokenTracker: Record<
        string,
        { input: number; output: number }
      > = {}

      const roundCount = this.protocol.getRoundCount()
      const rounds = Math.min(config.rounds, roundCount)

      for (let round = 1; round <= rounds; round++) {
        const prompts = this.protocol.buildPrompts(config, allMessages, round)

        this.emitter.emit('round:start', {
          round,
          participantCount: prompts.length,
        })

        const roundMessages = await Promise.all(
          prompts.map(async (prompt) => {
            const provider = this.providers.get(prompt.provider)
            if (!provider) {
              throw new Error(
                `Provider '${prompt.provider}' not found. Available: ${[...this.providers.keys()].join(', ')}`,
              )
            }

            const completionRequest: CompletionRequest = {
              model: prompt.model,
              systemPrompt: prompt.systemPrompt,
              messages: [{ role: 'user', content: prompt.userMessage }],
              temperature: prompt.temperature,
              maxTokens: prompt.maxTokens,
            }

            let content: string
            let responseTokenCount: { input: number; output: number }

            if (typeof provider.completeStream === 'function') {
              content = ''
              responseTokenCount = { input: 0, output: 0 }
              for await (const chunk of provider.completeStream(completionRequest)) {
                if (!chunk.done) {
                  this.emitter.emit('response:token', {
                    ...chunk,
                    participantId: prompt.participantId,
                  })
                  content += chunk.content
                } else if (chunk.tokenCount) {
                  responseTokenCount = chunk.tokenCount
                }
              }
            } else {
              const response = await provider.complete(completionRequest)
              content = response.content
              responseTokenCount = response.tokenCount
            }

            const participant = config.participants.find(
              (p) => p.id === prompt.participantId,
            )

            const message: DeliberationMessage = {
              participantId: prompt.participantId,
              participantName: participant?.name ?? prompt.participantId,
              round,
              content,
              timestamp: new Date(),
              tokenCount: responseTokenCount,
            }

            // Track tokens per model
            const modelKey = `${prompt.provider}/${prompt.model}`
            const existing = tokenTracker[modelKey] ?? { input: 0, output: 0 }
            tokenTracker[modelKey] = {
              input: existing.input + responseTokenCount.input,
              output: existing.output + responseTokenCount.output,
            }

            this.emitter.emit('response', message)
            return message
          }),
        )

        allMessages.push(...roundMessages)
      }

      // Synthesis
      this.emitter.emit('synthesis:start', undefined)

      const synthesisProviderConfig = this.synthesisProvider ?? {
        providerId: config.participants[0].provider,
        model: config.participants[0].model,
      }

      const provider = this.providers.get(synthesisProviderConfig.providerId)
      if (!provider) {
        throw new Error(
          `Synthesis provider '${synthesisProviderConfig.providerId}' not found`,
        )
      }

      const synthesis = await this.synthesizer.synthesize(
        config,
        allMessages,
        provider,
      )

      const durationMs = Date.now() - startTime
      const totalTokens = Object.values(tokenTracker).reduce(
        (acc, t) => ({
          input: acc.input + t.input,
          output: acc.output + t.output,
        }),
        { input: 0, output: 0 },
      )

      const metadata: DeliberationMetadata = {
        totalTokens,
        durationMs,
        modelBreakdown: tokenTracker,
      }

      const result: DeliberationResult = {
        config,
        messages: allMessages,
        synthesis,
        metadata,
      }

      this.emitter.emit('complete', result)
      return result
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error))
      this.emitter.emit('error', err)
      throw err
    }
  }
}
