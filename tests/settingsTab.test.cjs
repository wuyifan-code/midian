'use strict';
// Settings tab render test: display() must build every section without
// throwing (catches bad i18n keys, broken Setting chains, layout typos).
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { installObsidianMock, FakeEl } = require('./obsidianMock.cjs');

const root = path.resolve(__dirname, '..');
installObsidianMock();
globalThis.document = { createElement: (tag) => new FakeEl(tag) };

const esbuild = require('esbuild');

let MidianSettingsTab = null;
const containerEl = new FakeEl();
const plugin = {
  settings: {
    provider: 'anthropic',
    anthropic: { apiKey: 'k', baseUrl: 'https://api.anthropic.com', model: 'claude-sonnet-4-5', maxTokens: 4096 },
    openai: { apiKey: '', baseUrl: 'https://api.openai.com/v1', model: '', maxTokens: 4096 },
    persona: '',
    toolsEnabled: true,
    context: { includeActiveNote: true, includeSelection: true, budgetChars: 16000, historyMessages: 40 },
    memory: { enabled: false, model: '' },
    language: 'auto',
  },
  saveSettings: async () => {},
};

before(() => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'settings', 'MidianSettingsTab.ts')],
    bundle: true,
    external: ['obsidian', 'electron'],
    format: 'cjs',
    write: false,
    logLevel: 'silent',
  });
  const m = new Module('settings-tab.js');
  m.filename = 'settings-tab.js';
  m.paths = Module._nodeModulePaths(root);
  m._compile(result.outputFiles[0].text, 'settings-tab.js');
  MidianSettingsTab = m.exports.MidianSettingsTab;
});

function findAllByTag(el, tag) {
  const out = [];
  const walk = (node) => {
    for (const child of node.children) {
      if (child.tagName === tag) {
        out.push(child);
      }
      walk(child);
    }
  };
  walk(el);
  return out;
}

test('settings tab renders all sections without throwing', () => {
  const tab = new MidianSettingsTab({}, plugin);
  tab.containerEl = containerEl;
  tab.display();
  const headings = containerEl.children.filter((el) => el.tagName === 'H3');
  assert.ok(headings.length >= 8, `expected >= 8 section headings, got ${headings.length}`);
});

test('settings tab renders API key fields as password inputs', () => {
  const inputs = findAllByTag(containerEl, 'INPUT');
  assert.ok(inputs.length >= 2, `expected api key inputs, got ${inputs.length}`);
  const passwordInputs = inputs.filter((input) => input.type === 'password');
  assert.ok(passwordInputs.length >= 2, 'api key fields must be password inputs');
});
