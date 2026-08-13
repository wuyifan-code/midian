import { setIcon } from 'obsidian';
import { t, type LocaleKey } from '../i18n';

export interface SlashCommandDef {
  key: string;
  icon: string;
  label: string;
  template: string;
}

export function getSlashCommands(): SlashCommandDef[] {
  const defs = [
    { key: 'summarize', icon: 'list' },
    { key: 'rewrite', icon: 'pen-line' },
    { key: 'translate-en', icon: 'languages' },
    { key: 'translate-zh', icon: 'languages' },
    { key: 'explain', icon: 'help-circle' },
    { key: 'continue', icon: 'arrow-right' },
    { key: 'brainstorm', icon: 'lightbulb' },
  ];
  return defs.map((def) => ({
    key: def.key,
    icon: def.icon,
    label: t(`slash.${def.key}` as LocaleKey),
    template: t(`slash.${def.key}.template` as LocaleKey),
  }));
}

export class SlashMenu {
  private items: SlashCommandDef[] = [];
  private selected = 0;

  constructor(
    private readonly parent: HTMLElement,
    private readonly onPick: (command: SlashCommandDef) => void,
  ) {
    this.el = parent.createDiv('midian-slash-menu');
    this.el.hide();
  }

  readonly el: HTMLElement;

  get visible(): boolean {
    return !this.el.hasClass('is-hidden') && this.items.length > 0;
  }

  update(rawPrefix: string | null): void {
    if (rawPrefix === null) {
      this.items = [];
      this.selected = 0;
      this.render();
      return;
    }
    this.items = getSlashCommands().filter((command) => command.key.includes(rawPrefix));
    this.selected = 0;
    this.render();
  }

  move(delta: number): void {
    if (this.items.length === 0) {
      return;
    }
    this.selected = (this.selected + delta + this.items.length) % this.items.length;
    this.render();
  }

  pick(): void {
    if (this.items.length > 0) {
      this.onPick(this.items[this.selected]);
    }
  }

  hide(): void {
    this.items = [];
    this.render();
  }

  private render(): void {
    this.el.empty();
    if (this.items.length === 0) {
      this.el.hide();
      return;
    }
    this.el.show();
    this.items.forEach((command, index) => {
      const item = this.el.createDiv(`midian-slash-item${index === this.selected ? ' is-selected' : ''}`);
      const icon = item.createSpan('midian-slash-icon');
      setIcon(icon, command.icon);
      const text = item.createDiv('midian-slash-text');
      text.createDiv('midian-slash-label').setText(command.label);
      text.createDiv('midian-slash-desc').setText(command.template.slice(0, 40));
      item.addEventListener('mousedown', (ev) => {
        ev.preventDefault();
        this.onPick(command);
      });
      item.addEventListener('touchstart', () => this.onPick(command), { passive: true });
    });
  }
}
