'use strict';
// Stream inactivity timeout tests: a silent stream must reject so the
// provider can fall back to non-streaming instead of hanging forever.
const { test, before } = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const { installObsidianMock } = require('./obsidianMock.cjs');

const root = path.resolve(__dirname, '..');
installObsidianMock();

const esbuild = require('esbuild');

let streamResponseText = null;

before(() => {
  const result = esbuild.buildSync({
    entryPoints: [path.join(root, 'src', 'network', 'http.ts')],
    bundle: true,
    external: ['obsidian', 'electron'],
    format: 'cjs',
    write: false,
    logLevel: 'silent',
  });
  const m = new Module('http.js');
  m.filename = 'http.js';
  m.paths = Module._nodeModulePaths(root);
  m._compile(result.outputFiles[0].text, 'http.js');
  streamResponseText = m.exports.streamResponseText;
});

function silentStreamResponse() {
  const stream = new ReadableStream({
    start() {
      // Never enqueue, never close: a stalled connection.
    },
  });
  return new Response(stream, { status: 200 });
}

function chunkedStreamResponse(chunks) {
  const stream = new ReadableStream({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(new TextEncoder().encode(chunk));
      }
      controller.close();
    },
  });
  return new Response(stream, { status: 200 });
}

test('a silent stream times out and rejects', async () => {
  await assert.rejects(streamResponseText(silentStreamResponse(), () => {}, 50), /timed out/);
});

test('a stream that keeps sending does not time out', async () => {
  const received = [];
  await streamResponseText(chunkedStreamResponse(['he', 'llo']), (text) => received.push(text), 50);
  assert.equal(received.join(''), 'hello');
});

test('inactivity timeout is disabled when set to zero', async () => {
  const received = [];
  await streamResponseText(chunkedStreamResponse(['x']), (text) => received.push(text), 0);
  assert.equal(received.join(''), 'x');
});
