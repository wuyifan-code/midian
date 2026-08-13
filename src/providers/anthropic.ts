import { fetchPost, requestUrlPost, streamResponseText } from '../network/http';
import { createSseParser } from '../network/sse';
import type {
  ChatCallbacks,
  ChatMessage,
  ChatOptions,
  ProviderConfig,
  ToolCallOutcome,
  ToolSpec,
  Usage,
} from './types';
import { MAX_TOOL_ROUNDS, normalizeBaseUrl } from './types';

const API_VERSION = '2023-06-01';

interface AnthropicToolUseBlock {
  type: 'tool_use';
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface AnthropicTextBlock {
  type: 'text';
  text: string;
}

type AnthropicTurnBlock = AnthropicTextBlock | AnthropicToolUseBlock;

interface PendingTool {
  id: string;
  name: string;
  input: Record<string, unknown>;
}

interface StreamParseState {
  turnText: string;
  pendingTools: PendingTool[];
  inputTokens?: number;
  outputTokens?: number;
}

export async function runAnthropicChat(
  config: ProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions,
  callbacks: ChatCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const url = `${normalizeBaseUrl(config.baseUrl)}/v1/messages`;
  const headers = {
    'x-api-key': config.apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true',
  };
  const baseBody: Record<string, unknown> = {
    model: config.model,
    max_tokens: config.maxTokens,
    ...(options.systemPrompt ? { system: options.systemPrompt } : {}),
    ...(options.tools && options.tools.length > 0 ? { tools: toAnthropicTools(options.tools) } : {}),
  };

  try {
    await runStreamingLoop(url, headers, baseBody, messages, callbacks, signal);
  } catch (error) {
    if (signal.aborted) {
      callbacks.onDone();
      return;
    }
    await runNonStreamingLoop(url, headers, baseBody, messages, callbacks, error);
  }
}

async function runStreamingLoop(
  url: string,
  headers: Record<string, string>,
  baseBody: Record<string, unknown>,
  messages: ChatMessage[],
  callbacks: ChatCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const history: AnthropicTurnBlock[][] = [];
  const baseMessages = messages.map((m) => ({ role: m.role, content: toAnthropicContent(m) }));
  let toolResults: Record<string, unknown>[] = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const streamBody = {
      ...baseBody,
      stream: true,
      messages: [
        ...baseMessages,
        ...history.map((blocks) => ({ role: 'assistant', content: blocks })),
        ...(toolResults.length > 0 ? [{ role: 'user', content: toolResults }] : []),
      ],
    };

    const response = await fetchPost({ url, headers, body: streamBody }, signal);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`Anthropic HTTP ${response.status}: ${detail.slice(0, 500)}`);
    }

    const state: StreamParseState = { turnText: '', pendingTools: [] };
    let currentToolJson = '';

    const parser = createSseParser((ev) => {
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(ev.data) as Record<string, unknown>;
      } catch {
        return;
      }
      switch (ev.event) {
        case 'message_start': {
          const message = payload.message as { usage?: { input_tokens?: number } } | undefined;
          state.inputTokens = message?.usage?.input_tokens;
          break;
        }
        case 'content_block_start': {
          const block = payload.content_block as { type?: string; id?: string; name?: string } | undefined;
          if (block?.type === 'tool_use' && typeof block.id === 'string') {
            currentToolJson = '';
            state.pendingTools.push({
              id: block.id,
              name: block.name ?? '',
              input: {},
            });
          }
          break;
        }
        case 'content_block_delta': {
          const delta = payload.delta as
            | { type?: string; thinking?: string; text?: string; partial_json?: string }
            | undefined;
          if (!delta) {
            break;
          }
          if (delta.type === 'thinking_delta' && delta.thinking) {
            callbacks.onThinkingDelta(delta.thinking);
          } else if (delta.type === 'text_delta' && delta.text) {
            state.turnText += delta.text;
            callbacks.onTextDelta(delta.text);
          } else if (delta.type === 'input_json_delta' && delta.partial_json) {
            currentToolJson += delta.partial_json;
          }
          break;
        }
        case 'content_block_stop': {
          if (state.pendingTools.length > 0 && currentToolJson.length > 0) {
            const last = state.pendingTools[state.pendingTools.length - 1];
            try {
              last.input = JSON.parse(currentToolJson) as Record<string, unknown>;
            } catch {
              last.input = {};
            }
            currentToolJson = '';
          }
          break;
        }
        case 'message_delta': {
          const usage = payload.usage as { output_tokens?: number } | undefined;
          state.outputTokens = usage?.output_tokens;
          break;
        }
        case 'error': {
          const error = payload.error as { message?: string } | undefined;
          throw new Error(error?.message ?? 'Anthropic stream error');
        }
      }
    });

    await streamResponseText(response, (chunk) => parser.feed(chunk));
    parser.finish();

    const turnBlocks: AnthropicTurnBlock[] = [
      ...(state.turnText.length > 0 ? [{ type: 'text' as const, text: state.turnText }] : []),
      ...state.pendingTools.map(
        (tool): AnthropicToolUseBlock => ({ type: 'tool_use', id: tool.id, name: tool.name, input: tool.input }),
      ),
    ];
    if (turnBlocks.length > 0) {
      history.push(turnBlocks);
    }

    if (state.pendingTools.length === 0) {
      callbacks.onDone({ inputTokens: state.inputTokens, outputTokens: state.outputTokens });
      return;
    }

    const results = await executeTools(state.pendingTools, callbacks);
    toolResults = results;
  }
  callbacks.onDone();
}

