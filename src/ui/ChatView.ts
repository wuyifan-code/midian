import { App, ItemView, Menu, Modal, Notice, Platform, WorkspaceLeaf, normalizePath, setIcon } from 'obsidian';
import { buildSystemPrompt, type ActiveNoteContext, type AttachChip } from '../context/builder';
import { t } from '../i18n';
import { consolidateMemory, extractMemory, generateTitle, CONSOLIDATE_AT_LINES } from '../memory/extract';
import { MemoryStore } from '../memory/store';
import type {
  ChatImage,
  ChatMessage,
  ProviderConfig,
  ProviderId,
  ToolCallOutcome,
  ToolCallRequest,
  Usage,
} from '../providers/types';
import { runChat } from '../providers/registry';
import { SessionStore } from '../sessions/store';
import type { MidianSession, SessionMessage } from '../sessions/types';
import type { MidianSettings } from '../settings/types';
import { executeTool } from '../tools/dispatcher';
import { VAULT_TOOLS } from '../tools/specs';
import { arrayBufferToBase64 } from '../utils/base64';
import { buildExportMarkdown, sanitizeFilename } from '../utils/exportMarkdown';
import { getSlashQuery, type SlashQuery } from '../utils/slash';
import {
  StreamingMarkdownSlot,
  addActionRow,
  buildAssistantMessageEl,
  buildAssistantStreamingEl,
  buildErrorEl,
  buildUserMessageEl,
} from './MessageRenderer';
import { NotePickerModal } from './NotePickerModal';
import { SlashMenu, getSlashCommands, type SlashCommandDef } from './SlashMenu';
import { createToolCallCard } from './ToolCallCard';
import { createAskUserCard } from './AskUserCard';

export const VIEW_TYPE_MIDIAN = 'midian-chat-view';

const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif'];

// Anthropic caps image payloads at 5MB; OpenAI-compatible endpoints vary, so
// a conservative shared cap keeps requests within provider limits.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

const MEDIA_TYPES: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
};

const ANTHROPIC_MODELS = ['claude-sonnet-4-5', 'claude-opus-4-5', 'claude-haiku-4-5'];
const OPENAI_MODELS = ['deepseek-chat', 'moonshot-v1-8k', 'gpt-4o-mini'];

function makeTitle(content: string): string {
  const flat = content.replace(/\s+/g, ' ').trim();
  return flat.length > 30 ? `${flat.slice(0, 30)}…` : flat;
}

function formatDate(ts: number): string {
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${d.getDate()} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

interface HistoryModalContext {
  onOpen: (id: string) => void;
  onFork: (id: string) => void;
  onExport: (id: string) => void;
}

class HistoryModal extends Modal {
  private sessions: MidianSession[] = [];

  constructor(
    app: App,
    private readonly store: SessionStore,
    private readonly ctx: HistoryModalContext,
  ) {
    super(app);
  }

  async onOpen(): Promise<void> {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('midian-history-modal');
    contentEl.createEl('h4', { text: t('history.title'), cls: 'midian-history-heading' });
    this.sessions = await this.store.list();
    const searchInput = contentEl.createEl('input', {
      type: 'text',
      cls: 'midian-history-search',
      attr: { placeholder: t('history.search') },
    });
    const listEl = contentEl.createDiv('midian-history-list');

    const render = (query: string) => {
      listEl.empty();
      const q = query.toLowerCase();
      const sessions = this.sessions.filter((s) => {
        if (!q) {
          return true;
        }
        if ((s.title || '').toLowerCase().includes(q)) {
          return true;
        }
        if (s.model.toLowerCase().includes(q)) {
          return true;
        }
        return s.messages.some((m) => m.content.toLowerCase().includes(q));
      });
      if (sessions.length === 0) {
        listEl.createDiv({ cls: 'midian-history-empty', text: t('history.empty') });
        return;
      }
      for (const session of sessions) {
        const row = listEl.createDiv('midian-history-item');
        const title = row.createDiv('midian-history-title');
        title.setText(session.title || t('chat.untitled'));
        const date = row.createDiv('midian-history-date');
        date.setText(formatDate(session.updatedAt));
        const forkButton = row.createEl('button', { cls: 'midian-icon-button' });
        forkButton.setAttribute('aria-label', t('history.fork'));
        setIcon(forkButton, 'copy');
        forkButton.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.close();
          this.ctx.onFork(session.id);
        });
        const exportButton = row.createEl('button', { cls: 'midian-icon-button' });
        exportButton.setAttribute('aria-label', t('history.export'));
        setIcon(exportButton, 'download');
        exportButton.addEventListener('click', (ev) => {
          ev.stopPropagation();
          this.close();
          this.ctx.onExport(session.id);
        });
        const deleteButton = row.createEl('button', { cls: 'midian-icon-button' });
        deleteButton.setAttribute('aria-label', t('history.delete'));
        setIcon(deleteButton, 'trash-2');
        deleteButton.addEventListener('click', (ev) => {
          ev.stopPropagation();
          void this.store.remove(session.id).then(() => {
            this.sessions = this.sessions.filter((s) => s.id !== session.id);
            row.remove();
          });
        });
        row.addEventListener('click', () => {
          this.close();
          this.ctx.onOpen(session.id);
        });
      }
    };

    render('');
    searchInput.addEventListener('input', () => render(searchInput.value));
    window.setTimeout(() => searchInput.focus(), 60);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}

