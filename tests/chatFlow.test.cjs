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
// Node 24 ships a navigator that follows the system locale; pin it so i18n
// resolution in the bundle is deterministic across machines.
Object.defineProperty(globalThis, 'navigator', { value: { language: 'en' }, configurable: true });

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
let sseMode = 'tool';
const seenSessionFiles = new Set();

function startTurn(mode) {
  sseMode = mode;
  fetchCalls = 0;
  requestBodies.length = 0;
  view.newSession();
  view.textarea.value = 'read a.md';
}

function newSessionFile() {
  const files = [...adapter.files.keys()].filter(
    (f) => f.startsWith('.midian/sessions/') && !seenSessionFiles.has(f),
  );
  assert.equal(files.length, 1, 'exactly one new session file expected');
  seenSessionFiles.add(files[0]);
  return files[0];
}

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function toolRound(name, argsJson, id) {
  return [
    sse('message_start', { type: 'message_start', message: { usage: { input_tokens: 10 } } }),
    sse('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'tool_use', id, name, input: {} },
    }),
    sse('content_block_delta', {
      type: 'content_block_delta',
      index: 0,
      delta: { type: 'input_json_delta', partial_json: argsJson },
    }),
    sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
    sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'tool_use' }, usage: { output_tokens: 5 } }),
    sse('message_stop', { type: 'message_stop' }),
  ].join('');
}

function textRound() {
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

function sseForRound(round) {
  if (round === 1) {
    if (sseMode === 'ask') {
      return toolRound('ask_user', '{"question":"Are you ready?","options":["yes","no"]}', 'toolu_ask');
    }
    return toolRound('read_note', '{"path":"a.md"}', 'toolu_1');
  }
  // Round 2 is the main chat text; round 3+ serves the background auto-title
  // and memory-extraction calls with the same canned text.
  return textRound();
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
    vault: {
      adapter,
      create: async (path, content) => {
        adapter.files.set(path, content);
        return { path };
      },
    },
    workspace: {
      getActiveFile: () => null,
      activeEditor: null,
      getLeaf: () => ({ openFile: async () => {} }),
    },
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
  startTurn('tool');
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
  const saved = adapter.files.get(newSessionFile());
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
  const saved = adapter.files.get(sessionFiles[sessionFiles.length - 1]);
  assert.ok(!saved.includes('"content": "Hello world"'), 'assistant message must be removed by rewind');
  // The session title legitimately keeps the original prompt text.
  assert.ok(saved.includes('"messages": []'), 'session should end up empty');
});

test('stopping during a pending approval cancels the card and completes the turn', async () => {
  startTurn('tool');
  const sendPromise = view.send();
  const root = view.contentEl.children[0];
  await waitFor(() => root.findAll('midian-tool-call').length > 0);

  // Press stop while the approval card is still awaiting a decision.
  view.sendButton.click();
  await sendPromise;

  assert.equal(view.streaming, false, 'turn must complete after stopping');
  const roundTwo = JSON.stringify(requestBodies[1] ?? {});
  assert.ok(roundTwo.includes('denied'), 'the cancelled card must produce a denied tool result');
  const saved = adapter.files.get(newSessionFile());
  assert.ok(saved.includes('"role": "assistant"'), 'session must still be saved after stop');
});

test('ask_user is intercepted by the UI and the answer reaches the model', async () => {
  startTurn('ask');
  const sendPromise = view.send();
  const root = view.contentEl.children[0];
  await waitFor(() => root.findAll('midian-ask-user').length > 0);

  const card = root.first('midian-ask-user');
  const inputRow = card.first('midian-ask-user-input-row');
  const input = inputRow.children[0];
  input.value = '42';
  inputRow.children[1].click();
  await sendPromise;

  const roundTwo = JSON.stringify(requestBodies[1] ?? {});
  assert.ok(roundTwo.includes('用户回答：42'), 'the answer must be sent back to the model');
  const saved = adapter.files.get(newSessionFile());
  assert.ok(saved.includes('Hello world'), 'final answer must be saved');
});