async function runNonStreamingLoop(
  url: string,
  headers: Record<string, string>,
  baseBody: Record<string, unknown>,
  messages: ChatMessage[],
  callbacks: ChatCallbacks,
  originalError: unknown,
): Promise<void> {
  const history: AnthropicTurnBlock[][] = [];
  const baseMessages = messages.map((m) => ({ role: m.role, content: toAnthropicContent(m) }));
  let toolResults: Record<string, unknown>[] = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const body = {
        ...baseBody,
        stream: false,
        messages: [
          ...baseMessages,
          ...history.map((blocks) => ({ role: 'assistant', content: blocks })),
          ...(toolResults.length > 0 ? [{ role: 'user', content: toolResults }] : []),
        ],
      };
      const text = await requestUrlPost({ url, headers, body });
      const data = JSON.parse(text) as {
        content?: Array<{
          type?: string;
          text?: string;
          thinking?: string;
          id?: string;
          name?: string;
          input?: Record<string, unknown>;
        }>;
        usage?: { input_tokens?: number; output_tokens?: number };
      };

      const turnBlocks: AnthropicTurnBlock[] = [];
      const pendingTools: PendingTool[] = [];
      for (const block of data.content ?? []) {
        if (block.type === 'thinking' && block.thinking) {
          callbacks.onThinkingDelta(block.thinking);
        } else if (block.type === 'text' && block.text) {
          callbacks.onTextDelta(block.text);
          turnBlocks.push({ type: 'text', text: block.text });
        } else if (block.type === 'tool_use' && block.id) {
          turnBlocks.push({ type: 'tool_use', id: block.id, name: block.name ?? '', input: block.input ?? {} });
          pendingTools.push({ id: block.id, name: block.name ?? '', input: block.input ?? {} });
        }
      }
      if (turnBlocks.length > 0) {
        history.push(turnBlocks);
      }
      if (pendingTools.length === 0) {
        callbacks.onDone({
          inputTokens: data.usage?.input_tokens,
          outputTokens: data.usage?.output_tokens,
        });
        return;
      }
      toolResults = await executeTools(pendingTools, callbacks);
    }
    callbacks.onDone();
  } catch (fallbackError) {
    const err = fallbackError instanceof Error ? fallbackError : new Error(String(fallbackError));
    if (err.message.length === 0) {
      callbacks.onError(originalError instanceof Error ? originalError : new Error(String(originalError)));
      return;
    }
    callbacks.onError(err);
  }
}

async function executeTools(
  pendingTools: PendingTool[],
  callbacks: ChatCallbacks,
): Promise<Record<string, unknown>[]> {
  const results: Record<string, unknown>[] = [];
  for (const tool of pendingTools) {
    const outcome: ToolCallOutcome = await callbacks.onToolCall({
      id: tool.id,
      name: tool.name,
      arguments: tool.input,
    });
    results.push({
      type: 'tool_result',
      tool_use_id: tool.id,
      content: outcome.approved ? outcome.result : 'The user denied this tool call.',
      is_error: outcome.approved ? outcome.isError : true,
    });
  }
  return results;
}

function toAnthropicTools(tools: ToolSpec[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    name: tool.name,
    description: tool.description,
    input_schema: tool.inputSchema,
  }));
}

function toAnthropicContent(message: ChatMessage): string | Array<Record<string, unknown>> {
  if (!message.images || message.images.length === 0) {
    return message.content;
  }
  return [
    ...message.images.map((image) => ({
      type: 'image',
      source: { type: 'base64', media_type: image.mediaType, data: image.data },
    })),
    { type: 'text', text: message.content },
  ];
}
