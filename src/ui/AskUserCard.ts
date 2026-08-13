import { t } from '../i18n';

export function createAskUserCard(
  question: string,
  options: string[] | undefined,
  onAnswer: (answer: string) => void,
): HTMLElement {
  const el = document.createElement('div');
  el.addClass('midian-ask-user');
  el.createDiv('midian-ask-user-title').setText(t('tool.askQuestion'));
  el.createDiv('midian-ask-user-question').setText(question);
  if (options && options.length > 0) {
    const optionsRow = el.createDiv('midian-ask-user-options');
    for (const option of options.slice(0, 4)) {
      const button = optionsRow.createEl('button', { cls: 'midian-ask-user-option' });
      button.setText(option);
      button.addEventListener('click', () => onAnswer(option));
    }
  }
  const inputRow = el.createDiv('midian-ask-user-input-row');
  const input = inputRow.createEl('input', {
    type: 'text',
    attr: { placeholder: t('tool.askPlaceholder') },
  });
  const submit = inputRow.createEl('button', { cls: 'midian-tool-btn' });
  submit.setText(t('tool.askSubmit'));
  const submitAnswer = () => {
    const value = input.value.trim();
    if (value) {
      onAnswer(value);
    }
  };
  submit.addEventListener('click', submitAnswer);
  input.addEventListener('keydown', (ev) => {
    if (ev.key === 'Enter' && !ev.isComposing) {
      ev.preventDefault();
      submitAnswer();
    }
  });
  return el;
}
