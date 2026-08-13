export interface ContextBlock {
  label: string;
  text: string;
}

export function truncateText(text: string, maxChars: number): string {
  if (text.length <= maxChars || maxChars <= 0) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 1))}…`;
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
