// Mission tasks assigned from the web (Ana üs) to one astronaut. Kept in RAM like the rest of the relay.
// Shape matches web/src/App.tsx `MissionTask`; `assigneeId` is the astronaut's crewId (crew-1 ...).

const PRIORITIES = new Set(['normal', 'high']);

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

  const list = (crewId) => [...tasks.values()].filter((t) => !crewId || t.assigneeId === crewId);

  return { upsert, setCompleted, remove, list, clear: () => tasks.clear() };
}
