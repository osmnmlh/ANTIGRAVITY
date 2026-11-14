import { useCallback, useEffect, useReducer, useRef, useState, type FormEvent } from 'react'
import { sendChat } from './api'
import { useAiState } from './aiStore'
import { AI_LABELS as L } from './labels'
import type { ChatContext, ChatMessage, Escalation } from './types'
import './ai.css'

export interface AiChatProps {
  /** Omit for the cockpit (cabin + whole crew); set it in the astronaut detail view. */
  crewId?: string
  /** Shown in the header for the detail view. */
  crewName?: string
}

// History per context lives outside the component, so switching cockpit ↔ astronaut and back keeps each chat.
const histories = new Map<string, ChatMessage[]>()
const ASK_EVENT = 'antigravity:ai-ask'

/** Sends a question to the chat panel that is on screen (e.g. from an alert popup's "AI'a sor"). */
export function askAi(text: string) {
  window.dispatchEvent(new CustomEvent<string>(ASK_EVENT, { detail: text }))
}

function EscalationNote({ level }: { level?: Escalation }) {
  if (!level || level === 'none') return null
  return <p className={`ai-escalation ai-escalation-${level}`} data-testid="ai-chat-escalation">{L.escalationBanner[level]}</p>
}

export function AiChat({ crewId, crewName }: AiChatProps) {
  const context: ChatContext = crewId ? { scope: 'crew', crewId } : { scope: 'cabin' }
  const key = crewId ?? 'cabin'
  const { connection } = useAiState()
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  const [draft, setDraft] = useState('')
  const [pending, setPending] = useState<string | null>(null) // key of the context waiting for a reply
  const [error, setError] = useState<string | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  const messages = histories.get(key) ?? []
  const lastModel = [...messages].reverse().find((m) => m.role === 'model')
  const busy = pending === key

  useEffect(() => {
    setError(null)
    setDraft('')
  }, [key])

  useEffect(() => {
    listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: 'smooth' })
  }, [messages.length, busy])

  const ask = useCallback(async (text: string) => {
    const question = text.trim()
    const ctxKey = crewId ?? 'cabin'
    const ctx: ChatContext = crewId ? { scope: 'crew', crewId } : { scope: 'cabin' }
    const history = histories.get(ctxKey) ?? []
    const next: ChatMessage[] = question ? [...history, { role: 'user', text: question }] : history
    histories.set(ctxKey, next)
    setDraft('')
    setError(null)
    setPending(ctxKey)
    rerender()
    try {
      const res = await sendChat(ctx, question ? next : []) // empty = briefing
      const { reply, ...meta } = res
      histories.set(ctxKey, [...(histories.get(ctxKey) ?? []), { role: 'model', text: reply, meta }])
    } catch {
      setError(L.chatError)
    } finally {
      setPending((p) => (p === ctxKey ? null : p))
      rerender()
    }
  }, [crewId])

  useEffect(() => {
    const onAsk = (e: Event) => void ask((e as CustomEvent<string>).detail)
    window.addEventListener(ASK_EVENT, onAsk)
    return () => window.removeEventListener(ASK_EVENT, onAsk)
  }, [ask])

  function submit(e: FormEvent) {
    e.preventDefault()
    if (draft.trim() && !busy) void ask(draft)
  }

  const chips = lastModel?.meta?.suggestions?.length
    ? lastModel.meta.suggestions
    : context.scope === 'cabin' ? L.quickCabin : L.quickCrew
  const title = context.scope === 'cabin' ? L.chatTitleCabin : L.chatTitleCrew(crewName ?? crewId ?? '')

  return (
    <section className="ai-chat" aria-label={title} data-testid="ai-chat" data-context={key}>
      <header className="ai-chat-head">
        <div>
          <h3 className="ai-chat-title">{title}</h3>
          <p className="ai-chat-badge">{L.badge}</p>
        </div>
        <span className={`ai-conn ai-conn-${connection}`}>
          <span className="ai-dot" aria-hidden="true" />
          {connection === 'live' ? L.live : connection === 'connecting' ? L.connecting : L.offline}
        </span>
      </header>

      <div className="ai-chat-log" ref={listRef} data-testid="ai-chat-log" aria-live="polite">
        {messages.length === 0 && !busy && (
          <p className="ai-muted">{connection === 'offline' ? L.chatOffline : L.chatPlaceholder}</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`ai-msg ai-msg-${m.role}`} data-testid={`ai-chat-msg-${m.role}`}>
            <p>{m.text}</p>
            {m.role === 'model' && m.meta && (
              <>
                <EscalationNote level={m.meta.escalation} />
                <p className="ai-source" data-testid="ai-chat-source">
                  {m.meta.source === 'gemini' ? L.sourceGemini : L.sourceFallback}
                </p>
              </>
            )}
          </div>
        ))}
        {busy && <p className="ai-muted ai-thinking" data-testid="ai-chat-thinking">{L.thinking}</p>}
        {error && <p className="ai-error" role="alert" data-testid="ai-chat-error">{error}</p>}
      </div>

      <div className="ai-chips">
        {chips.map((c) => (
          <button key={c} type="button" className="ai-chip" disabled={busy} onClick={() => void ask(c)} data-testid="ai-chat-chip">
            {c}
          </button>
        ))}
      </div>

      <form className="ai-chat-form" onSubmit={submit}>
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={L.chatPlaceholder}
          maxLength={500}
          aria-label={L.chatPlaceholder}
          data-testid="ai-chat-input"
        />
        <button type="submit" className="ai-btn ai-btn-primary" disabled={busy || !draft.trim()} data-testid="ai-chat-send">
          {L.send}
        </button>
      </form>
      <div className="ai-chat-tools">
        <button type="button" className="ai-link" disabled={busy} onClick={() => void ask('')} data-testid="ai-chat-briefing">
          {L.briefing}
        </button>
        {messages.length > 0 && (
          <button type="button" className="ai-link" onClick={() => { histories.delete(key); rerender() }} data-testid="ai-chat-clear">
            {L.clear}
          </button>
        )}
      </div>
    </section>
  )
}
