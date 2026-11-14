// One shared SSE connection to /api/ai/stream for every AI component on the page.
// Connects on the first subscriber; EventSource reconnects by itself after a drop.

import { useSyncExternalStore } from 'react'
import { streamUrl } from './api'
import type { Alert, CabinSnapshot } from './types'

export type Connection = 'connecting' | 'live' | 'offline'

export interface AiState {
  connection: Connection
  cabin: CabinSnapshot | null
  /** Active alerts, newest first. */
  alerts: Alert[]
  /** Alerts announced by the server (`alert` event) and not yet dismissed in this browser: popup queue. */
  incoming: string[]
}

let state: AiState = { connection: 'connecting', cabin: null, alerts: [], incoming: [] }
const listeners = new Set<() => void>()
let source: EventSource | null = null

function set(patch: Partial<AiState>) {
  state = { ...state, ...patch }
  for (const l of listeners) l()
}

function upsert(alert: Alert) {
  const rest = state.alerts.filter((a) => a.id !== alert.id)
  const alerts = alert.state === 'active' ? [alert, ...rest] : rest
  alerts.sort((a, b) => b.createdAt.localeCompare(a.createdAt))
  set({ alerts, incoming: alert.state === 'active' ? state.incoming : state.incoming.filter((id) => id !== alert.id) })
}

function parse<T>(e: MessageEvent): T | null {
  try {
    return JSON.parse(e.data) as T
  } catch {
    return null
  }
}

function connect() {
  if (source || typeof EventSource === 'undefined') return
  set({ connection: 'connecting' })
  source = new EventSource(streamUrl())
  source.onopen = () => set({ connection: 'live' })
  source.onerror = () => set({ connection: 'offline' })
  source.addEventListener('hello', (e) => {
    const data = parse<{ cabin: CabinSnapshot; alerts: Alert[] }>(e)
    if (!data) return
    // Startup / reset: list what exists, but only keep popups that are still active.
    const ids = new Set(data.alerts.map((a) => a.id))
    set({ connection: 'live', cabin: data.cabin, alerts: data.alerts, incoming: state.incoming.filter((id) => ids.has(id)) })
  })
  source.addEventListener('cabin', (e) => {
    const cabin = parse<CabinSnapshot>(e)
    if (cabin) set({ cabin })
  })
  source.addEventListener('alert', (e) => {
    const alert = parse<Alert>(e)
    if (!alert) return
    upsert(alert)
    set({ incoming: [alert.id, ...state.incoming.filter((id) => id !== alert.id)] })
  })
  source.addEventListener('alert-update', (e) => {
    const alert = parse<Alert>(e)
    if (alert) upsert(alert)
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  connect()
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0 && source) {
      source.close()
      source = null
    }
  }
}

export const aiStore = {
  dismiss(id: string) {
    set({ incoming: state.incoming.filter((x) => x !== id) })
  },
  /** Re-open a listed alert as a popup without announcing it again. */
  show(id: string) {
    set({ incoming: [id, ...state.incoming.filter((x) => x !== id)] })
  },
  replace(alert: Alert) {
    upsert(alert)
  },
}

export function useAiState(): AiState {
  return useSyncExternalStore(subscribe, () => state, () => state)
}
