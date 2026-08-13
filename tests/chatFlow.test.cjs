'use strict';
// Chat flow test: drives the real ChatView UI logic end-to-end without a
// browser. A minimal DOM shim stands in for the document, a stubbed global
// fetch serves canned SSE, and the real SessionStore / MemoryStore / tool
// dispatcher run against the in-memory MockAdapter.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { installObsidianMock, registered, FakeEl } = require('./obsidianMock.cjs');
const { MockAdapter } = require('./mockVault.mts');
const { SessionStore } = require('../src/sessions/store.ts');

const root = path.resolve(__dirname, '..');
installObsidianMock();

// --- global shims ----------------------------------------------------
globalThis.document = { createElement: (tag) => new FakeEl(tag) };
globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};
if (!globalThis.navigator) {
  globalThis.navigator = { language: 'en' };
}

async function waitFor(cond, timeoutMs = 2000) {
  const start = Date.now();
  while (!cond()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error('waitFor timed out');
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

// --- global shims ----------------------------------------------------
const originalFetch = globalThis.fetch;
globalThis.document = { createElement: (tag) => new FakeEl(tag) };
globalThis.window = {
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (id) => clearTimeout(id),
};
if (!globalThis.navigator) {
  globalThis.navigator = { language: 'en' };
}

// --- bundle ----------------------------------------------------------
const esbuild = require('esbuild');

let ChatViewClass = null;
let view = null;
const adapter = new MockAdapter();
const settings = {
  provider: 'anthropic',
  anthropic: { apiKey: 'test-key', baseUrl: 'http://127.0.0.1:9', model: 'test-model', maxTokens: 100 },
  openai: { apiKey: 'test-key', baseUrl: 'http://127.0.0.1:9', model: 'test-model', maxTokens: 100 },
  persona: '',
  toolsEnabled: true,
  context: { includeActiveNote: false, includeSelection: false, budgetChars: 16000, historyMessages: 40 },
  memory: { enabled: false, model: '' },
  language: 'auto',
};
let fetchCalls = 0;
const requestBodies = [];

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function sseForRound(round) {
  if (round > 2) {
    // Background auto-title call: respond with no text so no title is set.
    return sse('message_start', { type: 'message_start', message: { usage: { input_tokens: 1 } } }) +
      sse('message_stop', { type: 'message_stop' });
  }
  if (round === 1) {
    return [
      sse('message_start', { type: 'message_start', message: { usage: { input_tokens: 10 } } }),
      sse('content_block_start', {
        type: 'content_block_start',
        index: 0,
        content_block: { type: 'tool_use', id: 'toolu_1', name: 'read_note', input: {} },
      }),
      sse('content_block_delta', {
        type: 'content_block_delta',
        index: 0,
        delta: { type: 'input_json_delta', partial_json: '{"path":"a.md"}' },
      }),
      sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
      sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } }),
      sse('message_stop', { type: 'message_stop' }),
    ].join('');
  }
  return [
    sse('message_start', { type: 'message_start', message: { usage: { input_tokens: 12 } } }),
    sse('content_block_start', { type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' } }),
    sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } }),
    sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'world' } }),
    sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
    sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } }),
    sse('message_stop', { type: 'message_stop' }),
  ].join('');
}

before(() => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'ui', 'ChatView.ts')],
    bundle: true,
    external: ['obsidian', 'electron'],
    format: 'cjs',
    write: false,
    logLevel: 'silent',
  });
  const m = new Module('chatview.js');
  m.filename = 'chatview.js';
  m.paths = Module._nodeModulePaths(root);
  m._compile(result.outputFiles[0].text, 'chatview.js');
  ChatViewClass = m.exports.MidianChatView;

  adapter.files.set('a.md', 'note content');
  adapter.dirs.add('.midian');
  const store = new SessionStore({ adapter });
  view = new ChatViewClass(
    {},
    store,
    () => settings,
    async () => {},
  );
  view.app = {
    vault: { adapter },
    workspace: { getActiveFile: () => null, activeEditor: null },
  };
  globalThis.fetch = async (url, opts) => {
    // Serve canned SSE only for the chat's own fake endpoint (dead port 9);
    // everything else (local integration servers) passes through untouched.
    if (!String(url).includes('127.0.0.1:9')) {
      return originalFetch(url, opts);
    }
    fetchCalls += 1;
    if (opts && opts.body) {
      requestBodies.push(JSON.parse(opts.body));
    }
    const body = sseForRound(fetchCalls);
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    return new Response(stream, { status: 200, headers: { 'Content-Type': 'text/event-stream' } });
  };
});

after(() => {
  globalThis.fetch = originalFetch;
});

test('view opens with composer and welcome', async () => {
  await view.onOpen();
  const root = view.contentEl.children[0];
  assert.ok(root.hasClass('midian-root'));
  assert.ok(root.first('midian-header'));
  assert.ok(root.first('midian-composer'));
  assert.ok(root.first('midian-welcome'));
});

test('sending a message streams, approves a tool call and saves the session', async () => {
  view.textarea.value = 'read a.md';
  const sendPromise = view.send();

  // The tool round blocks until the user approves; approve it mid-flight.
  const root = view.contentEl.children[0];
  await waitFor(() => root.findAll('midian-tool-call').length > 0);
  const card = root.findAll('midian-tool-call')[0];
  const approve = card.first('midian-tool-btn');
  assert.ok(approve, 'approval card should offer an approve button');
  approve.click();
  await sendPromise;

  // Session persisted with the user turn and the final assistant text.
  const sessionFiles = [...adapter.files.keys()].filter((f) => f.startsWith('.midian/sessions/'));
  assert.equal(sessionFiles.length, 1, 'one session file should be written');
  const saved = adapter.files.get(sessionFiles[0]);
  assert.ok(saved.includes('read a.md'), 'user message must be saved');
  assert.ok(saved.includes('Hello world'), 'streamed assistant text must be saved');
  assert.ok(saved.includes('"role": "assistant"'));
  assert.ok(saved.includes('"role": "user"'));

  // The tool call was executed against the real dispatcher (read a.md):
  // the second API request must carry the tool_result content.
  assert.ok(requestBodies.length >= 2, 'at least two API requests should be made');
  const roundTwo = JSON.stringify(requestBodies[1]);
  assert.ok(roundTwo.includes('tool_result'), 'second request must include the tool result');
  assert.ok(roundTwo.includes('note content'), 'tool result must carry the dispatcher output');

  // UI state: streaming finished, send button restored, no pending cards.
  assert.equal(view.streaming, false);
  assert.ok(view.abortController === null);
  assert.ok(!view.sendButton.hasClass('is-streaming'));
  const pendingCards = view.contentEl.children[0].findAll('midian-tool-call');
  assert.equal(pendingCards.length, 0, 'tool cards should be resolved and cleared');

  // The welcome view is replaced by rendered messages.
  const messages = view.messagesEl;
  assert.ok(messages.children.length >= 2, 'user + assistant messages rendered');
});

test('rewind removes the last assistant turn and its user message', async () => {
  await view.rewind();
  const sessionFiles = [...adapter.files.keys()].filter((f) => f.startsWith('.midian/sessions/'));
  const saved = adapter.files.get(sessionFiles[0]);
  assert.ok(!saved.includes('Hello world'), 'assistant turn must be removed by rewind');
  // The session title legitimately keeps the original prompt text.
  assert.ok(saved.includes('"messages": []'), 'session should end up empty');
});
