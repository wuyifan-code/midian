import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createSseParser } from '../src/network/sse.ts';
import type { SseEvent } from '../src/network/sse.ts';

function collect(chunks: string[]): SseEvent[] {
  const events: SseEvent[] = [];
  const { feed, finish } = createSseParser((ev) => events.push(ev));
  for (const chunk of chunks) {
    feed(chunk);
  }
  finish();
  return events;
}

test('parses a simple data event', () => {
  assert.deepEqual(collect(['data: hello\n\n']), [{ event: 'message', data: 'hello' }]);
});

test('handles chunked delivery across boundaries', () => {
  assert.deepEqual(
    collect(['da', 'ta: {"a":', '1}\n', '\n']),
    [{ event: 'message', data: '{"a":1}' }],
  );
});

test('handles named events', () => {
  assert.deepEqual(collect(['event: ping\ndata: {}\n\n']), [{ event: 'ping', data: '{}' }]);
});

test('joins multi-line data with newline', () => {
  assert.deepEqual(collect(['data: line1\ndata: line2\n\n']), [
    { event: 'message', data: 'line1\nline2' },
  ]);
});

test('ignores comments and empty dispatches', () => {
  assert.deepEqual(collect([': comment\n\n', '\n']), []);
});

test('handles CRLF line endings', () => {
  assert.deepEqual(collect(['data: a\r\n\r\n']), [{ event: 'message', data: 'a' }]);
});

test('strips a single leading space after colon', () => {
  assert.deepEqual(collect(['data:  spaced\n\n']), [{ event: 'message', data: ' spaced' }]);
});

test('flushes a trailing event without blank line', () => {
  assert.deepEqual(collect(['data: tail']), [{ event: 'message', data: 'tail' }]);
});

test('multiple events in one chunk', () => {
  assert.deepEqual(collect(['data: a\n\ndata: b\n\n']), [
    { event: 'message', data: 'a' },
    { event: 'message', data: 'b' },
  ]);
});
