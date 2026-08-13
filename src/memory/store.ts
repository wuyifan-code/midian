import type { Vault } from 'obsidian';
import { normalizeVaultPath } from '../utils/vaultPath.ts';

const DEFAULT_DIR = '.midian/memory';

export class MemoryStore {
  private readonly dir: string;
  private readonly vault: Vault;

  constructor(
    vault: Vault,
    dir: string = DEFAULT_DIR,
  ) {
    this.vault = vault;
    this.dir = normalizeVaultPath(dir);
  }

  private pathFor(name: string): string {
    return normalizeVaultPath(`${this.dir}/${name}`);
  }

  private async ensureDir(): Promise<void> {
    if (!(await this.vault.adapter.exists(this.dir))) {
      await this.vault.adapter.mkdir(this.dir);
    }
  }

  async read(name: string): Promise<string> {
    const path = this.pathFor(name);
    if (!(await this.vault.adapter.exists(path))) {
      return '';
    }
    try {
      return await this.vault.adapter.read(path);
    } catch {
      return '';
    }
  }

  async write(name: string, text: string): Promise<void> {
    await this.ensureDir();
    await this.vault.adapter.write(this.pathFor(name), text.trim().length > 0 ? `${text.trim()}\n` : '');
  }

  async append(name: string, text: string): Promise<void> {
    const current = await this.read(name);
    const block = text.trim();
    if (!block) {
      return;
    }
    await this.write(name, current ? `${current.trim()}\n\n${block}` : block);
  }

  async lineCount(name: string): Promise<number> {
    const content = await this.read(name);
    return content.split('\n').filter((line) => line.trim().length > 0).length;
  }
}
