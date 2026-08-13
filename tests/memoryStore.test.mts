import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryStore } from '../src/memory/store.ts';
import { makeVault, MockAdapter } from './mockVault.mts';

test('read returns empty string for a missing file', async () => {
  const store = new MemoryStore(makeVault());
  assert.equal(await store.read('short-term.md'), '');
});

test('write trims content and appends a trailing newline', async () => {
  const store = new MemoryStore(makeVault());
  await store.write('short-term.md', '  fact one  ');
  assert.equal(await store.read('short-term.md'), 'fact one\n');
});

test('write empty content produces an empty file', async () => {
  const store = new MemoryStore(makeVault());
  await store.write('short-term.md', '   ');
  assert.equal(await store.read('short-term.md'), '');
});

test('append merges blocks separated by a blank line', async () => {
  const store = new MemoryStore(makeVault());
  await store.append('short-term.md', 'first');
  await store.append('short-term.md', 'second');
  assert.equal(await store.read('short-term.md'), 'first\n\nsecond\n');
});

test('append ignores empty text', async () => {
  const store = new MemoryStore(makeVault());
  await store.append('short-term.md', '  ');
  assert.equal(await store.read('short-term.md'), '');
});

test('lineCount counts only non-empty lines', async () => {
  const store = new MemoryStore(makeVault());
  await store.write('short-term.md', 'a\n\nb\n');
  assert.equal(await store.lineCount('short-term.md'), 2);
});

test('first write creates the memory directory', async () => {
  const vault = makeVault();
  const adapter = vault.adapter as MockAdapter;
  const store = new MemoryStore(vault);
  await store.write('short-term.md', 'x');
  assert.ok(adapter.dirs.has('.midian/memory'));
});
