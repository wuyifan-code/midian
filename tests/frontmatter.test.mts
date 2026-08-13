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
