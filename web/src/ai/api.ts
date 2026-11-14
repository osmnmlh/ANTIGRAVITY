// Talks to the AI routes of the relay (/api/ai/*). Gemini is never called from the browser.
// Base URL: VITE_AI_URL, else VITE_API_URL, else the local relay on :8787.

import type { Alert, ChatContext, ChatMessage, ChatResponse } from './types'

export const AI_BASE_URL = (
  import.meta.env.VITE_AI_URL ?? import.meta.env.VITE_API_URL ?? 'http://localhost:8787'
).replace(/\/$/, '')

async function request<T>(method: 'GET' | 'POST', path: string, body?: unknown, timeoutMs = 15_000): Promise<T> {
  const init: RequestInit = { method, signal: AbortSignal.timeout(timeoutMs) }
  if (body !== undefined) {
    init.headers = { 'content-type': 'application/json' }
    init.body = JSON.stringify(body)
  }
  const res = await fetch(`${AI_BASE_URL}${path}`, init)
  const data: unknown = await res.json().catch(() => null)
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error ?? `HTTP ${res.status}`
    throw new Error(message)
  }
  return data as T
}

export function sendChat(context: ChatContext, history: ChatMessage[]): Promise<ChatResponse> {
  // Server keeps no history: send the last turns, text only.
  const messages = history.slice(-6).map(({ role, text }) => ({ role, text }))
  return request<ChatResponse>('POST', '/api/ai/chat', { ...context, messages })
}

export const ackAlert = (id: string) => request<Alert>('POST', `/api/ai/alerts/${encodeURIComponent(id)}/ack`, { by: 'cockpit' })
export const listScenarios = () => request<string[]>('GET', '/api/ai/demo', undefined, 3_000)
export const runScenario = (id: string) => request<{ ok: boolean; created: string[] }>('POST', `/api/ai/demo/${encodeURIComponent(id)}`)
export const resetDemo = () => request<{ ok: boolean }>('POST', '/api/ai/demo/reset')
export const streamUrl = () => `${AI_BASE_URL}/api/ai/stream`
