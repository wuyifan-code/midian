import { test } from 'node:test';
import assert from 'node:assert/strict';
import { arrayBufferToBase64 } from '../src/utils/base64.ts';

test('encodes empty buffer', () => {
  assert.equal(arrayBufferToBase64(new ArrayBuffer(0)), '');
});

test('encodes ascii bytes', () => {
  const bytes = new Uint8Array([77, 105, 100, 105, 97, 110]);
  assert.equal(arrayBufferToBase64(bytes.buffer), 'TWlkaWFu');
});

test('encodes binary bytes', () => {
  const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
  assert.equal(arrayBufferToBase64(bytes.buffer), 'iVBORw==');
});

test('handles buffers larger than the internal chunk size', () => {
  const size = 0x8000 + 5;
  const bytes = new Uint8Array(size).fill(65);
  const out = arrayBufferToBase64(bytes.buffer);
  assert.equal(out.length, Math.ceil(size / 3) * 4);
  assert.ok(out.endsWith('QQ=='));
});
