import type {
  CompletionRequest,
  CompletionResponse,
  LLMProvider,
  StreamChunk,
} from '../types.js'

interface OpenRouterProviderConfig {
  apiKey: string
  appName?: string
  defaultModel?: string
  defaultMaxTokens?: number
  siteUrl?: string
}

interface OpenRouterChoice {
  message: { content: string }
}

interface OpenRouterUsage {
  prompt_tokens: number
  completion_tokens: number
}

interface OpenRouterResponse {
  choices: OpenRouterChoice[]
  usage: OpenRouterUsage
  model: string
}

interface OpenRouterError {
  error: { message: string; code?: number }
}

export class OpenRouterProvider implements LLMProvider {
  readonly id = 'openrouter' as const
  private readonly apiKey: string
  private readonly appName: string
  private readonly defaultModel: string
  private readonly defaultMaxTokens: number
  private readonly siteUrl: string

  constructor(config: OpenRouterProviderConfig) {
    this.apiKey = config.apiKey
    this.appName = config.appName ?? 'llm-council'
    this.defaultModel = config.defaultModel ?? 'openai/gpt-4o'
    this.defaultMaxTokens = config.defaultMaxTokens ?? 1024
    this.siteUrl = config.siteUrl ?? ''
  }

  private buildHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Authorization': `Bearer ${this.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': this.appName,
    }
    if (this.siteUrl) {
      headers['HTTP-Referer'] = this.siteUrl
    }
    return headers
  }

  private buildBody(request: CompletionRequest, stream = false) {
    return {
      model: request.model || this.defaultModel,
      messages: [
        { role: 'system' as const, content: request.systemPrompt },
        ...request.messages.map((msg) => ({
          role: msg.role as 'user' | 'assistant',
          content: msg.content,
        })),
      ],
      max_tokens: request.maxTokens ?? this.defaultMaxTokens,
      ...(stream && { stream: true }),
      ...(request.temperature !== undefined && {
        temperature: request.temperature,
      }),
    }
  }

  private async fetchWithRetry(
    headers: Record<string, string>,
    body: unknown,
  ): Promise<Response> {
    let response = await fetch(
      'https://openrouter.ai/api/v1/chat/completions',
      {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
      },
    )

    if (response.status === 429) {
      const retryAfter = response.headers.get('Retry-After')
      const delayMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : 2000
      await delay(Math.min(delayMs, 10000))
      response = await fetch(
        'https://openrouter.ai/api/v1/chat/completions',
        {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        },
      )
    }

    if (!response.ok) {
      const errorBody = (await response
        .json()
        .catch(() => null)) as OpenRouterError | null
      const message = errorBody?.error?.message ?? `HTTP ${response.status}`
      throw new Error(`OpenRouter API error (${response.status}): ${message}`)
    }

    return response
  }

  async complete(request: CompletionRequest): Promise<CompletionResponse> {
    const response = await this.fetchWithRetry(
      this.buildHeaders(),
      this.buildBody(request),
    )

    const data = (await response.json()) as OpenRouterResponse

    const content = data.choices?.[0]?.message?.content
    if (!content) {
      throw new Error('OpenRouter response contained no content')
    }

    return {
      content,
      tokenCount: {
        input: data.usage?.prompt_tokens ?? 0,
        output: data.usage?.completion_tokens ?? 0,
      },
      model: data.model,
    }
  }

  async *completeStream(
    request: CompletionRequest,
  ): AsyncIterable<StreamChunk> {
    const response = await this.fetchWithRetry(
      this.buildHeaders(),
      this.buildBody(request, true),
    )

    if (!response.body) {
      throw new Error('OpenRouter streaming response has no body')
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let usage = { prompt_tokens: 0, completion_tokens: 0 }

    try {
      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          const trimmed = line.trim()
          if (!trimmed || !trimmed.startsWith('data: ')) continue

          const data = trimmed.slice(6)
          if (data === '[DONE]') continue

          try {
            const parsed = JSON.parse(data) as {
              choices?: Array<{ delta?: { content?: string } }>
              usage?: OpenRouterUsage
            }

            if (parsed.usage) {
              usage = {
                prompt_tokens: parsed.usage.prompt_tokens ?? 0,
                completion_tokens: parsed.usage.completion_tokens ?? 0,
              }
            }

            const content = parsed.choices?.[0]?.delta?.content
            if (content) {
              yield {
                participantId: '',
                content,
                done: false,
              }
            }
          } catch {
            // Skip malformed JSON chunks
          }
        }
      }
    } finally {
      reader.releaseLock()
    }

    yield {
      participantId: '',
      content: '',
      done: true,
      tokenCount: {
        input: usage.prompt_tokens,
        output: usage.completion_tokens,
      },
    }
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms)
  })
}
