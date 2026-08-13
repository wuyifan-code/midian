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

interface AccumulatedToolCall {
  id: string;
  name: string;
  argsJson: string;
}

export async function runOpenAiChat(
  config: ProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions,
  callbacks: ChatCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const url = `${normalizeBaseUrl(config.baseUrl)}/chat/completions`;
  const headers = { Authorization: `Bearer ${config.apiKey}` };
  const baseMessages: Array<Record<string, unknown>> = [
    ...(options.systemPrompt ? [{ role: 'system', content: options.systemPrompt }] : []),
    ...messages.map((m) => ({ role: m.role, content: toOpenAiContent(m) })),
  ];
  const baseBody: Record<string, unknown> = {
    model: config.model,
    max_tokens: config.maxTokens,
    ...(options.tools && options.tools.length > 0 ? { tools: toOpenAiTools(options.tools) } : {}),
  };

  try {
    await runStreamingLoop(url, headers, baseBody, baseMessages, callbacks, signal);
  } catch (error) {
    if (signal.aborted) {
      callbacks.onDone();
      return;
    }
    await runNonStreamingLoop(url, headers, baseBody, baseMessages, callbacks, error);
  }
}

async function runStreamingLoop(
  url: string,
  headers: Record<string, string>,
  baseBody: Record<string, unknown>,
  baseMessages: Array<Record<string, unknown>>,
  callbacks: ChatCallbacks,
  signal: AbortSignal,
): Promise<void> {
  const extra: Array<Record<string, unknown>> = [];

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const body = {
      ...baseBody,
      stream: true,
      stream_options: { include_usage: true },
      messages: [...baseMessages, ...extra],
    };
    const response = await fetchPost({ url, headers, body }, signal);
    if (!response.ok) {
      const detail = await response.text();
      throw new Error(`OpenAI-compatible HTTP ${response.status}: ${detail.slice(0, 500)}`);
    }

    let content = '';
    const toolCalls = new Map<number, AccumulatedToolCall>();
    let usage: Usage | undefined;

    const parser = createSseParser((ev) => {
      if (ev.data === '[DONE]') {
        return;
      }
      let payload: Record<string, unknown>;
      try {
        payload = JSON.parse(ev.data) as Record<string, unknown>;
      } catch {
        return;
      }
      const choices = payload.choices as
        | Array<{
            delta?: {
              content?: string;
              reasoning_content?: string;
              reasoning?: string;
              tool_calls?: Array<{
                index?: number;
                id?: string;
                function?: { name?: string; arguments?: string };
              }>;
            };
          }>
        | undefined;
      const delta = choices?.[0]?.delta;
      if (delta) {
        const reasoning = delta.reasoning_content ?? delta.reasoning ?? '';
        if (reasoning) {
          callbacks.onThinkingDelta(reasoning);
        }
        if (delta.content) {
          content += delta.content;
          callbacks.onTextDelta(delta.content);
        }
        for (const tc of delta.tool_calls ?? []) {
          const index = tc.index ?? 0;
          const acc = toolCalls.get(index) ?? { id: '', name: '', argsJson: '' };
          if (tc.id) {
            acc.id = tc.id;
          }
          if (tc.function?.name) {
            acc.name += tc.function.name;
          }
          if (tc.function?.arguments) {
            acc.argsJson += tc.function.arguments;
          }
          toolCalls.set(index, acc);
        }
      }
      const chunkUsage = payload.usage as { prompt_tokens?: number; completion_tokens?: number } | undefined;
      if (chunkUsage) {
        usage = { inputTokens: chunkUsage.prompt_tokens, outputTokens: chunkUsage.completion_tokens };
      }
    });

    await streamResponseText(response, (chunk) => parser.feed(chunk));
    parser.finish();

    const completedCalls = [...toolCalls.values()];
    const assistantMessage: Record<string, unknown> = { role: 'assistant', content: content || null };
    if (completedCalls.length > 0) {
      assistantMessage.tool_calls = completedCalls.map((c) => ({
        id: c.id,
        type: 'function',
        function: { name: c.name, arguments: c.argsJson.length > 0 ? c.argsJson : '{}' },
      }));
    }
    extra.push(assistantMessage);

    if (completedCalls.length === 0) {
      callbacks.onDone(usage);
      return;
    }

    for (const call of completedCalls) {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(call.argsJson || '{}') as Record<string, unknown>;
      } catch {
        args = {};
      }
      const outcome: ToolCallOutcome = await callbacks.onToolCall({ id: call.id, name: call.name, arguments: args });
      extra.push({
        role: 'tool',
        tool_call_id: call.id,
        content: outcome.approved ? outcome.result : 'The user denied this tool call.',
      });
    }
  }
  callbacks.onDone();
}

async function runNonStreamingLoop(
  url: string,
  headers: Record<string, string>,
  baseBody: Record<string, unknown>,
  baseMessages: Array<Record<string, unknown>>,
  callbacks: ChatCallbacks,
  originalError: unknown,
): Promise<void> {
  const extra: Array<Record<string, unknown>> = [];

  try {
    for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
      const body = { ...baseBody, stream: false, messages: [...baseMessages, ...extra] };
      const text = await requestUrlPost({ url, headers, body });
      const data = JSON.parse(text) as {
        choices?: Array<{
          message?: {
            content?: string | null;
            reasoning_content?: string;
            reasoning?: string;
            tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: string } }>;
          };
        }>;
        usage?: { prompt_tokens?: number; completion_tokens?: number };
      };

      const message = data.choices?.[0]?.message ?? {};
      const reasoning = message.reasoning_content ?? message.reasoning ?? '';
      if (reasoning) {
        callbacks.onThinkingDelta(reasoning);
      }
      const content = message.content ?? '';
      if (content) {
        callbacks.onTextDelta(content);
      }

      const rawCalls = message.tool_calls ?? [];
      const assistantMessage: Record<string, unknown> = { role: 'assistant', content: content || null };
      if (rawCalls.length > 0) {
        assistantMessage.tool_calls = rawCalls.map((c) => ({
          id: c.id ?? '',
          type: 'function',
          function: { name: c.function?.name ?? '', arguments: c.function?.arguments ?? '{}' },
        }));
      }
      extra.push(assistantMessage);

      if (rawCalls.length === 0) {
        callbacks.onDone(
          data.usage
            ? { inputTokens: data.usage.prompt_tokens, outputTokens: data.usage.completion_tokens }
            : undefined,
        );
        return;
      }

      for (const raw of rawCalls) {
        let args: Record<string, unknown> = {};
        try {
          args = JSON.parse(raw.function?.arguments ?? '{}') as Record<string, unknown>;
        } catch {
          args = {};
        }
        const outcome: ToolCallOutcome = await callbacks.onToolCall({
          id: raw.id ?? '',
          name: raw.function?.name ?? '',
          arguments: args,
        });
        extra.push({
          role: 'tool',
          tool_call_id: raw.id ?? '',
          content: outcome.approved ? outcome.result : 'The user denied this tool call.',
        });
      }
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

function toOpenAiTools(tools: ToolSpec[]): Array<Record<string, unknown>> {
  return tools.map((tool) => ({
    type: 'function',
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.inputSchema,
    },
  }));
}

function toOpenAiContent(message: ChatMessage): string | Array<Record<string, unknown>> {
  if (!message.images || message.images.length === 0) {
    return message.content;
  }
  return [
    { type: 'text', text: message.content },
    ...message.images.map((image) => ({
      type: 'image_url',
      image_url: { url: `data:${image.mediaType};base64,${image.data}` },
    })),
  ];
}
