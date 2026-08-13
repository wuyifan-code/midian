export function normalizeVaultPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/\/+/g, '/').replace(/\/+$/, '');
}

export function resolveSafePath(raw: unknown): { path: string } | { error: string } {
  if (typeof raw !== 'string' || raw.trim().length === 0) {
    return { error: 'path 必须是字符串' };
  }
  const norm = normalizeVaultPath(raw.trim());
  if (norm === '..' || norm.startsWith('../') || norm.startsWith('/') || /^[a-zA-Z]:/.test(norm)) {
    return { error: '路径必须位于 Vault 内' };
  }
  return { path: norm };
}
