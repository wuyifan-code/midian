import { App, Modal, type TFile } from 'obsidian';
import { t } from '../i18n';

export class NotePickerModal extends Modal {
  constructor(
    app: App,
    private readonly onPick: (path: string) => void,
    private readonly filter?: (file: TFile) => boolean,
    private readonly fileSource?: () => TFile[],
  ) {
    super(app);
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.addClass('midian-picker');
    const input = contentEl.createEl('input', {
      type: 'text',
      cls: 'midian-picker-input',
      attr: { placeholder: t('picker.placeholder') },
    });
    const list = contentEl.createDiv('midian-picker-list');

    const render = (query: string) => {
      list.empty();
      const q = query.toLowerCase();
      const source = this.fileSource ? this.fileSource() : this.app.vault.getMarkdownFiles();
      const files = source
        .filter((f) => (!this.filter || this.filter(f)) && (!q || f.path.toLowerCase().includes(q)))
        .slice(0, 30);
      if (files.length === 0) {
        list.createDiv({ cls: 'midian-picker-empty', text: t('picker.empty') });
        return;
      }
      for (const file of files) {
        const item = list.createDiv('midian-picker-item');
        item.setText(file.path);
        item.addEventListener('click', () => {
          this.close();
          this.onPick(file.path);
        });
      }
    };

    render('');
    input.addEventListener('input', () => render(input.value));
    window.setTimeout(() => input.focus(), 60);
  }

  onClose(): void {
    this.contentEl.empty();
  }
}