export class MidianChatView extends ItemView {
  private readonly store: SessionStore;
  private readonly getSettings: () => MidianSettings;
  private readonly saveSettings: () => Promise<void>;

  private activeSessionId: string | null = null;
  private abortController: AbortController | null = null;
  private streaming = false;
  private chips: AttachChip[] = [];
  private imageChips: string[] = [];
  private slashQuery: SlashQuery | null = null;
  private includeActiveNote: boolean;
  private autoApprove: Set<string> = new Set();
  private memoryStore!: MemoryStore;

  private titleEl!: HTMLElement;
  private modelEl!: HTMLElement;
  private messagesEl!: HTMLElement;
  private chipsEl!: HTMLElement;
  private textarea!: HTMLTextAreaElement;
  private sendButton!: HTMLButtonElement;
  private activeNoteButton!: HTMLButtonElement;
  private slashMenu!: SlashMenu;

  constructor(
    leaf: WorkspaceLeaf,
    store: SessionStore,
    getSettings: () => MidianSettings,
    saveSettings: () => Promise<void>,
  ) {
    super(leaf);
    this.store = store;
    this.getSettings = getSettings;
    this.saveSettings = saveSettings;
    this.includeActiveNote = getSettings().context.includeActiveNote;
  }

  getViewType(): string {
    return VIEW_TYPE_MIDIAN;
  }

  getDisplayText(): string {
    return 'Midian';
  }

  getIcon(): string {
    return 'message-circle';
  }

  async onClose(): Promise<void> {
    this.abortController?.abort();
  }

  async onOpen(): Promise<void> {
    this.memoryStore = new MemoryStore(this.app.vault);
    const root = this.contentEl.createDiv('midian-root');

    const header = root.createDiv('midian-header');
    const newButton = header.createEl('button', { cls: 'midian-icon-button' });
    newButton.setAttribute('aria-label', t('chat.header.new'));
    setIcon(newButton, 'plus');
    newButton.addEventListener('click', () => this.newSession());

    this.titleEl = header.createDiv('midian-title');
    this.titleEl.addEventListener('click', () => void this.startTitleEdit());
    this.modelEl = header.createEl('button', { cls: 'midian-model-button' });
    this.modelEl.addEventListener('click', (ev) => this.openModelMenu(ev));

    const rewindButton = header.createEl('button', { cls: 'midian-icon-button' });
    rewindButton.setAttribute('aria-label', t('chat.header.rewind'));
    setIcon(rewindButton, 'undo-2');
    rewindButton.addEventListener('click', () => void this.rewind());

    const historyButton = header.createEl('button', { cls: 'midian-icon-button' });
    historyButton.setAttribute('aria-label', t('chat.header.history'));
    setIcon(historyButton, 'history');
    historyButton.addEventListener('click', () => this.openHistory());

    this.messagesEl = root.createDiv('midian-messages');

    const composer = root.createDiv('midian-composer');
    this.chipsEl = composer.createDiv('midian-chips');
    this.slashMenu = new SlashMenu(composer, (command) => this.onSlashPick(command));

    const row = composer.createDiv('midian-composer-row');
    const attachButton = row.createEl('button', { cls: 'midian-icon-button' });
    attachButton.setAttribute('aria-label', t('chat.header.attach'));
    setIcon(attachButton, 'paperclip');
    attachButton.addEventListener('click', () => this.openNotePicker());

    const imageButton = row.createEl('button', { cls: 'midian-icon-button' });
    imageButton.setAttribute('aria-label', t('chat.header.attachImage'));
    setIcon(imageButton, 'image');
    imageButton.addEventListener('click', () => this.openImagePicker());

    this.textarea = row.createEl('textarea', { cls: 'midian-textarea', attr: { rows: '1' } });
    this.textarea.setAttribute('placeholder', t('chat.placeholder'));
    this.textarea.setAttribute('enterkeyhint', 'send');
    this.textarea.addEventListener('keydown', (ev) => this.onKeyDown(ev));
    this.textarea.addEventListener('input', () => {
      this.autoGrow();
      this.updateSlashMenu();
    });
    this.textarea.addEventListener('keyup', () => this.updateSlashMenu());
    this.textarea.addEventListener('blur', () => this.hideSlashMenu());

    this.activeNoteButton = row.createEl('button', { cls: 'midian-icon-button midian-active-toggle' });
    this.activeNoteButton.setAttribute('aria-label', t('chat.header.activeNote'));
    setIcon(this.activeNoteButton, 'file-text');
    this.updateActiveNoteToggle();
    this.activeNoteButton.addEventListener('click', () => {
      this.includeActiveNote = !this.includeActiveNote;
      this.updateActiveNoteToggle();
    });

    this.sendButton = row.createEl('button', { cls: 'midian-send-button' });
    this.sendButton.setAttribute('aria-label', t('chat.send'));
    setIcon(this.sendButton, 'arrow-up');
    this.sendButton.addEventListener('click', () => this.onSendButtonClick());

    this.updateHeader();
    this.renderWelcome();
  }

