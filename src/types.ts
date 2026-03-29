import { z } from 'zod'

// --- Provider types ---

export interface CompletionRequest {
  model: string
  systemPrompt: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  temperature?: number
  maxTokens?: number
}

export interface CompletionResponse {
  content: string
  tokenCount: { input: number; output: number }
  model: string
}

export interface StreamChunk {
  participantId: string
  content: string
  done: boolean
  tokenCount?: { input: number; output: number }
}

export interface LLMProvider {
  id: string
  complete(request: CompletionRequest): Promise<CompletionResponse>
  completeStream?(request: CompletionRequest): AsyncIterable<StreamChunk>
}

// --- Participant types ---

export const ParticipantSchema = z.object({
  id: z.string(),
  name: z.string(),
  provider: z.string(),
  model: z.string(),
  systemPrompt: z.string(),
  temperature: z.number().min(0).max(2).optional(),
})

export type Participant = z.infer<typeof ParticipantSchema>

// --- Protocol types ---

export interface PromptRequest {
  participantId: string
  provider: string
  model: string
  systemPrompt: string
  userMessage: string
  temperature?: number
  maxTokens?: number
}

export interface Protocol {
  buildPrompts(
    config: DeliberationConfig,
    history: DeliberationMessage[],
    round: number,
  ): PromptRequest[]
  getRoundCount(): number
}

// --- Synthesizer types ---

export const SynthesisSchema = z.object({
  recommendation: z.string(),
  confidence: z.number().min(0).max(100),
  reasoning: z.string(),
  risks: z.array(z.string()),
  dissent: z.array(z.string()),
  validationGates: z.array(z.string()),
  assumptions: z.array(z.string()),
  raw: z.string(),
})

export type Synthesis = z.infer<typeof SynthesisSchema>

export interface Synthesizer {
  synthesize(
    config: DeliberationConfig,
    messages: DeliberationMessage[],
    provider: LLMProvider,
  ): Promise<Synthesis>
}

// --- Message types ---

export const DeliberationMessageSchema = z.object({
  participantId: z.string(),
  participantName: z.string(),
  round: z.number(),
  content: z.string(),
  timestamp: z.date(),
  tokenCount: z.object({ input: z.number(), output: z.number() }),
})

export type DeliberationMessage = z.infer<typeof DeliberationMessageSchema>

// --- Config types ---

export const DeliberationConfigSchema = z.object({
  topic: z.string().min(1),
  options: z.array(z.string()).optional(),
  context: z.string().optional(),
  preferredOption: z.string().optional(),
  participants: z.array(ParticipantSchema).min(2),
  rounds: z.number().min(1).max(5).default(2),
  tokenBudget: z
    .object({
      perResponse: z.number().positive().optional(),
      total: z.number().positive().optional(),
    })
    .optional(),
})

export type DeliberationConfig = z.infer<typeof DeliberationConfigSchema>

// --- Result types ---

export const DeliberationMetadataSchema = z.object({
  totalTokens: z.object({ input: z.number(), output: z.number() }),
  durationMs: z.number(),
  modelBreakdown: z.record(
    z.string(),
    z.object({ input: z.number(), output: z.number() }),
  ),
})

export type DeliberationMetadata = z.infer<typeof DeliberationMetadataSchema>

export interface DeliberationResult {
  config: DeliberationConfig
  messages: DeliberationMessage[]
  synthesis: Synthesis
  metadata: DeliberationMetadata
}

// --- Event types ---

export type CouncilEvents = {
  'round:start': { round: number; participantCount: number }
  'response:token': StreamChunk
  response: DeliberationMessage
  'synthesis:start': undefined
  'synthesis:token': { content: string }
  complete: DeliberationResult
  error: Error
}
