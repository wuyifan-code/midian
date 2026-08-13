import type { Vault } from 'obsidian';

/** In-memory DataAdapter stand-in for store tests; never used by the plugin. */
export class MockAdapter {
  files = new Map<string, string>();
  binaryFiles = new Map<string, Uint8Array>();
  dirs = new Set<string>();

  async exists(path: string): Promise<boolean> {
    return this.files.has(path) || this.binaryFiles.has(path) || this.dirs.has(path);
  }

  async mkdir(path: string): Promise<void> {
    this.dirs.add(path);
  }

  async read(path: string): Promise<string> {
    return this.files.get(path) ?? '';
  }

  async readBinary(path: string): Promise<ArrayBuffer> {
    const data = this.binaryFiles.get(path);
    if (!data) {
      throw new Error(`no binary file: ${path}`);
    }
    return data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  }

  getResourcePath(path: string): string {
    return `vault://${path}`;
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
