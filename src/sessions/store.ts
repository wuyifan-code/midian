import type { Vault } from 'obsidian';
import { normalizeVaultPath } from '../utils/vaultPath.ts';
import type { MidianSession } from './types';

const DEFAULT_ROOT = '.midian/sessions';

export class SessionStore {
  private readonly root: string;
  private readonly vault: Vault;

  constructor(vault: Vault, root: string = DEFAULT_ROOT) {
    this.vault = vault;
    this.root = normalizeVaultPath(root);
  }

  static newId(): string {
    return `s${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  }

  private pathFor(id: string): string {
    return normalizeVaultPath(`${this.root}/${id}.json`);
  }

  private async ensureRoot(): Promise<void> {
    if (!(await this.vault.adapter.exists(this.root))) {
      await this.vault.adapter.mkdir(this.root);
    }
  }

  async load(id: string): Promise<MidianSession | null> {
    const path = this.pathFor(id);
    if (!(await this.vault.adapter.exists(path))) {
      return null;
    }
    try {
      const raw = await this.vault.adapter.read(path);
      return JSON.parse(raw) as MidianSession;
    } catch {
      return null;
    }
  }

  async save(session: MidianSession): Promise<void> {
    await this.ensureRoot();
    await this.vault.adapter.write(this.pathFor(session.id), JSON.stringify(session, null, 2));
  }

  async remove(id: string): Promise<void> {
    const path = this.pathFor(id);
    if (await this.vault.adapter.exists(path)) {
      await this.vault.adapter.remove(path);
    }
  }

  async list(): Promise<MidianSession[]> {
    if (!(await this.vault.adapter.exists(this.root))) {
      return [];
    }
    const { files } = await this.vault.adapter.list(this.root);
    const sessions: MidianSession[] = [];
    for (const file of files) {
      if (!file.endsWith('.json')) {
        continue;
      }
      try {
        const raw = await this.vault.adapter.read(file);
        sessions.push(JSON.parse(raw) as MidianSession);
      } catch {
        // skip corrupt session files
      }
    }
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions;
  }
}
