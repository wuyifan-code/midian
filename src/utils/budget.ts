export interface ContextBlock {
  label: string;
  text: string;
}

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars || maxChars <= 0) {
    return text;
  }
  let end = Math.max(0, maxChars - 1);
  // Do not split a surrogate pair: if the cut lands on a low surrogate,
  // include it so the emoji before the cut stays intact.
  const code = text.charCodeAt(end);
  if (code >= 0xdc00 && code <= 0xdfff) {
    end += 1;
  }
  return `${text.slice(0, end)}…`;
}

export function assembleContextBlocks(blocks: ContextBlock[], budgetChars: number): string {
  if (blocks.length === 0 || budgetChars <= 0) {
    return '';
  }
  const perBlock = Math.max(200, Math.floor(budgetChars / blocks.length));
  const parts: string[] = [];
  for (const block of blocks) {
    const text = truncateText(block.text.trim(), perBlock);
    if (!text) {
      continue;
    }
    parts.push(`## ${block.label}\n\n${text}`);
  }
  return parts.join('\n\n');
}