  private updateActiveNoteToggle(): void {
    this.activeNoteButton.toggleClass('is-active', this.includeActiveNote);
  }

  private onKeyDown(ev: KeyboardEvent): void {
    if (this.slashMenu.visible) {
      if (ev.key === 'ArrowDown') {
        ev.preventDefault();
        this.slashMenu.move(1);
        return;
      }
      if (ev.key === 'ArrowUp') {
        ev.preventDefault();
        this.slashMenu.move(-1);
        return;
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        this.hideSlashMenu();
        return;
      }
      if (ev.key === 'Enter' && !ev.isComposing) {
        ev.preventDefault();
        this.pickSlashCommand();
        return;
      }
    }
    if (ev.key !== 'Enter' || ev.isComposing) {
      return;
    }
    if (Platform.isMobile || !ev.shiftKey) {
      ev.preventDefault();
      void this.send();
    }
  }

  private updateSlashMenu(): void {
    const query = getSlashQuery(this.textarea.value, this.textarea.selectionStart ?? 0);
    this.slashQuery = query;
    this.slashMenu.update(query ? query.prefix : null);
  }

  private hideSlashMenu(): void {
    this.slashQuery = null;
    this.slashMenu.hide();
  }

  private pickSlashCommand(): void {
    this.slashMenu.pick();
  }

  private onSlashPick(command: SlashCommandDef): void {
    const query = this.slashQuery;
    this.hideSlashMenu();
    if (!query) {
      return;
    }
    const value = this.textarea.value;
    this.textarea.value = `${value.slice(0, query.start)}${command.template}`;
    this.autoGrow();
    this.textarea.focus();
    this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
  }

  private onSendButtonClick(): void {
    if (this.streaming) {
      this.abortController?.abort();
      return;
    }
    void this.send();
  }

  private autoGrow(): void {
    this.textarea.style.height = 'auto';
    this.textarea.style.height = `${Math.min(this.textarea.scrollHeight, 140)}px`;
  }

  private updateHeader(): void {
    const settings = this.getSettings();
    const config = settings[settings.provider];
    this.modelEl.setText(config.model ? `${settings.provider} · ${config.model}` : settings.provider);
    void this.renderTitle();
  }

  private openModelMenu(ev: MouseEvent): void {
    const settings = this.getSettings();
    const current = settings[settings.provider].model;
    const models = settings.provider === 'anthropic' ? ANTHROPIC_MODELS : OPENAI_MODELS;
    const menu = new Menu();
    for (const model of models) {
      menu.addItem((item) =>
        item
          .setTitle(model)
          .setChecked(model === current)
          .onClick(async () => {
            settings[settings.provider].model = model;
            await this.saveSettings();
            this.updateHeader();
            new Notice(t('chat.modelSaved'));
          }),
      );
    }
    menu.addSeparator();
    menu.addItem((item) =>
      item
        .setTitle(t('chat.customModel'))
        .setIcon('pencil')
        .onClick(() => this.promptCustomModel()),
    );
    menu.addItem((item) =>
      item
        .setTitle(settings.provider === 'anthropic' ? t('chat.switchToOpenai') : t('chat.switchToAnthropic'))
        .setIcon('refresh-cw')
        .onClick(async () => {
          settings.provider = settings.provider === 'anthropic' ? 'openai' : 'anthropic';
          await this.saveSettings();
          this.updateHeader();
          new Notice(t('chat.modelSaved'));
        }),
    );
    menu.showAtMouseEvent(ev);
  }

