'use strict';
// Bundle smoke test: builds src/main.ts with esbuild, loads the CJS bundle
// through a mocked `obsidian` module, and runs the plugin's onload() to prove
// the plugin initializes in an Obsidian-like runtime without throwing.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const root = path.resolve(__dirname, '..');

const registered = { views: [], commands: [], ribbon: 0, settingsTabs: 0, events: 0 };

class FakeEl {
  createEl() { return new FakeEl(); }
  createDiv() { return new FakeEl(); }
  createSpan() { return new FakeEl(); }
  empty() {}
  addClass() {}
  removeClass() {}
  toggleClass() {}
  setText() {}
  setAttr() {}
  addEventListener() {}
  hide() {}
  show() {}
  appendChild() {}
  remove() {}
}

class FakeComponent {
  load() {}
  unload() {}
  addChild() {}
  register() {}
  unregister() {}
}

class FakeItemView extends FakeComponent {
  constructor(leaf) {
    super();
    this.leaf = leaf;
    this.contentEl = new FakeEl();
  }
}

class FakeModal extends FakeComponent {
  constructor(app) {
    super();
    this.app = app;
    this.contentEl = new FakeEl();
    this.titleEl = new FakeEl();
  }
  open() {}
  close() {}
}

class FakeMenu {
  addItem() {
    const item = {
      setTitle() { return item; },
      setIcon() { return item; },
      onClick() { return item; },
      setChecked() { return item; },
    };
    return item;
  }
  addSeparator() { return this; }
  showAtMouseEvent() {}
}

class FakeNotice { constructor() {} }

class FakeSetting {
  setName() { return this; }
  setDesc() { return this; }
  addText() { return { setPlaceholder() { return this; }, setValue() { return this; }, onChange() { return this; }, inputEl: new FakeEl() }; }
  addTextArea() { return this.addText(); }
  addToggle() { return { setValue() { return this; }, onChange() { return this; } }; }
  addDropdown() { return { addOption() { return this; }, setValue() { return this; }, onChange() { return this; } }; }
  addButton() { return { setButtonText() { return this; }, setDisabled() { return this; }, onClick() { return this; } }; }
  addExtraButton() { return { setIcon() { return this; }, setTooltip() { return this; }, onClick() { return this; } }; }
}

class FakePluginSettingTab {
  constructor(app, plugin) {
    this.app = app;
    this.plugin = plugin;
  }
  display() {}
}

class FakePlugin extends FakeComponent {
  constructor(app, manifest) {
    super();
    this.app = app;
    this.manifest = manifest;
  }
  async loadData() { return null; }
  async saveData() {}
  registerView(type, factory) { registered.views.push({ type, factory }); }
  addRibbonIcon() { registered.ribbon += 1; return { remove() {} }; }
  addCommand(cmd) { registered.commands.push(cmd); }
  addSettingTab() { registered.settingsTabs += 1; }
  registerEvent() { registered.events += 1; return () => {}; }
  registerDomEvent() { return () => {}; }
  registerInterval() { return 0; }
}

const fakeObsidian = {
  Plugin: FakePlugin,
  ItemView: FakeItemView,
  Modal: FakeModal,
  Menu: FakeMenu,
  Notice: FakeNotice,
  Setting: FakeSetting,
  PluginSettingTab: FakePluginSettingTab,
  Component: FakeComponent,
  TFile: class {},
  App: class {},
  WorkspaceLeaf: class {},
  Vault: class {},
  Platform: { isMobile: false },
  MarkdownRenderer: { render: async () => {} },
  requestUrl: async () => ({ status: 200, text: '', json: {}, arrayBuffer: new ArrayBuffer(0), headers: {} }),
  normalizePath: (p) => p.replace(/\\/g, '/'),
  setIcon: () => {},
};

const origLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'obsidian') {
    return fakeObsidian;
  }
  return origLoad.apply(this, arguments);
};

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
