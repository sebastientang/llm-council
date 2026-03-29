// Core engine
export { Council, type CouncilOptions } from './engine.js'

// Types
export type {
  CompletionRequest,
  CompletionResponse,
  CouncilEvents,
  DeliberationConfig,
  DeliberationMessage,
  DeliberationMetadata,
  DeliberationResult,
  LLMProvider,
  Participant,
  Protocol,
  PromptRequest,
  StreamChunk,
  Synthesis,
  Synthesizer,
} from './types.js'

// Zod schemas
export {
  DeliberationConfigSchema,
  DeliberationMessageSchema,
  DeliberationMetadataSchema,
  ParticipantSchema,
  SynthesisSchema,
} from './types.js'

// Providers
export { AnthropicProvider, OpenRouterProvider } from './providers/index.js'

// Protocols
export { AdversarialProtocol, PeerReviewProtocol } from './protocols/index.js'

// Synthesizers
export { ChairmanSynthesizer, DialecticalSynthesizer } from './synthesis/index.js'

// Personas
export { PERSONAS, type PersonaId, type PersonaPreset, PersonaPresetSchema } from './personas/index.js'

// Utils
export {
  anonymizeMessages,
  createAnonymizationMap,
  deanonymizeLabel,
  type AnonymizationMap,
} from './utils/anonymizer.js'
export { buildInitialUserMessage } from './utils/prompt-builder.js'
export {
  buildSynthesisUserMessage,
  parseSynthesisResponse,
} from './utils/synthesis-parser.js'
