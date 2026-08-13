import { test } from 'node:test';
import assert from 'node:assert/strict';
import { setLocale, t } from '../src/i18n/index.ts';

test('zh dictionary resolves keys', () => {
  setLocale('zh');
  assert.equal(t('chat.title.new'), '新对话');
  assert.equal(t('tool.approve'), '允许');
});

test('en dictionary resolves keys', () => {
  setLocale('en');
  assert.equal(t('chat.title.new'), 'New chat');
  assert.equal(t('tool.approve'), 'Allow');
});

test('missing key falls back to key', () => {
  setLocale('en');
  assert.equal(t('does.not.exist' as never), 'does.not.exist');
});
