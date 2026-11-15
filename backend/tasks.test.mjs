import test from 'node:test';
import assert from 'node:assert/strict';
import { createTaskStore } from './tasks.mjs';

const crewExists = (id) => ['crew-1', 'crew-2'].includes(id);
const base = { title: 'Kabin kontrolü', assigneeId: 'crew-1' };

test('creates a task for a known astronaut and lists it by crew', () => {
  const store = createTaskStore();
  const task = store.upsert({ ...base, priority: 'high' }, { crewExists });
  assert.equal(task.priority, 'high');
  assert.equal(task.completed, false);
  assert.deepEqual(store.list('crew-1').map((t) => t.id), [task.id]);
  assert.deepEqual(store.list('crew-2'), []);
});

test('rejects a missing title or an unknown astronaut', () => {
  const store = createTaskStore();
  assert.throws(() => store.upsert({ ...base, title: '  ' }, { crewExists }), { status: 400 });
  assert.throws(() => store.upsert({ ...base, assigneeId: 'crew-9' }, { crewExists }), { status: 404 });
});

test('upserting the same id keeps createdAt and falls back to normal priority', () => {
  const store = createTaskStore();
  const first = store.upsert({ ...base, id: 't1', createdAt: '2026-11-15T01:00:00Z' }, { crewExists });
  const second = store.upsert({ ...base, id: 't1', title: 'Yeni başlık', priority: 'urgent' }, { crewExists });
  assert.equal(second.createdAt, first.createdAt);
  assert.equal(second.priority, 'normal');
  assert.equal(store.list().length, 1);
});

test('completes, removes and clears', () => {
  const store = createTaskStore();
  const { id } = store.upsert(base, { crewExists });
  assert.equal(store.setCompleted(id, true).completed, true);
  assert.equal(store.remove(id).id, id);
  assert.throws(() => store.setCompleted(id, true), { status: 404 });
  store.upsert(base, { crewExists });
  store.clear();
  assert.deepEqual(store.list(), []);
});

test('alert tasks carry their source and alertId and can be removed together', () => {
  const store = createTaskStore();
  const manual = store.upsert(base, { crewExists });
  store.upsert({ ...base, title: 'Maskeni tak', source: 'alert', alertId: 'alert-0001' }, { crewExists });
  store.upsert({ ...base, title: 'Kapağı kapat', source: 'alert', alertId: 'alert-0001' }, { crewExists });
  store.upsert({ ...base, title: 'Başka uyarı', source: 'alert', alertId: 'alert-0002' }, { crewExists });
  assert.equal(manual.source, 'manual');
  assert.equal(manual.alertId, null);
  const removed = store.removeWhere((t) => t.alertId === 'alert-0001');
  assert.equal(removed.length, 2);
  assert.deepEqual(store.list().map((t) => t.title).sort(), ['Başka uyarı', 'Kabin kontrolü']);
});
