import type { Vault } from 'obsidian';
import { normalizeVaultPath } from '../utils/vaultPath.ts';
import type { MidianSession } from './types';

const DEFAULT_ROOT = '.midian/sessions';

export class SessionStore {
  private readonly root: string;
  private readonly vault: Vault;
  // Per-session FIFO write queue: concurrent saves (e.g. streaming finish vs
  // auto-title vs user rewind) never interleave; the last-invoked write wins.
  private readonly writeQueues = new Map<string, Promise<unknown>>();

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
    const id = session.id;
    const prev = this.writeQueues.get(id) ?? Promise.resolve();
    const run = prev.then(async () => {
      await this.ensureRoot();
      await this.vault.adapter.write(this.pathFor(id), JSON.stringify(session, null, 2));
    });
    this.writeQueues.set(id, run.catch(() => {}));
    await run;
  }

  /**
   * Load, apply a mutation, and save atomically within the session's write
   * queue. The callback sees the freshest state (after all earlier queued
   * writes), so background jobs can safely merge instead of clobber.
   */
  async mutate(id: string, apply: (session: MidianSession) => void): Promise<void> {
    const prev = this.writeQueues.get(id) ?? Promise.resolve();
    const run = prev.then(async () => {
      const session = await this.load(id);
      if (!session) {
        return;
      }
      apply(session);
      await this.ensureRoot();
      await this.vault.adapter.write(this.pathFor(id), JSON.stringify(session, null, 2));
    });
    this.writeQueues.set(id, run.catch(() => {}));
    await run;
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
    const sessions = (
      await Promise.all(
        files
          .filter((file) => file.endsWith('.json'))
          .map(async (file) => {
            try {
              const raw = await this.vault.adapter.read(file);
              return JSON.parse(raw) as MidianSession;
            } catch {
              return null; // skip corrupt session files
            }
          }),
      )
    ).filter((s): s is MidianSession => s !== null);
    sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    return sessions;
  }
}