test('editing the last user message restores it to the composer and truncates', async () => {
  startTurn('tool');
  const sendPromise = view.send();
  const root = view.contentEl.children[0];
  await waitFor(() => root.findAll('midian-tool-call').length > 0);
  root.first('midian-tool-call').first('midian-tool-btn').click();
  await sendPromise;

  await view.renderSession();
  const userMsg = root.findAll('midian-message').find((el) => el.hasClass('midian-user'));
  const editButton = userMsg.first('midian-action-button');
  assert.ok(editButton, 'edit button should be offered on the last user message');
  editButton.click();

  await waitFor(() => view.textarea.value === 'read a.md');
  assert.equal(view.textarea.value, 'read a.md', 'message must be restored to the composer');
  const saved = JSON.parse(adapter.files.get(newSessionFile()));
  assert.equal(saved.messages.length, 0, 'session must be truncated before the edited message');
});

test('image attachments are sent as base64 and kept in the session', async () => {
  startTurn('tool');
  const imagePath = 'img/pic.png';
  adapter.binaryFiles.set(imagePath, new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  view.addImage(imagePath);
  const root = view.contentEl.children[0];
  assert.ok(root.first('midian-chip-image'), 'image chip should render in the composer');
  view.textarea.value = 'what is this';

  const sendPromise = view.send();
  await waitFor(() => root.findAll('midian-tool-call').length > 0);
  root.first('midian-tool-call').first('midian-tool-btn').click();
  await sendPromise;

  const firstBody = JSON.stringify(requestBodies[0]);
  assert.ok(firstBody.includes('image/png'), 'request must include the image media type');
  assert.ok(firstBody.includes('iVBOR'), 'request must include base64 image data (PNG magic)');
  const saved = adapter.files.get(newSessionFile());
  assert.ok(saved.includes('img/pic.png'), 'session must keep the image path');
});

test('slash menu filters commands and inserts the template', () => {
  view.textarea.value = '/sum';
  view.textarea.selectionStart = view.textarea.value.length;
  view.updateSlashMenu();
  assert.ok(view.slashMenu.visible, 'slash menu should open');
  assert.equal(view.slashMenu.items.length, 1, 'only summarize should match /sum');
  view.slashMenu.pick();
  assert.ok(view.textarea.value.startsWith('Summarize'), 'the template must be inserted');
  assert.ok(!view.slashMenu.visible, 'menu must close after picking');
});

test('auto-title renames the session after the first exchange', async () => {
  startTurn('tool');
  const sendPromise = view.send();
  const root = view.contentEl.children[0];
  await waitFor(() => root.findAll('midian-tool-call').length > 0);
  root.first('midian-tool-call').first('midian-tool-btn').click();
  await sendPromise;

  const file = newSessionFile();
  await waitFor(() => adapter.files.get(file)?.includes('"title": "Hello world"'));
  assert.ok(adapter.files.get(file).includes('"title": "Hello world"'), 'title must be generated from the reply');
});

test('memory engine extracts and persists short-term notes', async () => {
  settings.memory.enabled = true;
  try {
    startTurn('tool');
    const sendPromise = view.send();
    const root = view.contentEl.children[0];
    await waitFor(() => root.findAll('midian-tool-call').length > 0);
    root.first('midian-tool-call').first('midian-tool-btn').click();
    await sendPromise;

    // backgroundMemory is fire-and-forget; wait for the memory file to land.
    await waitFor(() => adapter.files.get('.midian/memory/short-term.md')?.includes('Hello world'));
    const memory = adapter.files.get('.midian/memory/short-term.md');
    assert.ok(memory.includes('Hello world'), 'extracted facts must be written to short-term.md');
    assert.ok(memory.includes('### '), 'entries must carry a timestamp header');
  } finally {
    settings.memory.enabled = false;
  }
});

test('exporting a session creates a markdown note with its content', async () => {
  startTurn('tool');
  const sendPromise = view.send();
  const root = view.contentEl.children[0];
  await waitFor(() => root.findAll('midian-tool-call').length > 0);
  root.first('midian-tool-call').first('midian-tool-btn').click();
  await sendPromise;

  const sessionId = view.activeSessionId;
  await view.exportSession(sessionId);
  const exports = [...adapter.files.keys()].filter((f) => f.startsWith('Midian Exports/'));
  assert.equal(exports.length, 1, 'one exported note should be created');
  const note = adapter.files.get(exports[0]);
  assert.ok(note.includes('# '), 'export must have a title heading');
  assert.ok(note.includes('read a.md'), 'export must contain the user message');
  assert.ok(note.includes('Hello world'), 'export must contain the assistant reply');
});
