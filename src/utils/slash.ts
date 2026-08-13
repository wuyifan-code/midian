export interface SlashQuery {
  prefix: string;
  start: number;
}

export function getSlashQuery(value: string, caret: number): SlashQuery | null {
  const before = value.slice(0, caret);
  const lineStart = before.lastIndexOf('\n') + 1;
  const line = before.slice(lineStart);
  const match = line.match(/^\/([a-z-]*)$/i);
  if (!match) {
    return null;
  }
  return { prefix: match[1].toLowerCase(), start: lineStart };
}
