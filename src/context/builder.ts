import type { App } from 'obsidian';
import type { MidianSettings } from '../settings/types';
import { assembleContextBlocks, truncateText, type ContextBlock } from '../utils/budget';

export interface AttachChip {
  path: string;
}

export interface ActiveNoteContext {
  path: string;
  selection: string | null;
}

export interface MemoryContext {
  profile: string;
  shortTerm: string;
}

export const DEFAULT_PERSONA =
  '你是 Midian，嵌入 Obsidian 的 AI 助手。用简洁清晰的 Markdown 回答，善用标题、列表与代码块。' +
  '回答使用与用户相同的语言。需要读写 Vault 时使用提供的工具，写入前尊重用户决定。';

const MAX_FOLDER_FILES = 20;
const MAX_FILE_CHARS = 3000;

export async function buildSystemPrompt(
  app: App,
  settings: MidianSettings,
  opts: { chips: AttachChip[]; activeNote: ActiveNoteContext | null; memory: MemoryContext },
): Promise<string> {
  const parts: string[] = [];
  const persona = settings.persona.trim() ? settings.persona : DEFAULT_PERSONA;
  parts.push(persona);

  const blocks: ContextBlock[] = [];
  for (const chip of opts.chips) {
    const text = await loadNoteContext(app, chip.path);
    if (text) {
      blocks.push({ label: `@${chip.path}`, text });
    }
  }
  if (opts.activeNote) {
    let text = opts.activeNote.selection ?? (await loadNoteContext(app, opts.activeNote.path)) ?? '';
    if (text.trim()) {
      blocks.push({
        label: opts.activeNote.selection ? `当前选中文本（${opts.activeNote.path}）` : `当前笔记：${opts.activeNote.path}`,
        text,
      });
    }
  }
  const attached = assembleContextBlocks(blocks, settings.context.budgetChars);
  if (attached) {
    parts.push(`以下是相关的笔记内容，仅供参考：\n\n${attached}`);
  }

  const memoryParts: string[] = [];
  if (opts.memory.profile.trim()) {
    memoryParts.push(`## 用户长期画像\n${truncateText(opts.memory.profile, 1500)}`);
  }
  if (opts.memory.shortTerm.trim()) {
    memoryParts.push(`## 近期对话要点\n${truncateText(opts.memory.shortTerm, 1500)}`);
  }
  if (memoryParts.length > 0) {
    parts.push(`以下是关于用户的记忆：\n\n${memoryParts.join('\n\n')}`);
  }

  return parts.join('\n\n');
}

async function loadNoteContext(app: App, path: string): Promise<string | null> {
  try {
    if (!(await app.vault.adapter.exists(path))) {
      return null;
    }
    return await app.vault.adapter.read(path);
  } catch {
    return null;
  }
}

export async function loadFolderContext(app: App, path: string): Promise<string | null> {
  const folder = path.replace(/\/+$/, '');
  const files = app.vault
    .getMarkdownFiles()
    .filter((f) => f.path.startsWith(`${folder}/`))
    .slice(0, MAX_FOLDER_FILES);
  if (files.length === 0) {
    return null;
  }
  const parts: string[] = [];
  for (const file of files) {
    try {
      const content = await app.vault.adapter.read(file.path);
      parts.push(`### ${file.path}\n\n${truncateText(content, MAX_FILE_CHARS)}`);
    } catch {
      // skip unreadable files
    }
  }
  return parts.length > 0 ? parts.join('\n\n') : null;
}
