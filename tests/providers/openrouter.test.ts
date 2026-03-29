import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { OpenRouterProvider } from '../../src/providers/openrouter'

function mockResponse(status: number, body: unknown, headers?: Record<string, string>) {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get: (name: string) => headers?.[name] ?? null,
    },
    json: () => Promise.resolve(body),
  } as unknown as Response
}

const VALID_RESPONSE = {
  choices: [{ message: { content: 'Test response' } }],
  usage: { prompt_tokens: 50, completion_tokens: 25 },
  model: 'openai/gpt-4o',
}

describe('OpenRouterProvider', () => {
  let fetchSpy: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    fetchSpy = vi.spyOn(globalThis, 'fetch')
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('has correct id', () => {
    const provider = new OpenRouterProvider({ apiKey: 'test' })
    expect(provider.id).toBe('openrouter')
  })

  it('constructs with required config only', () => {
    const provider = new OpenRouterProvider({ apiKey: 'test-key' })
    expect(provider).toBeDefined()
  })

  it('maps CompletionRequest to OpenRouter format', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, VALID_RESPONSE))

    const provider = new OpenRouterProvider({
      apiKey: 'test-key',
      appName: 'test-app',
      siteUrl: 'https://example.com',
    })

    await provider.complete({
      model: 'openai/gpt-4o',
      systemPrompt: 'You are a test.',
      messages: [{ role: 'user', content: 'Hello' }],
      temperature: 0.5,
      maxTokens: 512,
    })

    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, options] = fetchSpy.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/chat/completions')

    const body = JSON.parse((options as RequestInit).body as string)
    expect(body.model).toBe('openai/gpt-4o')
    expect(body.messages[0]).toEqual({ role: 'system', content: 'You are a test.' })
    expect(body.messages[1]).toEqual({ role: 'user', content: 'Hello' })
    expect(body.temperature).toBe(0.5)
    expect(body.max_tokens).toBe(512)

    const headers = (options as RequestInit).headers as Record<string, string>
    expect(headers['Authorization']).toBe('Bearer test-key')
    expect(headers['X-Title']).toBe('test-app')
    expect(headers['HTTP-Referer']).toBe('https://example.com')
  })

  it('parses successful response', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, VALID_RESPONSE))

    const provider = new OpenRouterProvider({ apiKey: 'test-key' })
    const result = await provider.complete({
      model: 'openai/gpt-4o',
      systemPrompt: 'Test',
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(result.content).toBe('Test response')
    expect(result.tokenCount).toEqual({ input: 50, output: 25 })
    expect(result.model).toBe('openai/gpt-4o')
  })

  it('uses default model when not specified in request', async () => {
    fetchSpy.mockResolvedValueOnce(mockResponse(200, VALID_RESPONSE))

    const provider = new OpenRouterProvider({
      apiKey: 'test-key',
      defaultModel: 'meta-llama/llama-3-70b',
    })

    await provider.complete({
      model: '',
      systemPrompt: 'Test',
      messages: [{ role: 'user', content: 'Hi' }],
    })

    const body = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string)
    expect(body.model).toBe('meta-llama/llama-3-70b')
  })

  it('throws on non-OK response', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(400, { error: { message: 'Bad request' } }),
    )

    const provider = new OpenRouterProvider({ apiKey: 'test-key' })

    await expect(
      provider.complete({
        model: 'openai/gpt-4o',
        systemPrompt: 'Test',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toThrow('OpenRouter API error (400): Bad request')
  })

  it('retries on 429 then succeeds', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        mockResponse(429, { error: { message: 'Rate limited' } }, { 'Retry-After': '1' }),
      )
      .mockResolvedValueOnce(mockResponse(200, VALID_RESPONSE))

    const provider = new OpenRouterProvider({ apiKey: 'test-key' })
    const result = await provider.complete({
      model: 'openai/gpt-4o',
      systemPrompt: 'Test',
      messages: [{ role: 'user', content: 'Hi' }],
    })

    expect(fetchSpy).toHaveBeenCalledTimes(2)
    expect(result.content).toBe('Test response')
  })

  it('throws when response has no content', async () => {
    fetchSpy.mockResolvedValueOnce(
      mockResponse(200, { choices: [{ message: { content: '' } }], usage: { prompt_tokens: 0, completion_tokens: 0 }, model: 'test' }),
    )

    const provider = new OpenRouterProvider({ apiKey: 'test-key' })

    await expect(
      provider.complete({
        model: 'openai/gpt-4o',
        systemPrompt: 'Test',
        messages: [{ role: 'user', content: 'Hi' }],
      }),
    ).rejects.toThrow('OpenRouter response contained no content')
  })
})
