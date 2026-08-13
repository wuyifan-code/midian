import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildExportMarkdown, sanitizeFilename } from '../src/utils/exportMarkdown.ts';
import type { MidianSession } from '../src/sessions/types.ts';

function makeSession(partial: Partial<MidianSession> = {}): MidianSession {
  return {
    id: 's1',
    title: 'Test chat',
    providerId: 'anthropic',
    model: 'claude-sonnet-4-5',
    createdAt: 0,
    updatedAt: 0,
    messages: [],
    ...partial,
  };
}

test('sanitizeFilename strips illegal characters', () => {
  assert.equal(sanitizeFilename('a/b\\c:d*e?f"g<h>i|j'), 'a-b-c-d-e-f-g-h-i-j');
  assert.equal(sanitizeFilename('   '), 'conversation');
});

test('buildExportMarkdown renders header and metadata', () => {
  const out = buildExportMarkdown(
    makeSession({ title: 'My chat', messages: [{ role: 'user', content: 'hi', createdAt: 0 }] }),
  );
  assert.ok(out.startsWith('# My chat\n'));
  assert.ok(out.includes('anthropic · claude-sonnet-4-5'));
  assert.ok(out.includes('## 用户'));
  assert.ok(out.includes('hi'));
});

test('buildExportMarkdown renders thinking as blockquote and images as embeds', () => {
  const out = buildExportMarkdown(
    makeSession({
      messages: [
        { role: 'user', content: 'look', images: ['img/a.png'], createdAt: 0 },
        { role: 'assistant', content: 'answer', thinking: 'line1\nline2', createdAt: 0 },
      ],
    }),
  );
  assert.ok(out.includes('![[img/a.png]]'));
  assert.ok(out.includes('> 思考过程：'));
  assert.ok(out.includes('> line2'));
  assert.ok(out.includes('## Midian'));
  assert.ok(out.includes('answer'));
});
