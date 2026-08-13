import type { MidianSession } from '../sessions/types';

export function sanitizeFilename(name: string): string {
  const cleaned = name.replace(/[\\/:*?"<>|]/g, '-').replace(/\s+/g, ' ').trim();
  return cleaned.length > 0 ? cleaned : 'conversation';
}

export function buildExportMarkdown(session: MidianSession): string {
  const lines: string[] = [];
  lines.push(`# ${session.title}`);
  lines.push('');
  lines.push(
    `> ${session.providerId} · ${session.model} · ${new Date(session.updatedAt).toISOString().slice(0, 10)}`,
  );
  lines.push('');
  for (const message of session.messages) {
    if (message.role === 'user') {
      lines.push('## 用户');
      lines.push('');
      lines.push(message.content);
      if (message.images && message.images.length > 0) {
        lines.push('');
        for (const image of message.images) {
          lines.push(`![[${image}]]`);
        }
      }
    } else {
      lines.push('## Midian');
      if (message.thinking) {
        lines.push('');
        lines.push('> 思考过程：');
        lines.push('>');
        for (const line of message.thinking.split('\n')) {
          lines.push(`> ${line}`);
        }
      }
      lines.push('');
      lines.push(message.content);
    }
    lines.push('');
  }
  return lines.join('\n');
}
