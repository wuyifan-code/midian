import { setIcon } from 'obsidian';
import { t } from '../i18n';
import type { ToolCallRequest } from '../providers/types';

export interface ToolCallCardHandlers {
  onApprove: (alwaysAllow: boolean) => void;
  onDeny: () => void;
}

export interface ToolCallCard {
  el: HTMLElement;
  setRunning: () => void;
  setResult: (text: string, isError: boolean) => void;
  setDenied: () => void;
  setCancelled: () => void;
}

export function createToolCallCard(request: ToolCallRequest, handlers: ToolCallCardHandlers): ToolCallCard {
  const el = document.createElement('div');
  el.addClass('midian-tool-call');

  const header = el.createDiv('midian-tool-call-header');
  const icon = header.createSpan('midian-tool-call-icon');
  setIcon(icon, 'wrench');
  header.createSpan('midian-tool-call-name').setText(request.name);
  const status = header.createSpan('midian-tool-call-status');

  const argsDetails = el.createEl('details', { cls: 'midian-tool-call-args' });
  argsDetails.createEl('summary', { text: t('tool.args') });
  argsDetails
    .createDiv('midian-tool-call-args-body')
    .setText(JSON.stringify(request.arguments, null, 2));

  const resultEl = el.createDiv('midian-tool-call-result');
  resultEl.hide();

  const actions = el.createDiv('midian-tool-call-actions');
  const approveButton = actions.createEl('button', { cls: 'midian-tool-btn' });
  approveButton.setText(t('tool.approve'));
  const alwaysLabel = actions.createEl('label', { cls: 'midian-tool-always' });
  const checkbox = alwaysLabel.createEl('input', { type: 'checkbox' });
  alwaysLabel.appendText(` ${t('tool.alwaysAllow')}`);
  const denyButton = actions.createEl('button', { cls: 'midian-tool-btn midian-tool-deny' });
  denyButton.setText(t('tool.deny'));

  approveButton.addEventListener('click', () => handlers.onApprove(checkbox.checked));
  denyButton.addEventListener('click', () => handlers.onDeny());

  return {
    el,
    setRunning() {
      actions.hide();
      status.setText(t('tool.running'));
    },
    setResult(text, isError) {
      actions.hide();
      status.setText(isError ? t('tool.failed') : t('tool.done'));
      resultEl.setText(text);
      resultEl.show();
    },
    setDenied() {
      actions.hide();
      status.setText(t('tool.denied'));
    },
    setCancelled() {
      actions.hide();
      status.setText(t('tool.cancelled'));
    },
  };
}
