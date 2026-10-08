/** A single binary file (e.g. a PDF) sent natively to a multimodal provider. */
export interface LlmExtractionFile {
  mimeType: string;
  data: Buffer;
}

/** Everything a provider client needs to extract reservations from one document. */
export interface LlmExtractionInput {
  /** System instructions enumerating the schema.org shape (see llm-prompt.ts). */
  prompt: string;
  /** JSON Schema describing `{ reservations: KiReservation[] }`. */
  jsonSchema: object;
  model: string;
  baseUrl?: string;
  apiKey?: string;
  /** Pre-extracted text (text-like files, or text-only-model mode). */
  text?: string;
  /** Native binary (PDF) for multimodal providers. */
  file?: LlmExtractionFile;
}

/**
 * A provider client turns one document into raw schema.org reservation objects.
 * It returns the parsed `reservations` array (best-effort: `[]` on a malformed or
 * empty response, never throwing for content reasons). The caller validates and
 * maps via the shared kitinerary mapper.
 */
export interface LlmExtractionClient {
  extract(input: LlmExtractionInput): Promise<Record<string, unknown>[]>;

  /**
   * Optional agentic-chat capability: one assistant turn with tool calls.
   * Implemented by clients whose API natively supports function/tool calling.
   * Absent (or throwing ToolsNotSupportedError) → the caller falls back to a
   * strict-JSON single-shot parsed with lenient-json.
   */
  chat?(input: LlmChatInput): Promise<LlmChatOutput>;
}

/** One message in a chat conversation. */
export interface LlmChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

/** A tool the model may call during the chat turn. */
export interface LlmChatTool {
  name: string;
  description: string;
  /** JSON Schema for the tool's arguments. */
  parameters: Record<string, unknown>;
}

/** A tool call the model emitted. */
export interface LlmToolCall {
  id: string;
  name: string;
  /** Parsed arguments object (best-effort; the caller validates). */
  arguments: unknown;
}

export interface LlmChatInput {
  model: string;
  baseUrl?: string;
  apiKey?: string;
  messages: LlmChatMessage[];
  tools: LlmChatTool[];
  maxTokens?: number;
}

export interface LlmChatOutput {
  /** Assistant text for this turn (may be empty when it only called tools). */
  content: string;
  toolCalls: LlmToolCall[];
}

/** Raised when the provider/server refuses the tools parameter outright. */
export class ToolsNotSupportedError extends Error {}
