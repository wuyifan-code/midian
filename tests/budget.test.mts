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
