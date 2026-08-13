'use strict';
// Provider integration tests: drive the real streaming + tool-call loops of
// both providers against a local HTTP server that speaks SSE. No API keys,
// no network access beyond 127.0.0.1.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const http = require('node:http');
const { installObsidianMock } = require('./obsidianMock.cjs');

const root = path.resolve(__dirname, '..');
installObsidianMock();

const esbuild = require('esbuild');

let runChat = null;
const servers = [];

before(() => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'providers', 'registry.ts')],
    bundle: true,
    external: ['obsidian', 'electron'],
    format: 'cjs',
    write: false,
    logLevel: 'silent',
  });
  const m = new Module('providers-registry.js');
  m.filename = 'providers-registry.js';
  m.paths = Module._nodeModulePaths(root);
  m._compile(result.outputFiles[0].text, 'providers-registry.js');
  runChat = m.exports.runChat;
});

after(() => {
  for (const server of servers) {
    server.close();
  }
});

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk;
      });
      req.on('end', () => {
        try {
          handler(req, res, body ? JSON.parse(body) : {}, (payload) => {
            res.writeHead(200, { 'Content-Type': 'text/event-stream' });
            res.end(payload);
          });
        } catch (error) {
          res.writeHead(500).end(String(error));
        }
      });
    });
    server.listen(0, '127.0.0.1', () => {
      servers.push(server);
      resolve(server);
    });
  });
}

function sse(event, data) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
}

function makeCallbacks() {
  const calls = { text: '', thinking: '', toolCalls: [], usage: null, done: 0, errors: [] };
  return {
    calls,
    callbacks: {
      onThinkingDelta: (delta) => {
        calls.thinking += delta;
      },
      onTextDelta: (delta) => {
        calls.text += delta;
      },
      onToolCall: async (request) => {
        calls.toolCalls.push(request);
        return { approved: true, result: 'note content', isError: false };
      },
      onDone: (usage) => {
        calls.done += 1;
        calls.usage = usage ?? null;
      },
      onError: (error) => {
        calls.errors.push(error.message);
      },
    },
  };
}

function anthropicToolRound() {
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
    sse('message_delta', {
      type: 'message_delta',
      delta: { stop_reason: 'tool_use' },
      usage: { output_tokens: 5 },
    }),
    sse('message_stop', { type: 'message_stop' }),
  ].join('');
}

function anthropicTextRound() {
  return [
    sse('message_start', { type: 'message_start', message: { usage: { input_tokens: 12 } } }),
    sse('content_block_start', {
      type: 'content_block_start',
      index: 0,
      content_block: { type: 'text', text: '' },
    }),
    sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'Hello ' } }),
    sse('content_block_delta', { type: 'content_block_delta', index: 0, delta: { type: 'text_delta', text: 'world' } }),
    sse('content_block_stop', { type: 'content_block_stop', index: 0 }),
    sse('message_delta', { type: 'message_delta', delta: { stop_reason: 'end_turn' }, usage: { output_tokens: 7 } }),
    sse('message_stop', { type: 'message_stop' }),
  ].join('');
}

test('Anthropic: streams text, runs tool round, re-sends tool results', async () => {
  let requests = 0;
  const seenBodies = [];
  const server = await startServer((req, res, payload, send) => {
    requests += 1;
    seenBodies.push(payload);
    send(requests === 1 ? anthropicToolRound() : anthropicTextRound());
  });
  const port = server.address().port;
  const { calls, callbacks } = makeCallbacks();
  await runChat(
    'anthropic',
    { apiKey: 'test-key', baseUrl: `http://127.0.0.1:${port}`, model: 'test-model', maxTokens: 100 },
    [{ role: 'user', content: 'read a.md' }],
    {},
    callbacks,
    new AbortController().signal,
  );
  assert.equal(requests, 2, 'should make one request per round');
  assert.equal(calls.text, 'Hello world');
  assert.equal(calls.toolCalls.length, 1);
  assert.deepEqual(calls.toolCalls[0].arguments, { path: 'a.md' });
  assert.equal(calls.toolCalls[0].name, 'read_note');
  assert.equal(calls.done, 1);
  assert.equal(calls.usage.inputTokens, 12);
  assert.equal(calls.usage.outputTokens, 7);
  assert.deepEqual(calls.errors, []);
  const second = JSON.stringify(seenBodies[1]);
  assert.ok(second.includes('tool_result'), 'second request must include tool results');
  assert.ok(second.includes('note content'), 'second request must include the tool result content');
});

function openaiToolRound() {
  return [
    'data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, id: 'call_1', function: { name: 'read_note', arguments: '{"path":"a.' } }] } }] }) + '\n\n',
    'data: ' + JSON.stringify({ choices: [{ delta: { tool_calls: [{ index: 0, function: { arguments: 'md"}' } }] } }] }) + '\n\n',
    'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'tool_calls' }] }) + '\n\n',
    'data: [DONE]\n\n',
  ].join('');
}

function openaiTextRound() {
  return [
    'data: ' + JSON.stringify({ choices: [{ delta: { content: 'Final ' } }] }) + '\n\n',
    'data: ' + JSON.stringify({ choices: [{ delta: { content: 'answer' } }] }) + '\n\n',
    'data: ' + JSON.stringify({ choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 3, completion_tokens: 4 } }) + '\n\n',
    'data: [DONE]\n\n',
  ].join('');
}

test('OpenAI-compatible: streams content, accumulates tool_calls by index', async () => {
  let requests = 0;
  const seenBodies = [];
  const server = await startServer((req, res, payload, send) => {
    requests += 1;
    seenBodies.push(payload);
    send(requests === 1 ? openaiToolRound() : openaiTextRound());
  });
  const port = server.address().port;
  const { calls, callbacks } = makeCallbacks();
  await runChat(
    'openai',
    { apiKey: 'test-key', baseUrl: `http://127.0.0.1:${port}`, model: 'test-model', maxTokens: 100 },
    [{ role: 'user', content: 'read a.md' }],
    {},
    callbacks,
    new AbortController().signal,
  );
  assert.equal(requests, 2, 'should make one request per round');
  assert.equal(calls.text, 'Final answer');
  assert.equal(calls.toolCalls.length, 1);
  assert.deepEqual(calls.toolCalls[0].arguments, { path: 'a.md' });
  assert.equal(calls.done, 1);
  assert.equal(calls.usage.inputTokens, 3);
  assert.equal(calls.usage.outputTokens, 4);
  assert.deepEqual(calls.errors, []);
  const second = JSON.stringify(seenBodies[1]);
  assert.ok(second.includes('"role":"tool"'), 'second request must include the tool message');
  assert.ok(second.includes('note content'), 'second request must include the tool result content');
});

test('Anthropic: surfaces errors when streaming fails', async () => {
  const server = await startServer((req, res) => {
    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: { message: 'bad request' } }));
  });
  const port = server.address().port;
  const { calls, callbacks } = makeCallbacks();
  await runChat(
    'anthropic',
    { apiKey: 'test-key', baseUrl: `http://127.0.0.1:${port}`, model: 'test-model', maxTokens: 100 },
    [{ role: 'user', content: 'hi' }],
    {},
    callbacks,
    new AbortController().signal,
  );
  assert.equal(calls.done, 0);
  assert.equal(calls.errors.length, 1, 'streaming failure should surface one error after the fallback attempt');
  assert.ok(calls.errors[0].length > 0, 'reported error must not be empty');
});
