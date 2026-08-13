export interface TranscriptMessage {
  role: string;
  content: string;
}

export function renderTranscript(messages: TranscriptMessage[]): string {
  return messages.map((m) => `${m.role === 'user' ? '用户' : '助手'}: ${m.content}`).join('\n');
}

export function stripFences(text: string): string {
  return text
    .replace(/^```(?:markdown|md|json)?\s*/i, '')
    .replace(/```\s*$/, '')
    .trim();
}
