import { App, Component, MarkdownRenderer, setIcon } from 'obsidian';
import { t } from '../i18n';
import type { SessionMessage } from '../sessions/types';

export function buildUserMessageEl(
  message: SessionMessage,
  app: App,
  onEdit?: () => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.addClass('midian-message', 'midian-user');
  if (message.images && message.images.length > 0) {
    const imageRow = wrap.createDiv('midian-user-images');
    for (const path of message.images) {
      const img = imageRow.createEl('img', { cls: 'midian-user-image' });
      img.src = app.vault.adapter.getResourcePath(path);
    }
  }
  const bubble = wrap.createDiv('midian-bubble');
  bubble.createDiv('midian-bubble-text').setText(message.content);
  if (onEdit) {
    const actions = wrap.createDiv('midian-actions');
    const button = actions.createEl('button', { cls: 'midian-icon-button midian-action-button' });
    button.setAttribute('aria-label', t('chat.edit'));
    setIcon(button, 'pencil');
    button.addEventListener('click', () => onEdit());
  }
  return wrap;
}

export function buildAssistantMessageEl(
  message: SessionMessage,
  app: App,
  parent: Component,
  onCopy: (content: string) => void,
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.addClass('midian-message', 'midian-assistant');
  const body = wrap.createDiv('midian-assistant-body');
  if (message.thinking) {
    const details = body.createEl('details', { cls: 'midian-thinking' });
    details.createEl('summary', { text: t('chat.thinking') });
    details.createDiv('midian-thinking-body').setText(message.thinking);
  }
  const host = body.createDiv('midian-markdown-host');
  void MarkdownRenderer.render(app, message.content || '', host, '', parent).then(() =>
    attachCodeCopyButtons(host),
  );
  addActionRow(wrap, () => onCopy(message.content));
  return wrap;
}

export function buildAssistantStreamingEl(): {
  root: HTMLElement;
  thinkingDetails: HTMLElement;
  thinkingBody: HTMLElement;
  markdownHost: HTMLElement;
  pending: HTMLElement;
} {
  const wrap = document.createElement('div');
  wrap.addClass('midian-message', 'midian-assistant');
  const body = wrap.createDiv('midian-assistant-body');
  const details = body.createEl('details', { cls: 'midian-thinking', attr: { open: 'open' } });
  details.createEl('summary', { text: t('chat.thinking') });
  const thinkingBody = details.createDiv('midian-thinking-body');
  const markdownHost = body.createDiv('midian-markdown-host');
  const pending = markdownHost.createDiv('midian-pending');
  pending.setText(t('chat.pending'));
  return { root: wrap, thinkingDetails: details, thinkingBody, markdownHost, pending };
}

export function buildErrorEl(text: string): HTMLElement {
  const el = document.createElement('div');
  el.addClass('midian-error');
  el.setText(text);
  return el;
}

export function addActionRow(messageEl: HTMLElement, onCopy: () => void): void {
  const row = messageEl.createDiv('midian-actions');
  const button = row.createEl('button', { cls: 'midian-icon-button midian-action-button' });
  button.setAttribute('aria-label', t('chat.copy'));
  setIcon(button, 'copy');
  button.addEventListener('click', () => onCopy());
}

export function attachCodeCopyButtons(host: HTMLElement): void {
  for (const pre of host.querySelectorAll('pre')) {
    if (pre.closest('.midian-code-block')) {
      continue;
    }
    const container = document.createElement('div');
    container.addClass('midian-code-block');
    pre.before(container);
    container.appendChild(pre);
    const button = container.createEl('button', { cls: 'midian-code-copy' });
    button.setAttribute('aria-label', t('chat.copy'));
    setIcon(button, 'copy');
    button.addEventListener('click', () => {
      void navigator.clipboard
        .writeText(pre.textContent ?? '')
        .then(() => {
          setIcon(button, 'check');
          window.setTimeout(() => setIcon(button, 'copy'), 1500);
        })
        .catch(() => {});
    });
  }
}

export class StreamingMarkdownSlot {
  private buffer = '';
  private timer: number | null = null;
  private component: Component = new Component();

  constructor(
    private readonly app: App,
    private readonly host: HTMLElement,
    private readonly sourcePath: string,
    private readonly parent: Component,
  ) {}

  append(delta: string): void {
    this.buffer += delta;
    if (this.timer === null) {
      this.timer = window.setTimeout(() => {
        this.timer = null;
        void this.render();
      }, 120);
    }
  }

  flush(): void {
    if (this.timer !== null) {
      window.clearTimeout(this.timer);
      this.timer = null;
    }
    void this.render();
  }

  private async render(): Promise<void> {
    this.component.unload();
    this.host.empty();
    const target = this.host.createDiv('midian-markdown');
    this.component = new Component();
    this.parent.addChild(this.component);
    await MarkdownRenderer.render(this.app, this.buffer, target, this.sourcePath, this.component);
    attachCodeCopyButtons(target);
  }
}
