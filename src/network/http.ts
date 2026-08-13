import { requestUrl } from 'obsidian';

export interface HttpPostOptions {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

// Mobile networks can stall mid-stream; after this much silence the stream
// is considered dead and the provider falls back to non-streaming.
export const STREAM_INACTIVITY_TIMEOUT_MS = 120_000;

export async function fetchPost(options: HttpPostOptions, signal: AbortSignal): Promise<Response> {
  return fetch(options.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(options.body),
    signal,
  });
}

export async function streamResponseText(
  response: Response,
  onText: (text: string) => void,
  inactivityMs: number = STREAM_INACTIVITY_TIMEOUT_MS,
): Promise<void> {
  const body = response.body;
  if (!body) {
    throw new Error('Response has no body');
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let timedOut = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const arm = () => {
    if (inactivityMs <= 0) {
      return;
    }
    if (timer) {
      clearTimeout(timer);
    }
    timer = setTimeout(() => {
      timedOut = true;
      void reader.cancel();
    }, inactivityMs);
  };
  try {
    arm();
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      arm();
      onText(decoder.decode(value, { stream: true }));
    }
  } finally {
    if (timer) {
      clearTimeout(timer);
    }
    reader.releaseLock();
  }
  if (timedOut) {
    throw new Error('Stream timed out: no data received for a while');
  }
}

export async function requestUrlPost(options: HttpPostOptions): Promise<string> {
  const response = await requestUrl({
    url: options.url,
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(options.body),
  });
  if (response.status >= 400) {
    throw new Error(`HTTP ${response.status}: ${response.text.slice(0, 500)}`);
  }
  return response.text;
}
