import { runAnthropicChat } from './anthropic';
import { runOpenAiChat } from './openaiCompat';
import type { ChatCallbacks, ChatMessage, ChatOptions, ProviderConfig, ProviderId } from './types';

export async function runChat(
  providerId: ProviderId,
  config: ProviderConfig,
  messages: ChatMessage[],
  options: ChatOptions,
  callbacks: ChatCallbacks,
  signal: AbortSignal,
): Promise<void> {
  if (!config.apiKey) {
    callbacks.onError(new Error('No API key configured'));
    return;
  }
  if (!config.model.trim()) {
    callbacks.onError(new Error('No model configured'));
    return;
  }
  if (providerId === 'anthropic') {
    await runAnthropicChat(config, messages, options, callbacks, signal);
    return;
  }
  await runOpenAiChat(config, messages, options, callbacks, signal);
}
