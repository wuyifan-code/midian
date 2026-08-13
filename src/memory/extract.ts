import type { ChatMessage, ProviderConfig, ProviderId } from '../providers/types';
import { runChat } from '../providers/registry';
import { CONSOLIDATION_PROMPT, EXTRACTION_PROMPT, TITLE_PROMPT } from './prompt';

const SHOT_TIMEOUT_MS = 60_000;
const CONSOLIDATE_AT_LINES = 60;

function renderTranscript(messages: ChatMessage[]): string {
  return messages
    .map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`)
    .join('\n');
}

async function runSingleShot(providerId: ProviderId, config: ProviderConfig, prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), SHOT_TIMEOUT_MS);
    let text = '';
    void runChat(
      providerId,
      config,
      [{ role: 'user', content: prompt }],
      {},
      {
        onThinkingDelta: () => {},
        onTextDelta: (delta) => {
          text += delta;
        },
        onToolCall: async () => ({ approved: false, result: '', isError: true }),
        onDone: () => {
          clearTimeout(timeout);
          resolve(stripFences(text));
        },
        onError: () => {
          clearTimeout(timeout);
          resolve('');
        },
      },
      controller.signal,
    );
  });
}

function stripFences(text: string): string {
  return text
    .replace(/^```(?:markdown|md|json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}

export async function extractMemory(
  providerId: ProviderId,
  config: ProviderConfig,
  memoryModel: string,
  transcript: ChatMessage[],
): Promise<string> {
  const model = memoryModel.trim() || config.model;
  return runSingleShot(providerId, { ...config, model }, `${EXTRACTION_PROMPT}${renderTranscript(transcript)}`);
}

export async function consolidateMemory(
  providerId: ProviderId,
  config: ProviderConfig,
  memoryModel: string,
  shortTerm: string,
): Promise<string> {
  const model = memoryModel.trim() || config.model;
  return runSingleShot(providerId, { ...config, model }, `${CONSOLIDATION_PROMPT}${shortTerm}`);
}

export async function generateTitle(
  providerId: ProviderId,
  config: ProviderConfig,
  memoryModel: string,
  userContent: string,
  assistantContent: string,
): Promise<string> {
  const model = memoryModel.trim() || config.model;
  const prompt = `${TITLE_PROMPT}用户：${userContent}\n助手：${assistantContent.slice(0, 800)}`;
  const title = await runSingleShot(providerId, { ...config, model }, prompt);
  return title.replace(/^["'「《]|["'」》]$/g, '').replace(/\s+/g, ' ').slice(0, 40);
}

export { CONSOLIDATE_AT_LINES };
