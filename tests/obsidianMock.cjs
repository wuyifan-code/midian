'use strict';
// Shared mocked `obsidian` module for CJS bundle tests. Installed once per
// process via Module._load interception; the union of every API surface the
// bundles touch at load/init time lives here.
const Module = require('node:module');

const registered = { views: [], commands: [], ribbon: 0, settingsTabs: 0, events: 0 };

class FakeEl {
  constructor(tag = 'div') {
    this.tagName = String(tag).toUpperCase();
    this.children = [];
    this.parent = null;
    this.classes = [];
    this.attrs = {};
    this.listeners = {};
    this.style = {};
    this.textContent = '';
    this.value = '';
    this.checked = false;
    this.isConnected = true;
    this.scrollHeight = 0;
    this.scrollTop = 0;
    this.clientHeight = 0;
  }

  createEl(tag, opts = {}) {
    const el = new FakeEl(tag);
    if (opts.cls) {
      el.addClass(opts.cls);
    }
    if (opts.attr) {
      for (const [k, v] of Object.entries(opts.attr)) {
        el.setAttribute(k, v);
      }
    }
    this.appendChild(el);
    return el;
  }

  createDiv(cls) {
    const el = new FakeEl('div');
    if (cls) {
      el.addClass(cls);
    }
    this.appendChild(el);
    return el;
  }

  createSpan(cls) {
    return this.createDiv(cls);
  }

  appendChild(el) {
    if (el.parent) {
      el.parent.removeChild(el);
    }
    el.parent = this;
    this.children.push(el);
    return el;
  }

  removeChild(el) {
    const i = this.children.indexOf(el);
    if (i !== -1) {
      this.children.splice(i, 1);
      el.parent = null;
    }
  }

  insertBefore(el, ref) {
    if (el.parent) {
      el.parent.removeChild(el);
    }
    el.parent = this;
    const i = ref ? this.children.indexOf(ref) : -1;
    if (i === -1) {
      this.children.push(el);
    } else {
      this.children.splice(i, 0, el);
    }
  }

  remove() {
    if (this.parent) {
      this.parent.removeChild(this);
    }
  }

  addClass(cls) {
    for (const c of String(cls).split(/\s+/)) {
      if (c && !this.classes.includes(c)) {
        this.classes.push(c);
      }
    }
  }

  removeClass(cls) {
    this.classes = this.classes.filter((c) => c !== cls);
  }

  hasClass(cls) {
    return this.classes.includes(cls);
  }

  toggleClass(cls, on) {
    if (on === undefined) {
      on = !this.hasClass(cls);
    }
    if (on) {
      this.addClass(cls);
    } else {
      this.removeClass(cls);
    }
  }

  setAttribute(name, value) {
    this.attrs[name] = String(value);
  }

  removeAttribute(name) {
    delete this.attrs[name];
  }

  setText(text) {
    this.textContent = String(text);
  }

  appendText(text) {
    this.textContent += String(text);
  }

  addEventListener(type, fn) {
    (this.listeners[type] ??= []).push(fn);
  }

  click() {
    for (const fn of this.listeners.click ?? []) {
      fn({ stopPropagation() {}, preventDefault() {} });
    }
  }

  focus() {}
  select() {}
  setSelectionRange() {}

  hide() {
    this.addClass('is-hidden');
  }

  show() {
    this.removeClass('is-hidden');
  }

  empty() {
    this.children = [];
    this.textContent = '';
  }

  findAll(cls) {
    const out = [];
    const walk = (el) => {
      for (const child of el.children) {
        if (child.hasClass(cls)) {
          out.push(child);
        }
        walk(child);
      }
    };
    walk(this);
    return out;
  }

  first(cls) {
    return this.findAll(cls)[0] ?? null;
  }

  querySelector(sel) {
    if (sel.startsWith('.')) {
      return this.first(sel.slice(1));
    }
    return null;
  }

  querySelectorAll(sel) {
    if (sel.startsWith('.')) {
      return this.findAll(sel.slice(1));
    }
    return [];
  }
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

// Default requestUrl handler: fails loudly unless a test installs one.
const requestUrlError = () => {
  throw new Error('requestUrl must not be used in these tests');
};
let requestUrlHandler = requestUrlError;

function setRequestUrlHandler(handler) {
  requestUrlHandler = handler ?? requestUrlError;
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
  requestUrl: async (params) => requestUrlHandler(params),
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

module.exports = { installObsidianMock, registered, setRequestUrlHandler, FakeEl };
