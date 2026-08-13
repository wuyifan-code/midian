import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../src/sessions/store.ts';
import type { MidianSession } from '../src/sessions/types.ts';
import { makeVault, MockAdapter } from './mockVault.mts';

function makeSession(overrides: Partial<MidianSession> = {}): MidianSession {
  return {
    id: SessionStore.newId(),
    title: 'Test',
    providerId: 'anthropic',
    model: 'claude-sonnet-4-5',
    createdAt: 1000,
    updatedAt: 1000,
    messages: [{ role: 'user', content: 'hi', createdAt: 1000 }],
    ...overrides,
  };
}

test('SessionStore.newId generates distinct ids', () => {
  assert.notEqual(SessionStore.newId(), SessionStore.newId());
});

test('save then load roundtrips the session', async () => {
  const store = new SessionStore(makeVault());
  const session = makeSession();
  await store.save(session);
  const loaded = await store.load(session.id);
  assert.deepEqual(loaded, session);
});

test('load returns null for a missing session', async () => {
  const store = new SessionStore(makeVault());
  assert.equal(await store.load('nope'), null);
});

test('remove deletes the session file', async () => {
  const store = new SessionStore(makeVault());
  const session = makeSession();
  await store.save(session);
  await store.remove(session.id);
  assert.equal(await store.load(session.id), null);
});

test('list returns sessions sorted by updatedAt descending', async () => {
  const store = new SessionStore(makeVault());
  const old = makeSession({ id: 'old', updatedAt: 1000, title: 'Old' });
  const fresh = makeSession({ id: 'fresh', updatedAt: 2000, title: 'Fresh' });
  await store.save(old);
  await store.save(fresh);
  const listed = await store.list();
  assert.deepEqual(listed.map((s) => s.id), ['fresh', 'old']);
});

test('list skips corrupt session files', async () => {
  const vault = makeVault();
  const adapter = vault.adapter as MockAdapter;
  adapter.files.set('.midian/sessions/broken.json', '{not json');
  const store = new SessionStore(vault);
  const session = makeSession();
  await store.save(session);
  const listed = await store.list();
  assert.deepEqual(listed.map((s) => s.id), [session.id]);
});

test('list returns [] when the root does not exist', async () => {
  const store = new SessionStore(makeVault());
  assert.deepEqual(await store.list(), []);
});

test('list handles many sessions in parallel', async () => {
  const store = new SessionStore(makeVault());
  for (let i = 0; i < 50; i++) {
    await store.save(makeSession({ id: `s${i}`, updatedAt: 1000 + i, title: `S${i}` }));
  }
  const listed = await store.list();
  assert.equal(listed.length, 50);
  assert.equal(listed[0].id, 's49');
  assert.equal(listed[49].id, 's0');
});
