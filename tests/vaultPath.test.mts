import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeVaultPath, resolveSafePath } from '../src/utils/vaultPath.ts';

test('normalizeVaultPath converts backslashes and collapses slashes', () => {
  assert.equal(normalizeVaultPath('Folder\\Sub\\Note.md'), 'Folder/Sub/Note.md');
  assert.equal(normalizeVaultPath('a//b/'), 'a/b');
});

test('resolveSafePath accepts vault-relative paths', () => {
  assert.deepEqual(resolveSafePath('Folder/Note.md'), { path: 'Folder/Note.md' });
});

test('resolveSafePath rejects empty and non-string', () => {
  assert.ok('error' in resolveSafePath(''));
  assert.ok('error' in resolveSafePath(undefined));
  assert.ok('error' in resolveSafePath(null));
});

test('resolveSafePath rejects traversal and absolute paths', () => {
  assert.ok('error' in resolveSafePath('..'));
  assert.ok('error' in resolveSafePath('../secret.md'));
  assert.ok('error' in resolveSafePath('/etc/passwd'));
  assert.ok('error' in resolveSafePath('C:\\Windows\\system32'));
  assert.ok('error' in resolveSafePath('c:/windows'));
});
