// Mission tasks assigned from the web (Ana üs) to one astronaut. Kept in RAM like the rest of the relay.
// Shape matches web/src/App.tsx `MissionTask`; `assigneeId` is the astronaut's crewId (crew-1 ...).

const PRIORITIES = new Set(['normal', 'high']);

/** An astronaut never gets more than this many alert tasks at once; a long list is ignored in an emergency. */
export const MAX_ALERT_TASKS = 3;

/**
 * The steps of an alert that become tasks for ONE astronaut, at most `room` of them.
 * Red: the first steps, then "Uçuş cerrahına haber ver" as the last one (calling the surgeon must never be cut).
 * Amber: just the first steps.
 */
export function alertTaskItems(alert, room = MAX_ALERT_TASKS) {
  const steps = (alert.advice?.doNow ?? []).map((title) => ({ title, details: alert.title }));
  const call = alert.severity === 'red' && alert.advice?.escalate
    ? [{ title: 'Uçuş cerrahına haber ver', details: alert.advice.escalate }]
    : [];
  const limit = Math.max(0, Math.min(room, MAX_ALERT_TASKS));
  return [...steps.slice(0, Math.max(0, limit - call.length)), ...call].slice(0, limit);
}

export function createTaskStore({ now = () => new Date() } = {}) {
  /** @type {Map<string, object>} */
  const tasks = new Map();

  function fail(status, message) {
    throw Object.assign(new Error(message), { status });
  }

  function upsert(input, { crewExists }) {
    const title = String(input?.title ?? '').trim();
    if (!title) fail(400, 'title is required');
    const assigneeId = String(input?.assigneeId ?? '');
    if (!crewExists(assigneeId)) fail(404, `unknown assigneeId: ${assigneeId}`);
    const id = String(input.id || crypto.randomUUID());
    const previous = tasks.get(id);
    const task = {
      id,
      title: title.slice(0, 200),
      details: String(input.details ?? '').trim().slice(0, 1000),
      assigneeId,
      dueAt: String(input.dueAt ?? ''),
      priority: PRIORITIES.has(input.priority) ? input.priority : 'normal',
      completed: input.completed === true,
      // `alert` tasks are the steps of an alert (AI recommendation) and disappear when that alert is over.
      source: input.source === 'alert' ? 'alert' : 'manual',
      alertId: typeof input.alertId === 'string' ? input.alertId : null,
      createdAt: previous?.createdAt ?? (typeof input.createdAt === 'string' ? input.createdAt : now().toISOString()),
    };
    tasks.set(id, task);
    return task;
  }

  function setCompleted(id, completed) {
    const task = tasks.get(id);
    if (!task) fail(404, `unknown task: ${id}`);
    task.completed = completed === true;
    return task;
  }

  function remove(id) {
    const task = tasks.get(id);
    if (!task) fail(404, `unknown task: ${id}`);
    tasks.delete(id);
    return task;
  }

  /** Removes every task the predicate accepts and returns them (so the caller can tell the clients). */
  function removeWhere(predicate) {
    const removed = [...tasks.values()].filter(predicate);
    for (const task of removed) tasks.delete(task.id);
    return removed;
  }

  const list = (crewId) => [...tasks.values()].filter((t) => !crewId || t.assigneeId === crewId);

  return { upsert, setCompleted, remove, removeWhere, list, clear: () => tasks.clear() };
}
