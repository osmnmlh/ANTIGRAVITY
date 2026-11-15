import { useEffect, type Dispatch, type SetStateAction } from 'react'

// Mission tasks are assigned here and delivered by the relay (GET/POST /api/tasks, SSE `task` + `hello`) to the phones.
// The relay is the source of truth once it answers; localStorage stays as the offline copy (ADR-0002).

const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8787').replace(/\/$/, '')
const migratedKey = 'antigravity.tasks.migrated.v1'

interface TaskLike {
  id: string
  assigneeId: string
}

async function post(path: string, body: unknown) {
  try {
    const response = await fetch(`${apiBaseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    })
    if (!response.ok) console.error(`Task sync ${path} failed with status ${response.status}.`)
  } catch (error) {
    console.error(`Task sync ${path} could not reach the relay; the task stays on this device only.`, error)
  }
}

export const taskApi = {
  create: (task: TaskLike) => post('/api/tasks', task),
  setCompleted: (id: string, completed: boolean) => post(`/api/tasks/${encodeURIComponent(id)}/complete`, { completed }),
  remove: (id: string) => post(`/api/tasks/${encodeURIComponent(id)}/delete`, {}),
}

function isTaskList(value: unknown): value is TaskLike[] {
  return Array.isArray(value) && value.every((item) => item && typeof item.id === 'string' && typeof item.assigneeId === 'string')
}

export function useTaskSync<T extends TaskLike>(setTasks: Dispatch<SetStateAction<T[]>>) {
  useEffect(() => {
    const stream = new EventSource(`${apiBaseUrl}/api/stream`)

    stream.addEventListener('hello', (event) => {
      try {
        const { tasks } = JSON.parse((event as MessageEvent<string>).data) as { tasks?: unknown }
        if (!isTaskList(tasks)) return
        setTasks((local) => {
          if (window.localStorage.getItem(migratedKey) !== '1') {
            // One-time: tasks created before the relay knew about tasks are sent up instead of being dropped.
            const known = new Set(tasks.map(({ id }) => id))
            for (const task of local) if (!known.has(task.id)) void taskApi.create(task)
            window.localStorage.setItem(migratedKey, '1')
            return [...(tasks as T[]), ...local.filter((task) => !known.has(task.id))]
          }
          return tasks as T[]
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
          return action === 'delete' ? rest : [task, ...rest]
        })
      } catch (error) {
        console.error('Task sync ignored an invalid task event.', error)
      }
    })

    return () => stream.close()
  }, [setTasks])
}
