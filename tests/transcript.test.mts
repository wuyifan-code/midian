import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderTranscript, stripFences } from '../src/memory/transcript.ts';

test('renderTranscript labels user and assistant turns', () => {
  const out = renderTranscript([
    { role: 'user', content: 'hi' },
    { role: 'assistant', content: 'hello' },
  ]);
  assert.equal(out, '用户: hi\n助手: hello');
});

test('renderTranscript handles an empty transcript', () => {
  assert.equal(renderTranscript([]), '');
});

test('stripFences removes markdown fences', () => {
  assert.equal(stripFences('```markdown\nline1\nline2\n```'), 'line1\nline2');
});

test('stripFences removes plain and json fences', () => {
  assert.equal(stripFences('```\nplain\n```'), 'plain');
  assert.equal(stripFences('```json\n{"a":1}\n```'), '{"a":1}');
});

test('stripFences leaves plain text untouched', () => {
  assert.equal(stripFences('just text'), 'just text');
});

test('stripFences trims surrounding whitespace', () => {
  assert.equal(stripFences('  hello  '), 'hello');
});