  private promptCustomModel(): void {
    const settings = this.getSettings();
    const current = settings[settings.provider].model;
    const modal = new Modal(this.app);
    modal.titleEl.setText(t('chat.customModelTitle'));
    const input = modal.contentEl.createEl('input', { type: 'text', cls: 'midian-custom-model-input' });
    input.value = current;
    const submit = async () => {
      const value = input.value.trim();
      modal.close();
      if (!value) {
        return;
      }
      settings[settings.provider].model = value;
      await this.saveSettings();
      this.updateHeader();
      new Notice(t('chat.modelSaved'));
    };
    input.addEventListener('keydown', (ev) => {
      if (ev.key === 'Enter' && !ev.isComposing) {
        ev.preventDefault();
        void submit();
      }
    });
    modal.open();
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 60);
  }

  private async renderTitle(): Promise<void> {
    this.titleEl.empty();
    if (!this.activeSessionId) {
      this.titleEl.setText(t('chat.title.new'));
      return;
    }
    const session = await this.store.load(this.activeSessionId);
    this.titleEl.setText(session?.title || t('chat.untitled'));
  }

  private async startTitleEdit(): Promise<void> {
    if (!this.activeSessionId || this.streaming) {
      return;
    }
    if (this.titleEl.querySelector('.midian-title-input')) {
      return;
    }
    const session = await this.store.load(this.activeSessionId);
    if (!session) {
      return;
    }
    this.titleEl.empty();
    const input = this.titleEl.createEl('input', { type: 'text', cls: 'midian-title-input' });
    input.value = session.title;
    let committed = false;
    const commit = async () => {
      if (committed) {
        return;
      }
      committed = true;
      const next = input.value.trim();
      if (next && next !== session.title) {
        session.title = next;
        session.updatedAt = Date.now();
        await this.store.save(session);
      }
      await this.renderTitle();
    };
    input.addEventListener('keydown', (ev) => {
      ev.stopPropagation();
      if (ev.key === 'Enter' && !ev.isComposing) {
        ev.preventDefault();
        void commit();
      } else if (ev.key === 'Escape') {
        void this.renderTitle();
      }
    });
    input.addEventListener('click', (ev) => ev.stopPropagation());
    input.addEventListener('blur', () => void commit());
    window.setTimeout(() => {
      input.focus();
      input.select();
    }, 30);
  }

  private renderWelcome(): void {
    void this.buildWelcome();
  }

  private async buildWelcome(): Promise<void> {
    const el = this.messagesEl.createDiv('midian-welcome');
    el.createDiv({ text: t('chat.welcome.title'), cls: 'midian-welcome-title' });
    el.createDiv({ text: t('chat.welcome.text'), cls: 'midian-welcome-text' });

    const settings = this.getSettings();
    const config = settings[settings.provider];
    if (!config.apiKey) {
      const setupButton = el.createEl('button', { cls: 'midian-welcome-button' });
      setupButton.setText(t('chat.openSettings'));
      setupButton.addEventListener('click', () => {
        const settingApi = (this.app as App & { setting?: { open: () => void; openTabById: (id: string) => void } })
          .setting;
        settingApi?.open();
        settingApi?.openTabById('midian');
      });
    }

    const recent = await this.store.list();
    if (!el.isConnected) {
      return;
    }
    const recentSessions = recent.slice(0, 5);
    if (recentSessions.length > 0) {
      el.createDiv({ text: t('chat.recent'), cls: 'midian-welcome-recent-title' });
      for (const session of recentSessions) {
        const item = el.createDiv('midian-welcome-recent-item');
        item.setText(session.title || t('chat.untitled'));
        item.addEventListener('click', () => void this.loadSession(session.id));
      }
    }
  }

  applySlashTemplate(key: string): void {
    const command = getSlashCommands().find((c) => c.key === key);
    if (!command) {
      return;
    }
    this.textarea.value = command.template;
    this.autoGrow();
    this.textarea.focus();
    this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
  }

  newSession(): void {
    if (this.streaming) {
      this.abortController?.abort();
    }
    this.activeSessionId = null;
    this.chips = [];
    this.imageChips = [];
    this.renderChips();
    this.autoApprove.clear();
    this.hideSlashMenu();
    this.messagesEl.empty();
    this.renderWelcome();
    this.updateHeader();
  }

  async loadSession(id: string): Promise<void> {
    if (this.streaming) {
      this.abortController?.abort();
    }
    this.activeSessionId = id;
    this.chips = [];
    this.imageChips = [];
    this.renderChips();
    this.autoApprove.clear();
    this.updateHeader();
    await this.renderSession();
  }

  private async renderSession(): Promise<void> {
    this.messagesEl.empty();
    if (!this.activeSessionId) {
      this.renderWelcome();
      return;
    }
    const session = await this.store.load(this.activeSessionId);
    if (!session) {
      this.activeSessionId = null;
      this.renderWelcome();
      return;
    }
    const messages = session.messages;
    let lastUserIndex = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i].role === 'user') {
        const rest = messages.slice(i + 1);
        if (rest.every((m) => m.role === 'assistant')) {
          lastUserIndex = i;
        }
        break;
      }
    }
    for (let i = 0; i < messages.length; i++) {
      const message = messages[i];
      if (message.role === 'user') {
        this.messagesEl.appendChild(
          buildUserMessageEl(message, this.app, i === lastUserIndex ? () => void this.editLastUserMessage(i) : undefined),
        );
      } else {
        this.messagesEl.appendChild(
          buildAssistantMessageEl(message, this.app, this, (content) => this.copyText(content)),
        );
      }
    }
    this.scrollToBottom();
  }

  private async editLastUserMessage(index: number): Promise<void> {
    if (this.streaming || !this.activeSessionId) {
      return;
    }
    const session = await this.store.load(this.activeSessionId);
    if (!session || index >= session.messages.length) {
      return;
    }
    const message = session.messages[index];
    session.messages = session.messages.slice(0, index);
    session.updatedAt = Date.now();
    await this.store.save(session);
    this.textarea.value = message.content;
    this.autoGrow();
    this.imageChips = message.images ? [...message.images] : [];
    this.renderChips();
    await this.renderSession();
    this.textarea.focus();
    this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
  }

  private openHistory(): void {
    new HistoryModal(this.app, this.store, {
      onOpen: (id) => void this.loadSession(id),
      onFork: (id) => void this.forkSession(id),
      onExport: (id) => void this.exportSession(id),
    }).open();
  }

  private async exportSession(id: string): Promise<void> {
    const session = await this.store.load(id);
    if (!session) {
      return;
    }
    const dir = 'Midian Exports';
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const path = normalizePath(`${dir}/${sanitizeFilename(session.title)} ${stamp}.md`);
    try {
      const file = await this.app.vault.create(path, buildExportMarkdown(session));
      await this.app.workspace.getLeaf('tab').openFile(file);
      new Notice(`${t('history.exported')}: ${path}`);
    } catch (error) {
      new Notice(error instanceof Error ? error.message : String(error));
    }
  }

  private async forkSession(id: string): Promise<void> {
    const source = await this.store.load(id);
    if (!source) {
      return;
    }
    const copy: MidianSession = {
      ...source,
      id: SessionStore.newId(),
      title: `${source.title}（副本）`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      messages: source.messages.map((m) => ({ ...m })),
    };
    await this.store.save(copy);
    await this.loadSession(copy.id);
    new Notice(t('history.forked'));
  }

  private async rewind(): Promise<void> {
    if (!this.activeSessionId || this.streaming) {
      return;
    }
    const session = await this.store.load(this.activeSessionId);
    if (!session || session.messages.length === 0) {
      return;
    }
    const last = session.messages[session.messages.length - 1];
    session.messages.pop();
    if (last.role === 'assistant' && session.messages.length > 0 && session.messages[session.messages.length - 1].role === 'user') {
      session.messages.pop();
    }
    session.updatedAt = Date.now();
    await this.store.save(session);
    await this.renderSession();
  }

  private openNotePicker(): void {
    new NotePickerModal(this.app, (path) => this.addChip(path)).open();
  }

  private openImagePicker(): void {
    new NotePickerModal(
      this.app,
      (path) => this.addImage(path),
      (file) => IMAGE_EXTENSIONS.includes(file.extension.toLowerCase()),
      () => this.app.vault.getFiles(),
    ).open();
  }

  private addChip(path: string): void {
    if (this.chips.some((chip) => chip.path === path)) {
      return;
    }
    this.chips.push({ path });
    this.renderChips();
  }

  attachNote(path: string): void {
    this.addChip(path);
  }

  sendSelection(text: string): void {
    this.textarea.value = text;
    this.autoGrow();
    this.textarea.focus();
    this.textarea.setSelectionRange(this.textarea.value.length, this.textarea.value.length);
  }

  private addImage(path: string): void {
    if (this.imageChips.includes(path)) {
      return;
    }
    this.imageChips.push(path);
    this.renderChips();
  }

  private renderChips(): void {
    this.chipsEl.empty();
    const hasContent = this.imageChips.length > 0 || this.chips.length > 0;
    if (!hasContent) {
      this.chipsEl.hide();
      return;
    }
    this.chipsEl.show();
    for (const path of this.imageChips) {
      const pill = this.chipsEl.createSpan('midian-chip midian-chip-image');
      const thumb = pill.createEl('img', { cls: 'midian-chip-thumb' });
      thumb.src = this.app.vault.adapter.getResourcePath(path);
      pill.createSpan('midian-chip-label').setText(path.split('/').pop() ?? path);
      const remove = pill.createEl('button', { cls: 'midian-chip-remove' });
      remove.setAttribute('aria-label', t('chat.removeChip'));
      setIcon(remove, 'x');
      remove.addEventListener('click', () => {
        this.imageChips = this.imageChips.filter((p) => p !== path);
        this.renderChips();
      });
    }
    for (const chip of this.chips) {
      const pill = this.chipsEl.createSpan('midian-chip');
      pill.createSpan('midian-chip-label').setText(`@${chip.path}`);
      const remove = pill.createEl('button', { cls: 'midian-chip-remove' });
      remove.setAttribute('aria-label', t('chat.removeChip'));
      setIcon(remove, 'x');
      remove.addEventListener('click', () => {
        this.chips = this.chips.filter((c) => c.path !== chip.path);
        this.renderChips();
      });
    }
  }

  private captureActiveNote(): ActiveNoteContext | null {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      return null;
    }
    let selection: string | null = null;
    if (this.getSettings().context.includeSelection) {
      const editor = this.app.workspace.activeEditor;
      const selected = editor?.editor?.getSelection();
      if (selected && selected.trim().length > 0) {
        selection = selected;
      }
    }
    return { path: file.path, selection };
  }

  private async send(): Promise<void> {
    if (this.streaming) {
      return;
    }
    const content = this.textarea.value.trim();
    if (!content && this.imageChips.length === 0) {
      return;
    }

    const settings = this.getSettings();
    const providerId: ProviderId = settings.provider;
    const config = settings[providerId];
    if (!config.apiKey) {
      new Notice(t('chat.error.noKey'));
      return;
    }
    if (!config.model.trim()) {
      new Notice(t('chat.error.noModel'));
      return;
    }

    let session: MidianSession | null = this.activeSessionId
      ? await this.store.load(this.activeSessionId)
      : null;
    if (!session) {
      session = {
        id: SessionStore.newId(),
        title: makeTitle(content || t('chat.imageOnly')),
        providerId,
        model: config.model,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        messages: [],
      };
      this.activeSessionId = session.id;
      this.updateHeader();
    }

    const imagePaths = [...this.imageChips];
    this.imageChips = [];
    this.renderChips();

    const userMessage: SessionMessage = {
      role: 'user',
      content,
      ...(imagePaths.length > 0 ? { images: imagePaths } : {}),
      createdAt: Date.now(),
    };
    session.messages.push(userMessage);
    session.updatedAt = Date.now();
    await this.store.save(session);

    const chips = [...this.chips];
    this.chips = [];
    this.renderChips();
    this.textarea.value = '';
    this.autoGrow();
    this.hideSlashMenu();
    this.messagesEl.appendChild(buildUserMessageEl(userMessage, this.app));
    this.scrollToBottom();

    const images = await this.loadImages(imagePaths);
    await this.streamAssistant(session, providerId, config, chips, images);
  }

  private async loadImages(paths: string[]): Promise<ChatImage[]> {
    const images: ChatImage[] = [];
    for (const path of paths) {
      const ext = path.split('.').pop()?.toLowerCase() ?? '';
      const mediaType = MEDIA_TYPES[ext];
      if (!mediaType) {
        continue;
      }
      try {
        const buffer = await this.app.vault.adapter.readBinary(path);
        if (buffer.byteLength > MAX_IMAGE_BYTES) {
          new Notice(`${path.split('/').pop() ?? path}: ${t('chat.imageTooLarge')}`);
          continue;
        }
        images.push({ mediaType, data: arrayBufferToBase64(buffer) });
      } catch {
        // skip unreadable images
      }
    }
    return images;
  }

  private async streamAssistant(
    session: MidianSession,
    providerId: ProviderId,
    config: ProviderConfig,
    chips: AttachChip[],
    images: ChatImage[],
  ): Promise<void> {
    const settings = this.getSettings();
    this.streaming = true;
    this.sendButton.addClass('is-streaming');
    setIcon(this.sendButton, 'square');
    this.sendButton.setAttribute('aria-label', t('chat.header.stop'));

    const { root: assistantEl, thinkingDetails, thinkingBody, markdownHost, pending } =
      buildAssistantStreamingEl();
    this.messagesEl.appendChild(assistantEl);
    this.scrollToBottom();

    let systemPrompt = '';
    try {
      const memory = settings.memory.enabled
        ? {
            profile: await this.memoryStore.read('user-profile.md'),
            shortTerm: await this.memoryStore.read('short-term.md'),
          }
        : { profile: '', shortTerm: '' };
      systemPrompt = await buildSystemPrompt(this.app, settings, {
        chips,
        activeNote: this.includeActiveNote ? this.captureActiveNote() : null,
        memory,
      });
    } catch {
      // context failure must not block the chat
      systemPrompt = '';
    }

    let thinking = '';
    let text = '';
    let started = false;
    const slot = new StreamingMarkdownSlot(this.app, markdownHost, '', this);
    let pendingMessages: Array<ChatMessage & { imagePaths?: string[] }> = session.messages.map((m) => ({
      role: m.role,
      content: m.content,
      ...(m.images && m.images.length > 0 ? { imagePaths: m.images } : {}),
    }));
    const historyLimit = settings.context.historyMessages;
    if (historyLimit > 0 && pendingMessages.length > historyLimit) {
      pendingMessages = pendingMessages.slice(pendingMessages.length - historyLimit);
      if (pendingMessages.length > 0 && pendingMessages[0].role === 'assistant') {
        pendingMessages = pendingMessages.slice(1);
      }
      systemPrompt = `${systemPrompt}\n\n${t('chat.contextTrimmed')}`;
    }
    const messages: ChatMessage[] = [];
    for (let i = 0; i < pendingMessages.length; i++) {
      const m = pendingMessages[i];
      const base: ChatMessage = { role: m.role, content: m.content };
      // Re-attach images from earlier turns so multi-turn chats keep vision context;
      // the newest message is filled below from the freshly loaded `images` payload.
      if (m.imagePaths && m.imagePaths.length > 0 && i < pendingMessages.length - 1) {
        base.images = await this.loadImages(m.imagePaths);
      }
      messages.push(base);
    }
    if (images.length > 0 && messages.length > 0) {
      messages[messages.length - 1].images = images;
    }
    const tools = settings.toolsEnabled ? VAULT_TOOLS : undefined;

    this.abortController = new AbortController();

    const markStarted = () => {
      if (!started) {
        started = true;
        pending.remove();
      }
    };

    const stopStreamingUi = () => {
      this.streaming = false;
      this.abortController = null;
      this.sendButton.removeClass('is-streaming');
      setIcon(this.sendButton, 'arrow-up');
      this.sendButton.setAttribute('aria-label', t('chat.send'));
    };

    const finish = async (usage?: Usage) => {
      slot.flush();
      if (thinking.length === 0) {
        thinkingDetails.remove();
      } else {
        thinkingDetails.removeAttribute('open');
      }
      this.clearPendingCards(assistantEl);
      const assistantMessage: SessionMessage = {
        role: 'assistant',
        content: text,
        thinking: thinking.length > 0 ? thinking : undefined,
        createdAt: Date.now(),
      };
      session.messages.push(assistantMessage);
      session.updatedAt = Date.now();
      await this.store.save(session);
      addActionRow(assistantEl, () => this.copyText(text));
      stopStreamingUi();
      void this.backgroundMemory(session, providerId, config);
      void this.autoTitle(session, providerId, config);
    };

    const fail = (error: Error) => {
      slot.flush();
      if (thinking.length === 0) {
        thinkingDetails.remove();
      }
      this.clearPendingCards(assistantEl);
      const errorRow = assistantEl.createDiv('midian-error-row');
      const message = error.message;
      const hint =
        /fetch|network|cors|ECONN|ETIMEDOUT|Failed to/i.test(message) ? `\n\n${t('chat.error.networkHint')}` : '';
      errorRow.appendChild(buildErrorEl(`${message}${hint}`));
      const retryButton = errorRow.createEl('button', { cls: 'midian-retry-button' });
      retryButton.setText(t('chat.retry'));
      retryButton.addEventListener('click', () => {
        assistantEl.remove();
        void this.streamAssistant(session, providerId, config, chips, images);
      });
      stopStreamingUi();
    };

    await runChat(
      providerId,
      config,
      messages,
      { systemPrompt, tools },
      {
        onThinkingDelta: (delta) => {
          markStarted();
          thinking += delta;
          thinkingBody.setText(thinking);
        },
        onTextDelta: (delta) => {
          markStarted();
          text += delta;
          slot.append(delta);
          this.scrollToBottomSoft();
        },
        onToolCall: (request) => {
          markStarted();
          return this.handleToolCall(assistantEl, request, this.abortController?.signal);
        },
        onDone: (usage) => void finish(usage),
        onError: (error) => fail(error),
      },
      this.abortController.signal,
    );

    if (this.streaming) {
      stopStreamingUi();
    }
  }

  private clearPendingCards(assistantEl: HTMLElement): void {
    for (const el of assistantEl.querySelectorAll('.midian-tool-call')) {
      const actions = el.querySelector('.midian-tool-call-actions') as HTMLElement | null;
      // completed cards have their actions hidden; only drop cards still awaiting a decision
      if (actions && actions.style.display !== 'none') {
        el.remove();
      }
    }
    for (const el of assistantEl.querySelectorAll('.midian-ask-user')) {
      el.remove();
    }
  }

  private async handleToolCall(
    anchor: HTMLElement,
    request: ToolCallRequest,
    signal?: AbortSignal,
  ): Promise<ToolCallOutcome> {
    if (request.name === 'ask_user') {
      return this.handleAskUser(anchor, request, signal);
    }
    const run = async () => {
      const result = await executeTool(this.app, request.name, request.arguments);
      return {
        approved: true,
        result: result.ok ? result.result : `错误: ${result.result}`,
        isError: !result.ok,
      };
    };
    if (this.autoApprove.has(request.name)) {
      return run();
    }
    return new Promise<ToolCallOutcome>((resolve) => {
      let settled = false;
      const settle = (outcome: ToolCallOutcome) => {
        if (settled) {
          return;
        }
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        resolve(outcome);
      };
      const onAbort = () => {
        card.setCancelled();
        settle({ approved: false, result: '', isError: true });
      };
      const card = createToolCallCard(request, {
        onApprove: (alwaysAllow) => {
          if (alwaysAllow) {
            this.autoApprove.add(request.name);
          }
          card.setRunning();
          void run().then(settle);
        },
        onDeny: () => {
          card.setDenied();
          settle({ approved: false, result: '', isError: true });
        },
      });
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      anchor.insertBefore(card.el, anchor.querySelector('.midian-assistant-body')?.nextSibling ?? null);
      this.scrollToBottom();
    });
  }

  private handleAskUser(
    anchor: HTMLElement,
    request: ToolCallRequest,
    signal?: AbortSignal,
  ): Promise<ToolCallOutcome> {
    const question = typeof request.arguments.question === 'string' ? request.arguments.question : '';
    const rawOptions = Array.isArray(request.arguments.options)
      ? request.arguments.options.filter((o): o is string => typeof o === 'string')
      : [];
    return new Promise<ToolCallOutcome>((resolve) => {
      let settled = false;
      const settle = (outcome: ToolCallOutcome) => {
        if (settled) {
          return;
        }
        settled = true;
        signal?.removeEventListener('abort', onAbort);
        resolve(outcome);
      };
      const onAbort = () => {
        card.remove();
        settle({ approved: false, result: '', isError: true });
      };
      const card = createAskUserCard(question, rawOptions.length > 0 ? rawOptions : undefined, (answer) => {
        card.remove();
        settle({ approved: true, result: `用户回答：${answer}`, isError: false });
      });
      if (signal) {
        if (signal.aborted) {
          onAbort();
          return;
        }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      anchor.insertBefore(card, anchor.querySelector('.midian-assistant-body')?.nextSibling ?? null);
      this.scrollToBottom();
    });
  }

  private async autoTitle(session: MidianSession, providerId: ProviderId, config: ProviderConfig): Promise<void> {
    try {
      if (session.messages.length !== 2) {
        return;
      }
      const firstUser = session.messages[0];
      if (!firstUser || firstUser.role !== 'user') {
        return;
      }
      if (session.title !== makeTitle(firstUser.content)) {
        return;
      }
      const settings = this.getSettings();
      const title = await generateTitle(providerId, config, settings.memory.model, firstUser.content, session.messages[1].content);
      if (title && title.length > 0 && title.length < 40 && title !== session.title) {
        // Apply atomically inside the write queue and bail out if the
        // conversation changed while generating (edit/rewind), so a stale
        // title never clobbers user edits.
        await this.store.mutate(session.id, (fresh) => {
          if (fresh.messages.length !== session.messages.length) {
            return;
          }
          fresh.title = title;
          fresh.updatedAt = Date.now();
        });
        await this.renderTitle();
      }
    } catch {
      // title generation is best-effort
    }
  }

  private async backgroundMemory(session: MidianSession, providerId: ProviderId, config: ProviderConfig): Promise<void> {
    const settings = this.getSettings();
    if (!settings.memory.enabled) {
      return;
    }
    try {
      const recent = session.messages.slice(-8).map((m) => ({ role: m.role, content: m.content }));
      const facts = await extractMemory(providerId, config, settings.memory.model, recent);
      if (facts && facts.trim() && facts.trim() !== '无') {
        const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
        await this.memoryStore.append('short-term.md', `### ${stamp} · ${session.title}\n${facts}`);
      }
      const lines = await this.memoryStore.lineCount('short-term.md');
      if (lines > CONSOLIDATE_AT_LINES) {
        const shortTerm = await this.memoryStore.read('short-term.md');
        const profile = await consolidateMemory(providerId, config, settings.memory.model, shortTerm);
        if (profile.trim()) {
          await this.memoryStore.write('user-profile.md', profile);
          await this.memoryStore.write('short-term.md', '');
        }
      }
    } catch {
      // memory is best-effort and must never break the chat
    }
  }

  private copyText(content: string): void {
    void navigator.clipboard
      .writeText(content)
      .then(() => new Notice(t('chat.copied')))
      .catch(() => new Notice(t('chat.copyFailed')));
  }

  private scrollToBottom(): void {
    this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
  }

  private scrollToBottomSoft(): void {
    const nearBottom =
      this.messagesEl.scrollHeight - this.messagesEl.scrollTop - this.messagesEl.clientHeight < 120;
    if (nearBottom) {
      this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
    }
  }
}
