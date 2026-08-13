import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseFrontmatter, stringifyFrontmatter, stringifyYamlValue } from '../src/utils/frontmatter.ts';

test('parseFrontmatter extracts yaml and body', () => {
  const { frontmatter, body } = parseFrontmatter('---\ntitle: Hello\ntags: [a, b]\n---\nBody text');
  assert.deepEqual(frontmatter, { title: 'Hello', tags: ['a', 'b'] });
  assert.equal(body, 'Body text');
});

test('parseFrontmatter returns empty for no frontmatter', () => {
  const { frontmatter, body } = parseFrontmatter('Just a note');
  assert.deepEqual(frontmatter, {});
  assert.equal(body, 'Just a note');
});

test('parseFrontmatter handles CRLF', () => {
  const { frontmatter } = parseFrontmatter('---\r\ncount: 3\r\ndone: true\r\n---\r\nx');
  assert.deepEqual(frontmatter, { count: 3, done: true });
});

test('stringifyFrontmatter merges with existing properties', () => {
  const updated = stringifyFrontmatter('---\na: 1\n---\nBody', { b: 'two' });
  assert.match(updated, /^---\n/);
  assert.match(updated, /a: 1/);
  assert.match(updated, /b: two/);
  assert.ok(updated.endsWith('Body'));
});

test('stringifyFrontmatter adds block when missing', () => {
  const updated = stringifyFrontmatter('Body only', { title: 'New' });
  assert.match(updated, /^---\ntitle: New\n---\n\nBody only$/);
});

test('stringifyYamlValue quotes strings with special characters', () => {
  assert.equal(stringifyYamlValue('a: b'), '"a: b"');
  assert.equal(stringifyYamlValue('plain'), 'plain');
  assert.equal(stringifyYamlValue(42), '42');
  assert.equal(stringifyYamlValue(null), 'null');
  assert.equal(stringifyYamlValue([]), '[]');
  assert.equal(stringifyYamlValue([1, 'x']), '[1, "x"]');
});

test('parseFrontmatter handles dates, empty values and quoted array items', () => {
  const { frontmatter } = parseFrontmatter('---\ndate: 2024-01-01\ntags: [a, "b c"]\nempty: \n---\nx');
  assert.deepEqual(frontmatter, { date: '2024-01-01', tags: ['a', 'b c'], empty: '' });
});

test('parseFrontmatter parses booleans, numbers and null', () => {
  const { frontmatter } = parseFrontmatter('---\non: true\noff: false\nn: -3\nnil: null\n---\n');
  assert.deepEqual(frontmatter, { on: true, off: false, n: -3, nil: null });
});

test('stringifyYamlValue keeps date-like strings unquoted', () => {
  assert.equal(stringifyYamlValue('2024-01-01'), '2024-01-01');
});

test('stringifyYamlValue quotes strings that would re-parse as other types', () => {
  assert.equal(stringifyYamlValue('false'), '"false"');
  assert.equal(stringifyYamlValue('true'), '"true"');
  assert.equal(stringifyYamlValue('null'), '"null"');
  assert.equal(stringifyYamlValue('3.5'), '"3.5"');
  assert.equal(stringifyYamlValue('42'), '"42"');
});
