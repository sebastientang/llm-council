import Anthropic from '@anthropic-ai/sdk'
import type {
  CompletionRequest,
  CompletionResponse,
  LLMProvider,
  StreamChunk,
} from '../types.js'

interface AnthropicProviderConfig {
  apiKey: string
  defaultModel?: string
  defaultMaxTokens?: number
}

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic' as const
  private client: Anthropic
  private defaultModel: string
  private defaultMaxTokens: number

  constructor(config: AnthropicProviderConfig) {
    this.client = new Anthropic({ apiKey: config.apiKey })
    this.defaultModel = config.defaultModel ?? 'claude-sonnet-4-20250514'
    this.defaultMaxTokens = config.defaultMaxTokens ?? 1024
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const params: Anthropic.MessageCreateParamsNonStreaming = {
      model: request.model || this.defaultModel,
      max_tokens: request.maxTokens ?? this.defaultMaxTokens,
      system: request.systemPrompt,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      ...(request.temperature !== undefined && {
        temperature: request.temperature,
      }),
    }

    let response: Anthropic.Message
    try {
      response = await this.client.messages.create(params)
    } catch (error: unknown) {
      if (isOverloadedError(error)) {
        await delay(1000)
        response = await this.client.messages.create(params)
      } else {
        throw error
      }
    }

    const textBlock = response.content.find(
      (block): block is Anthropic.TextBlock => block.type === 'text',
    )

    if (!textBlock) {
      throw new Error(
        `Anthropic response contained no text block. Stop reason: ${response.stop_reason}`,
      )
    }

    return {
      content: textBlock.text,
      tokenCount: {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      },
      model: response.model,
    }
  }

  async *completeStream(request: CompletionRequest): AsyncIterable<StreamChunk> {
    const params: Anthropic.MessageCreateParams = {
      model: request.model || this.defaultModel,
      max_tokens: request.maxTokens ?? this.defaultMaxTokens,
      system: request.systemPrompt,
      messages: request.messages.map((msg) => ({
        role: msg.role,
        content: msg.content,
      })),
      ...(request.temperature !== undefined && {
        temperature: request.temperature,
      }),
    }

    let stream: ReturnType<typeof this.client.messages.stream>
    try {
      stream = this.client.messages.stream(params)
    } catch (error: unknown) {
      if (isOverloadedError(error)) {
        await delay(1000)
        stream = this.client.messages.stream(params)
      } else {
        throw error
      }
    }

    for await (const event of stream) {
      if (
        event.type === 'content_block_delta' &&
        event.delta.type === 'text_delta'
      ) {
        yield {
          participantId: '',
          content: event.delta.text,
          done: false,
        }
      }
    }

    const finalMessage = await stream.finalMessage()
    yield {
      participantId: '',
      content: '',
      done: true,
      tokenCount: {
        input: finalMessage.usage.input_tokens,
        output: finalMessage.usage.output_tokens,
      },
    }
  }
}

function isOverloadedError(error: unknown): boolean {
  if (error instanceof Anthropic.APIError) {
    return error.status === 529
  }
  return false
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
