'use strict';
// Bundle smoke test: builds src/main.ts with esbuild, loads the CJS bundle
// through the shared mocked `obsidian` module, and runs the plugin's onload()
// to prove the plugin initializes in an Obsidian-like runtime without throwing.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { installObsidianMock, registered } = require('./obsidianMock.cjs');

const root = path.resolve(__dirname, '..');
installObsidianMock();

const esbuild = require('esbuild');

let MainClass = null;

before(() => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'main.ts')],
    bundle: true,
    external: ['obsidian', 'electron'],
    format: 'cjs',
    write: false,
    logLevel: 'silent',
  });
  const m = new Module('midian-main.js');
  m.filename = 'midian-main.js';
  m.paths = Module._nodeModulePaths(root);
  m._compile(result.outputFiles[0].text, 'midian-main.js');
  MainClass = m.exports.default ?? m.exports;
});

test('bundle builds and exposes the plugin class', () => {
  assert.ok(MainClass, 'main.js bundle should export the plugin class');
  assert.equal(typeof MainClass, 'function');
});

test('onload registers the chat view, commands, ribbon and settings tab', async () => {
  const app = {
    vault: { adapter: {} },
    workspace: {
      on: () => () => {},
      getLeavesOfType: () => [],
      revealLeaf: () => {},
      getLeaf: () => ({}),
      getActiveFile: () => null,
      activeEditor: null,
    },
  };
  const plugin = new MainClass(app, { id: 'midian', version: '0.0.0' });
  await plugin.onload();
  assert.ok(registered.views.some((v) => v.type === 'midian-chat-view'), 'chat view should be registered');
  assert.ok(registered.commands.length >= 5, 'slash/commands should be registered');
  assert.ok(registered.ribbon >= 1, 'ribbon icon should be added');
  assert.ok(registered.settingsTabs >= 1, 'settings tab should be added');
  assert.ok(registered.events >= 2, 'workspace events should be subscribed');
});
