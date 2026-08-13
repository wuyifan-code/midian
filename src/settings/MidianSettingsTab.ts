import { App, Notice, PluginSettingTab, Setting } from 'obsidian';
import { t } from '../i18n';
import type { ProviderId } from '../providers/types';
import { testConnection } from '../providers/testConnection';
import type { LanguageSetting } from './types';
import type MidianPlugin from '../main';

export class MidianSettingsTab extends PluginSettingTab {
  constructor(
    app: App,
    private readonly plugin: MidianPlugin,
  ) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    const settings = this.plugin.settings;

    containerEl.createEl('h3', { text: 'Provider' });
    new Setting(containerEl)
      .setName(t('settings.provider'))
      .setDesc(t('settings.provider.desc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption('anthropic', t('settings.anthropic'))
          .addOption('openai', t('settings.openai'))
          .setValue(settings.provider)
          .onChange(async (value) => {
            settings.provider = value as ProviderId;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl('h3', { text: t('settings.anthropic') });
    this.addApiKeySetting(
      containerEl,
      t('settings.apiKey'),
      t('settings.apiKey.anthropic.desc'),
      () => settings.anthropic.apiKey,
      (value) => {
        settings.anthropic.apiKey = value;
      },
    );
    new Setting(containerEl)
      .setName(t('settings.baseUrl'))
      .setDesc(t('settings.baseUrl.anthropic.desc'))
      .addText((text) =>
        text
          .setPlaceholder('https://api.anthropic.com')
          .setValue(settings.anthropic.baseUrl)
          .onChange(async (value) => {
            settings.anthropic.baseUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName(t('settings.model'))
      .addText((text) =>
        text
          .setPlaceholder('claude-sonnet-4-5')
          .setValue(settings.anthropic.model)
          .onChange(async (value) => {
            settings.anthropic.model = value.trim();
            await this.plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName(t('settings.maxTokens'))
      .addText((text) => {
        text.inputEl.type = 'number';
        text.setValue(String(settings.anthropic.maxTokens)).onChange(async (value) => {
          const parsed = parseInt(value, 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            settings.anthropic.maxTokens = parsed;
            await this.plugin.saveSettings();
          }
        });
      });

    containerEl.createEl('h3', { text: t('settings.openai') });
    this.addApiKeySetting(
      containerEl,
      t('settings.apiKey'),
      t('settings.apiKey.openai.desc'),
      () => settings.openai.apiKey,
      (value) => {
        settings.openai.apiKey = value;
      },
    );
    new Setting(containerEl)
      .setName(t('settings.baseUrl'))
      .setDesc(t('settings.baseUrl.openai.desc'))
      .addText((text) =>
        text
          .setPlaceholder('https://api.openai.com/v1')
          .setValue(settings.openai.baseUrl)
          .onChange(async (value) => {
            settings.openai.baseUrl = value.trim();
            await this.plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName(t('settings.model'))
      .setDesc(t('settings.model.desc'))
      .addText((text) =>
        text
          .setPlaceholder('deepseek-chat / moonshot-v1-8k')
          .setValue(settings.openai.model)
          .onChange(async (value) => {
            settings.openai.model = value.trim();
            await this.plugin.saveSettings();
          }),
      );
    new Setting(containerEl)
      .setName(t('settings.maxTokens'))
      .addText((text) => {
        text.inputEl.type = 'number';
        text.setValue(String(settings.openai.maxTokens)).onChange(async (value) => {
          const parsed = parseInt(value, 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            settings.openai.maxTokens = parsed;
            await this.plugin.saveSettings();
          }
        });
      });

    containerEl.createEl('h3', { text: t('settings.persona') });
    new Setting(containerEl)
      .setName(t('settings.persona'))
      .setDesc(t('settings.persona.desc'))
      .addTextArea((area) =>
        area
          .setPlaceholder('你是 Midian……')
          .setValue(settings.persona)
          .onChange(async (value) => {
            settings.persona = value;
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl('h3', { text: t('settings.context') });
    new Setting(containerEl)
      .setName(t('settings.includeActiveNote'))
      .setDesc(t('settings.includeActiveNote.desc'))
      .addToggle((toggle) =>
        toggle.setValue(settings.context.includeActiveNote).onChange(async (value) => {
          settings.context.includeActiveNote = value;
          await this.plugin.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName(t('settings.includeSelection'))
      .setDesc(t('settings.includeSelection.desc'))
      .addToggle((toggle) =>
        toggle.setValue(settings.context.includeSelection).onChange(async (value) => {
          settings.context.includeSelection = value;
          await this.plugin.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName(t('settings.budgetChars'))
      .setDesc(t('settings.budgetChars.desc'))
      .addText((text) => {
        text.inputEl.type = 'number';
        text.setValue(String(settings.context.budgetChars)).onChange(async (value) => {
          const parsed = parseInt(value, 10);
          if (!Number.isNaN(parsed) && parsed > 0) {
            settings.context.budgetChars = parsed;
            await this.plugin.saveSettings();
          }
        });
      });
    new Setting(containerEl)
      .setName(t('settings.historyMessages'))
      .setDesc(t('settings.historyMessages.desc'))
      .addText((text) => {
        text.inputEl.type = 'number';
        text.setValue(String(settings.context.historyMessages)).onChange(async (value) => {
          const parsed = parseInt(value, 10);
          if (!Number.isNaN(parsed) && parsed >= 0) {
            settings.context.historyMessages = parsed;
            await this.plugin.saveSettings();
          }
        });
      });

    containerEl.createEl('h3', { text: t('settings.testConnection') });
    new Setting(containerEl)
      .setName(t('settings.testConnection'))
      .setDesc(t('settings.testConnection.desc'))
      .addButton((button) => {
        button.setButtonText(t('settings.test')).onClick(async () => {
          button.setButtonText(t('settings.testing'));
          button.setDisabled(true);
          try {
            const result = await testConnection(settings.provider, settings[settings.provider]);
            new Notice(result);
          } finally {
            button.setButtonText(t('settings.test'));
            button.setDisabled(false);
          }
        });
      });

    containerEl.createEl('h3', { text: t('settings.tools') });
    new Setting(containerEl)
      .setName(t('settings.toolsEnabled'))
      .setDesc(t('settings.toolsEnabled.desc'))
      .addToggle((toggle) =>
        toggle.setValue(settings.toolsEnabled).onChange(async (value) => {
          settings.toolsEnabled = value;
          await this.plugin.saveSettings();
        }),
      );

    containerEl.createEl('h3', { text: t('settings.memory') });
    new Setting(containerEl)
      .setName(t('settings.memoryEnabled'))
      .setDesc(t('settings.memoryEnabled.desc'))
      .addToggle((toggle) =>
        toggle.setValue(settings.memory.enabled).onChange(async (value) => {
          settings.memory.enabled = value;
          await this.plugin.saveSettings();
        }),
      );
    new Setting(containerEl)
      .setName(t('settings.memoryModel'))
      .setDesc(t('settings.memoryModel.desc'))
      .addText((text) =>
        text
          .setPlaceholder('claude-haiku-4-5 / deepseek-chat')
          .setValue(settings.memory.model)
          .onChange(async (value) => {
            settings.memory.model = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    containerEl.createEl('h3', { text: t('settings.language') });
    new Setting(containerEl)
      .setName(t('settings.language'))
      .setDesc(t('settings.language.desc'))
      .addDropdown((dropdown) =>
        dropdown
          .addOption('auto', t('settings.language.auto'))
          .addOption('zh', t('settings.language.zh'))
          .addOption('en', t('settings.language.en'))
          .setValue(settings.language)
          .onChange(async (value) => {
            settings.language = value as LanguageSetting;
            await this.plugin.saveSettings();
          }),
      );
  }

  private addApiKeySetting(
    containerEl: HTMLElement,
    name: string,
    desc: string,
    get: () => string,
    set: (value: string) => void,
  ): void {
    let inputEl: HTMLInputElement | null = null;
    new Setting(containerEl)
      .setName(name)
      .setDesc(desc)
      .addText((text) => {
        inputEl = text.inputEl;
        inputEl.type = 'password';
        text.setPlaceholder('sk-…').setValue(get());
        text.onChange(async (value) => {
          set(value.trim());
          await this.plugin.saveSettings();
        });
      })
      .addExtraButton((button) => {
        let visible = false;
        button.setIcon('eye').setTooltip(t('settings.showKey'));
        button.onClick(() => {
          if (!inputEl) {
            return;
          }
          visible = !visible;
          inputEl.type = visible ? 'text' : 'password';
          button.setIcon(visible ? 'eye-off' : 'eye');
          button.setTooltip(visible ? t('settings.hideKey') : t('settings.showKey'));
        });
      });
  }
}
