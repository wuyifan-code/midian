import type { Vault } from 'obsidian';

/** In-memory DataAdapter stand-in for store tests; never used by the plugin. */
export class MockAdapter {
  files = new Map<string, string>();
  dirs = new Set<string>();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.dirs.has(path);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }

  async read(path: string): Promise<string> {
    return this.files.get(path) ?? '';
  }

  async write(path: string, content: string): Promise<void> {
    this.files.set(path, content);
  }

  async remove(path: string): Promise<void> {
    this.files.delete(path);
  }

  async list(path: string): Promise<{ folders: string[]; files: string[] }> {
    const prefix = path === '/' ? '' : path;
    const folders = [...this.dirs].filter((d) => d.startsWith(`${prefix}/`));
    const files = [...this.files.keys()].filter((f) => f.startsWith(`${prefix}/`));
    return { folders, files };
  }
}

export function makeVault(): Vault {
  return { adapter: new MockAdapter() } as unknown as Vault;
}
