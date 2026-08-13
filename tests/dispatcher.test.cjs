'use strict';
// Tool dispatcher tests: the security-critical glue between the provider
// tool calls and the vault adapter (path safety, merge semantics, errors).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { installObsidianMock } = require('./obsidianMock.cjs');
const { MockAdapter } = require('./mockVault.mts');

const root = path.resolve(__dirname, '..');
installObsidianMock();

const esbuild = require('esbuild');

let executeTool = null;
const adapter = new MockAdapter();
const app = {
  vault: {
    adapter,
    getMarkdownFiles: () => [],
  },
};

before(() => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'tools', 'dispatcher.ts')],
    bundle: true,
    external: ['obsidian', 'electron'],
    format: 'cjs',
    write: false,
    logLevel: 'silent',
  });
  const m = new Module('dispatcher.js');
  m.filename = 'dispatcher.js';
  m.paths = Module._nodeModulePaths(root);
  m._compile(result.outputFiles[0].text, 'dispatcher.js');
  executeTool = m.exports.executeTool;
});

test('read_note returns the file content', async () => {
  adapter.files.set('a.md', 'hello');
  const result = await executeTool(app, 'read_note', { path: 'a.md' });
  assert.equal(result.ok, true);
  assert.equal(result.result, 'hello');
});

test('read_note rejects traversal paths', async () => {
  const result = await executeTool(app, 'read_note', { path: '../secret.md' });
  assert.equal(result.ok, false);
  assert.match(result.result, /Vault/);
});

test('read_note reports missing files', async () => {
  const result = await executeTool(app, 'read_note', { path: 'nope.md' });
  assert.equal(result.ok, false);
  assert.match(result.result, /不存在/);
});

test('write_note creates and overwrites', async () => {
  const r1 = await executeTool(app, 'write_note', { path: 'notes/x.md', content: 'first' });
  assert.equal(r1.ok, true);
  assert.equal(adapter.files.get('notes/x.md'), 'first');
  const r2 = await executeTool(app, 'write_note', { path: 'notes/x.md', content: 'second' });
  assert.equal(r2.ok, true);
  assert.equal(adapter.files.get('notes/x.md'), 'second');
});

test('append_note appends with a separator', async () => {
  await executeTool(app, 'write_note', { path: 'a.md', content: 'one' });
  await executeTool(app, 'append_note', { path: 'a.md', content: 'two' });
  assert.equal(adapter.files.get('a.md'), 'one\ntwo');
});

test('update_properties merges with existing frontmatter and honors null deletes', async () => {
  adapter.files.set('meta.md', '---\na: 1\n---\nBody');
  const result = await executeTool(app, 'update_properties', {
    path: 'meta.md',
    properties: { b: 'two', a: null },
  });
  assert.equal(result.ok, true);
  const text = adapter.files.get('meta.md');
  assert.match(text, /b: two/);
  assert.ok(!text.includes('a: 1'), 'a must be removed from the merged frontmatter');
  assert.ok(text.endsWith('Body'));
});

test('get_properties returns parsed frontmatter', async () => {
  adapter.files.set('meta.md', '---\na: 1\n---\nBody');
  const result = await executeTool(app, 'get_properties', { path: 'meta.md' });
  assert.equal(result.ok, true);
  assert.ok(result.result.includes('"a": 1'));
});

test('search_notes matches content with snippets', async () => {
  adapter.files.set('note1.md', 'the needle is here');
  adapter.files.set('note2.md', 'nothing at all');
  app.vault.getMarkdownFiles = () =>
    ['note1.md', 'note2.md'].map((p) => ({ path: p, basename: p.replace('.md', '') }));
  const result = await executeTool(app, 'search_notes', { query: 'needle' });
  assert.equal(result.ok, true);
  assert.ok(result.result.includes('note1.md'));
  assert.ok(!result.result.includes('note2.md'));
});

test('list_folder lists markdown files and subfolders', async () => {
  adapter.dirs.add('sub');
  adapter.files.set('sub/x.md', 'x');
  adapter.files.set('top.md', 't');
  const result = await executeTool(app, 'list_folder', { path: '' });
  assert.equal(result.ok, true);
  assert.ok(result.result.includes('sub/'));
  assert.ok(result.result.includes('top.md'));
});

test('ask_user is never dispatched (UI intercepts it)', async () => {
  const result = await executeTool(app, 'ask_user', { question: 'hi' });
  assert.equal(result.ok, false);
});

test('unknown tools fail gracefully', async () => {
  const result = await executeTool(app, 'frobnicate', {});
  assert.equal(result.ok, false);
});
