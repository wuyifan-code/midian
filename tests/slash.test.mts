import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getSlashQuery } from '../src/utils/slash.ts';

test('matches slash at line start', () => {
  assert.deepEqual(getSlashQuery('/sum', 4), { prefix: 'sum', start: 0 });
});

test('matches partial slash with empty prefix', () => {
  assert.deepEqual(getSlashQuery('/sum', 1), { prefix: '', start: 0 });
});

test('matches only the current line', () => {
  const value = 'hello\n/sum';
  assert.deepEqual(getSlashQuery(value, value.length), { prefix: 'sum', start: 6 });
});

test('returns null when the line contains other text', () => {
  assert.equal(getSlashQuery('say /sum', 8), null);
});

test('returns null for plain text', () => {
  assert.equal(getSlashQuery('hello world', 11), null);
});

test('matches bare slash', () => {
  assert.deepEqual(getSlashQuery('/', 1), { prefix: '', start: 0 });
});

test('ignores case', () => {
  assert.deepEqual(getSlashQuery('/SUM', 4), { prefix: 'sum', start: 0 });
});
