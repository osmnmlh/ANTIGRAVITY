import { useEffect, type Dispatch, type SetStateAction } from 'react'

// Mission tasks are assigned here and delivered by the relay (GET/POST /api/tasks, SSE `task` + `hello`) to the phones.
// The relay is the source of truth once it answers; localStorage stays as the offline copy (ADR-0002).
//
// Sending never gives up: every change goes into an outbox that is saved in localStorage and retried until the relay
// has it. There is deliberately NO request timeout: a sleeping relay (Render free tier) needs ~30-50 s to wake up,
// and a short timeout used to drop the task silently, so it never reached the phone.

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8787').replace(/\/$/, '')
const migratedKey = 'antigravity.tasks.migrated.v1'
const outboxKey = 'antigravity.tasks.outbox.v1'
const RETRY_MS = 1500

interface TaskLike {
  id: string
  assigneeId: string
  createdAt: string
}

type Operation =
  | { kind: 'create'; task: TaskLike }
  | { kind: 'complete'; id: string; completed: boolean }
  | { kind: 'remove'; id: string }

function readOutbox(): Operation[] {
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(outboxKey) ?? '[]')
    return Array.isArray(parsed) ? (parsed as Operation[]) : []
  } catch {
    return []
  }
}

let outbox: Operation[] = readOutbox()
let flushing = false

function persistOutbox() {
  try {
    window.localStorage.setItem(outboxKey, JSON.stringify(outbox))
  } catch (error) {
    console.error('Could not save the task outbox.', error)
  }
}

/** true = the relay has dealt with it (done or refused for good); false = try again later. */
async function send(operation: Operation): Promise<boolean> {
  const [path, body] =
    operation.kind === 'create'
      ? ['/api/tasks', operation.task]
      : operation.kind === 'complete'
        ? [`/api/tasks/${encodeURIComponent(operation.id)}/complete`, { completed: operation.completed }]
        : [`/api/tasks/${encodeURIComponent(operation.id)}/delete`, {}]
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (response.ok) return true
    if (response.status === 429 || response.status >= 500) return false
    // 4xx: the relay will never accept this (unknown task, bad input). Retrying would block every task behind it.
    console.error(`Task sync ${path} was refused with status ${response.status}; dropping it.`)
    return true
  } catch {
    return false
  }
}

async function flush() {
  if (flushing) return
  flushing = true
  try {
    while (outbox.length > 0) {
      if (!(await send(outbox[0]))) break
      outbox.shift()
      persistOutbox()
    }
  } finally {
    flushing = false
  }
}

function enqueue(operation: Operation) {
  outbox.push(operation)
  persistOutbox()
  void flush()
}

export const taskApi = {
  create: (task: TaskLike) => enqueue({ kind: 'create', task }),
  setCompleted: (id: string, completed: boolean) => enqueue({ kind: 'complete', id, completed }),
  remove: (id: string) => enqueue({ kind: 'remove', id }),
}

function isTaskList(value: unknown): value is TaskLike[] {
  return Array.isArray(value) && value.every((item) => item && typeof item.id === 'string' && typeof item.assigneeId === 'string')
}

/** Newest first, on every device and after every reload (the relay lists oldest first). */
const newestFirst = <T extends TaskLike>(tasks: T[]) =>
  [...tasks].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))

export function useTaskSync<T extends TaskLike>(setTasks: Dispatch<SetStateAction<T[]>>) {
  useEffect(() => {
    const stream = new EventSource(`${apiBaseUrl}/api/stream`)
    const retry = window.setInterval(() => void flush(), RETRY_MS)
    void flush()

    stream.addEventListener('hello', (event) => {
      try {
        const { tasks } = JSON.parse((event as MessageEvent<string>).data) as { tasks?: unknown }
        if (!isTaskList(tasks)) return
        setTasks((local) => {
          const known = new Set(tasks.map(({ id }) => id))
          const pending = new Set(outbox.filter((op) => op.kind === 'create').map((op) => (op as { task: TaskLike }).task.id))
          if (window.localStorage.getItem(migratedKey) !== '1') {
            // One-time: tasks created before the relay knew about tasks are sent up instead of being dropped.
            for (const task of local) if (!known.has(task.id)) taskApi.create(task)
            window.localStorage.setItem(migratedKey, '1')
            return newestFirst([...(tasks as T[]), ...local.filter((task) => !known.has(task.id))])
          }
          // Tasks still waiting in the outbox are kept; everything else is what the relay says.
          return newestFirst([...(tasks as T[]), ...local.filter((task) => !known.has(task.id) && pending.has(task.id))])
        })
      } catch (error) {
        console.error('Task sync ignored an invalid hello payload.', error)
      }
    })

    stream.addEventListener('task', (event) => {
      try {
        const { action, task } = JSON.parse((event as MessageEvent<string>).data) as { action: string; task: T }
        if (!task || typeof task.id !== 'string') return
        setTasks((local) => {
          const rest = local.filter((item) => item.id !== task.id)
          return action === 'delete' ? rest : newestFirst([task, ...rest])
        })
      } catch (error) {
        console.error('Task sync ignored an invalid task event.', error)
      }
    })

    return () => {
      window.clearInterval(retry)
      stream.close()
    }
  }, [setTasks])
}
