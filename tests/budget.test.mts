import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assembleContextBlocks, truncateText } from '../src/utils/budget.ts';

test('truncateText keeps short text intact', () => {
  assert.equal(truncateText('short', 100), 'short');
});

test('truncateText cuts long text and appends ellipsis', () => {
  const result = truncateText('abcdefghij', 5);
  assert.equal(result, 'abcd…');
});

test('truncateText keeps text at the exact boundary', () => {
  assert.equal(truncateText('abc', 3), 'abc');
});

test('truncateText with non-positive limit returns the original', () => {
  assert.equal(truncateText('abc', 0), 'abc');
  assert.equal(truncateText('abc', -5), 'abc');
});

test('truncateText does not split surrogate pairs', () => {
  const result = truncateText('😀😀😀', 4);
  assert.equal([...result].length, 3); // two emoji + ellipsis
  const result2 = truncateText('abc😀def', 5);
  assert.equal(result2, 'abc😀…');
  const result3 = truncateText('abc😀def', 4);
  assert.equal(result3, 'abc…');
});

test('assembleContextBlocks returns empty for no blocks', () => {
  assert.equal(assembleContextBlocks([], 1000), '');
});

test('assembleContextBlocks splits budget evenly', () => {
  const blocks = [
    { label: 'A', text: 'x'.repeat(500) },
    { label: 'B', text: 'y'.repeat(500) },
  ];
  const out = assembleContextBlocks(blocks, 600);
  assert.ok(out.includes('## A'));
  assert.ok(out.includes('## B'));
  const aPart = out.split('## B')[0];
  const aContent = aPart.replace('## A', '').trim();
  assert.ok(aContent.length <= 300);
});

test('assembleContextBlocks skips empty blocks', () => {
  const out = assembleContextBlocks([{ label: 'A', text: '   ' }, { label: 'B', text: 'real' }], 1000);
  assert.ok(!out.includes('## A'));
  assert.ok(out.includes('## B'));
});

test('assembleContextBlocks truncates oversized blocks with ellipsis', () => {
  const out = assembleContextBlocks([{ label: 'A', text: 'x'.repeat(1000) }], 400);
  assert.ok(out.endsWith('…'));
  assert.ok(out.length < 1000);
});

test('assembleContextBlocks keeps a minimum per-block budget', () => {
  const out = assembleContextBlocks([{ label: 'A', text: 'y'.repeat(500) }], 100);
  assert.ok(out.length < 300);
  assert.ok(out.includes('## A'));
});
