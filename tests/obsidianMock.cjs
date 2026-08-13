'use strict';
// Shared mocked `obsidian` module for CJS bundle tests. Installed once per
// process via Module._load interception; the union of every API surface the
// bundles touch at load/init time lives here.
const Module = require('node:module');

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
  requestUrl: async () => {
    throw new Error('requestUrl must not be used in these tests');
  },
  normalizePath: (p) => p.replace(/\\/g, '/'),
  setIcon: () => {},
};

let installed = false;

function installObsidianMock() {
  if (installed) {
    return;
  }
  installed = true;
  const origLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'obsidian') {
      return fakeObsidian;
    }
    return origLoad.apply(this, arguments);
  };
}

module.exports = { installObsidianMock, registered };
