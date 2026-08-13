import { requestUrl } from 'obsidian';

export interface HttpPostOptions {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

export async function fetchPost(options: HttpPostOptions, signal: AbortSignal): Promise<Response> {
  return fetch(options.url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...options.headers },
    body: JSON.stringify(options.body),
    signal,
  });
}

export async function streamResponseText(response: Response, onText: (text: string) => void): Promise<void> {
  const body = response.body;
  if (!body) {
    throw new Error('Response has no body');
  }
  const reader = body.getReader();
  const decoder = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      onText(decoder.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
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
