import { normalizePath, type App } from 'obsidian';
import { parseFrontmatter, stringifyFrontmatter } from '../utils/frontmatter';
import { resolveSafePath } from '../utils/vaultPath';

export interface ToolResult {
  ok: boolean;
  result: string;
}

const MAX_SEARCH_SCAN_FILES = 300;
const MAX_SEARCH_RESULTS = 10;
const SNIPPET_CHARS = 160;

export async function executeTool(app: App, name: string, args: Record<string, unknown>): Promise<ToolResult> {
  try {
    switch (name) {
      case 'read_note': {
        const resolved = resolveSafePath(args.path);
        if ('error' in resolved) {
          return fail(resolved.error);
        }
        if (!(await app.vault.adapter.exists(resolved.path))) {
          return fail(`文件不存在: ${resolved.path}`);
        }
        return ok(await app.vault.adapter.read(resolved.path));
      }
      case 'write_note': {
        const resolved = resolveSafePath(args.path);
        if ('error' in resolved) {
          return fail(resolved.error);
        }
        if (typeof args.content !== 'string') {
          return fail('content 必须是字符串');
        }
        await app.vault.adapter.write(resolved.path, args.content);
        return ok(`已写入 ${resolved.path}`);
      }
      case 'append_note': {
        const resolved = resolveSafePath(args.path);
        if ('error' in resolved) {
          return fail(resolved.error);
        }
        if (typeof args.content !== 'string') {
          return fail('content 必须是字符串');
        }
        const existing = (await app.vault.adapter.exists(resolved.path))
          ? await app.vault.adapter.read(resolved.path)
          : '';
        const separator = existing.length === 0 || existing.endsWith('\n') ? '' : '\n';
        await app.vault.adapter.write(resolved.path, `${existing}${separator}${args.content}`);
        return ok(`已追加到 ${resolved.path}`);
      }
      case 'list_folder': {
        const folderRaw = typeof args.path === 'string' && args.path.trim() ? args.path.trim() : '';
        const folder = folderRaw ? normalizePath(folderRaw) : '';
        const listed = await app.vault.adapter.list(folder || '/');
        const lines: string[] = [];
        for (const folder of listed.folders.sort()) {
          lines.push(`- ${folder}/`);
        }
        for (const file of listed.files.filter((f) => f.endsWith('.md')).sort()) {
          lines.push(`- ${file}`);
        }
        return ok(lines.length > 0 ? lines.join('\n') : '（空文件夹）');
      }
      case 'search_notes': {
        const query = typeof args.query === 'string' ? args.query.trim() : '';
        if (!query) {
          return fail('query 不能为空');
        }
        const q = query.toLowerCase();
        const files = app.vault.getMarkdownFiles();
        const nameMatches = files.filter(
          (f) => f.path.toLowerCase().includes(q) || f.basename.toLowerCase().includes(q),
        );
        const results: string[] = nameMatches.slice(0, MAX_SEARCH_RESULTS).map((f) => `- ${f.path}（标题匹配）`);
        if (results.length < 5) {
          const matchedPaths = new Set(nameMatches.map((f) => f.path));
          const scan = files.filter((f) => !matchedPaths.has(f.path)).slice(0, MAX_SEARCH_SCAN_FILES);
          for (const file of scan) {
            let content: string;
            try {
              content = await app.vault.adapter.read(file.path);
            } catch {
              continue;
            }
            const idx = content.toLowerCase().indexOf(q);
            if (idx !== -1) {
              const start = Math.max(0, idx - 60);
              const snippet = content
                .slice(start, start + SNIPPET_CHARS)
                .replace(/\s+/g, ' ')
                .trim();
              results.push(`- ${file.path}：…${snippet}…`);
              if (results.length >= MAX_SEARCH_RESULTS) {
                break;
              }
            }
          }
        }
        if (results.length === 0) {
          return ok('未找到匹配的笔记');
        }
        return ok(results.join('\n'));
      }
      case 'get_properties': {
        const resolved = resolveSafePath(args.path);
        if ('error' in resolved) {
          return fail(resolved.error);
        }
        if (!(await app.vault.adapter.exists(resolved.path))) {
          return fail(`文件不存在: ${resolved.path}`);
        }
        const text = await app.vault.adapter.read(resolved.path);
        const { frontmatter } = parseFrontmatter(text);
        return ok(JSON.stringify(frontmatter, null, 2));
      }
      case 'update_properties': {
        const resolved = resolveSafePath(args.path);
        if ('error' in resolved) {
          return fail(resolved.error);
        }
        if (!(await app.vault.adapter.exists(resolved.path))) {
          return fail(`文件不存在: ${resolved.path}`);
        }
        const props = args.properties;
        if (typeof props !== 'object' || props === null || Array.isArray(props)) {
          return fail('properties 必须是对象');
        }
        const text = await app.vault.adapter.read(resolved.path);
        const updated = stringifyFrontmatter(text, props as Record<string, unknown>);
        await app.vault.adapter.write(resolved.path, updated);
        return ok(`已更新 ${resolved.path} 的属性`);
      }
      default:
        return fail(`未知工具: ${name}`);
    }
  } catch (error) {
    return fail(error instanceof Error ? error.message : String(error));
  }
}

function ok(result: string): ToolResult {
  return { ok: true, result };
}

function fail(result: string): ToolResult {
  return { ok: false, result };
}
