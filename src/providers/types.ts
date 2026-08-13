export type ProviderId = 'anthropic' | 'openai';

export interface ProviderConfig {
  apiKey: string;
  baseUrl: string;
  model: string;
  maxTokens: number;
}

export interface ChatImage {
  mediaType: string;
  data: string;
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  images?: ChatImage[];
}

export interface Usage {
  inputTokens?: number;
  outputTokens?: number;
}

export interface ToolSpec {
  name: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolCallOutcome {
  approved: boolean;
  result: string;
  isError: boolean;
}

export interface ChatOptions {
  systemPrompt?: string;
  tools?: ToolSpec[];
}

export interface ChatCallbacks {
  onThinkingDelta: (delta: string) => void;
  onTextDelta: (delta: string) => void;
  onToolCall: (request: ToolCallRequest) => Promise<ToolCallOutcome>;
  onDone: (usage?: Usage) => void;
  onError: (error: Error) => void;
}

export function normalizeBaseUrl(base: string): string {
  return base.replace(/\/+$/, '');
}

export const MAX_TOOL_ROUNDS = 8;
