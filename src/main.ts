import { Plugin, TFile } from 'obsidian';
import { detectLocale, setLocale, t } from './i18n';
import { SessionStore } from './sessions/store';
import { DEFAULT_SETTINGS, type MidianSettings } from './settings/types';
import { MidianSettingsTab } from './settings/MidianSettingsTab';
import { MidianChatView, VIEW_TYPE_MIDIAN } from './ui/ChatView';

export default class MidianPlugin extends Plugin {
  settings: MidianSettings = DEFAULT_SETTINGS;
  private store!: SessionStore;

  async onload(): Promise<void> {
    this.store = new SessionStore(this.app.vault);

    const data = (await this.loadData()) as Partial<MidianSettings> | null;
    this.settings = {
      ...DEFAULT_SETTINGS,
      ...(data ?? {}),
      anthropic: { ...DEFAULT_SETTINGS.anthropic, ...(data?.anthropic ?? {}) },
      openai: { ...DEFAULT_SETTINGS.openai, ...(data?.openai ?? {}) },
      context: { ...DEFAULT_SETTINGS.context, ...(data?.context ?? {}) },
      memory: { ...DEFAULT_SETTINGS.memory, ...(data?.memory ?? {}) },
    };
    this.applyLocale();

    this.registerView(VIEW_TYPE_MIDIAN, (leaf) => new MidianChatView(leaf, this.store, () => this.settings, () => this.saveSettings()));

    this.addRibbonIcon('message-circle', '打开 Midian', () => void this.activateView());
    this.addCommand({
      id: 'open-midian-chat',
      name: '打开 Midian 聊天',
      callback: () => void this.activateView(),
    });
    this.addCommand({
      id: 'new-midian-session',
      name: '新建 Midian 对话',
      callback: () => void this.openNewSession(),
    });
    this.addCommand({
      id: 'midian-summarize-current-note',
      name: '总结当前笔记（Midian）',
      callback: () => void this.openWithTemplate('summarize'),
    });
    this.addCommand({
      id: 'midian-rewrite-current-note',
      name: '改写当前笔记（Midian）',
      callback: () => void this.openWithTemplate('rewrite'),
    });
    this.addCommand({
      id: 'midian-translate-current-note',
      name: '翻译当前笔记（Midian）',
      callback: () => void this.openWithTemplate('translate-en'),
    });

    this.addSettingTab(new MidianSettingsTab(this.app, this));

    this.registerEvent(
      this.app.workspace.on('file-menu', (menu, file) => {
        if (!(file instanceof TFile) || file.extension !== 'md') {
          return;
        }
        menu.addItem((item) =>
          item
            .setTitle(t('menu.discuss'))
            .setIcon('message-circle')
            .onClick(async () => {
              const view = await this.activateView();
              view?.attachNote(file.path);
            }),
        );
      }),
    );

    this.registerEvent(
      this.app.workspace.on('editor-menu', (menu, editor) => {
        const selection = editor.getSelection();
        if (!selection || !selection.trim()) {
          return;
        }
        menu.addItem((item) =>
          item
            .setTitle(t('menu.sendSelection'))
            .setIcon('message-circle')
            .onClick(async () => {
              const view = await this.activateView();
              view?.sendSelection(selection);
            }),
        );
      }),
    );
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
    this.applyLocale();
  }

  private applyLocale(): void {
    const language = this.settings.language;
    setLocale(language === 'auto' ? detectLocale() : language);
  }

  private async activateView(): Promise<MidianChatView | null> {
    const existing = this.app.workspace.getLeavesOfType(VIEW_TYPE_MIDIAN);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return existing[0].view instanceof MidianChatView ? existing[0].view : null;
    }
    const leaf = this.app.workspace.getLeaf('tab');
    await leaf.setViewState({ type: VIEW_TYPE_MIDIAN, active: true });
    this.app.workspace.revealLeaf(leaf);
    return leaf.view instanceof MidianChatView ? leaf.view : null;
  }

  private async openNewSession(): Promise<void> {
    const view = await this.activateView();
    view?.newSession();
  }

  private async openWithTemplate(key: string): Promise<void> {
    const view = await this.activateView();
    view?.applySlashTemplate(key);
  }
}
