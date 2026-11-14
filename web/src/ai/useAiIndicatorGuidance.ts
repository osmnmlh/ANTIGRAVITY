// The backend's AI recommendation for one indicator of one astronaut (packet.aiGuidance.indicators[type], contract §9):
// the Turkish rule-based text within milliseconds of a status change, Gemini's wording a few seconds later.
// Returns null while the relay is unreachable, so the caller keeps its own rule texts (offline demo still works).

import { useEffect, useState } from 'react'
import { AI_BASE_URL } from './api'

export interface AiIndicatorGuidance {
  whatItIs: string
  whyInSpace: string
  doNow: string[]
  escalateWhen: string
  /** Who wrote it: Gemini, or the backend's Turkish rules while Gemini answers / has no key. */
  source: 'gemini' | 'fallback'
}

interface PacketWithGuidance {
  aiGuidance?: { source?: 'gemini' | 'fallback'; indicators?: Record<string, Omit<AiIndicatorGuidance, 'source'> & { status?: string }> }
}

/** `status` is part of the key on purpose: when the indicator changes color the recommendation is fetched again. */
export function useAiIndicatorGuidance(crewId: string, type: string, status: string): AiIndicatorGuidance | null {
  const [result, setResult] = useState<{ key: string; value: AiIndicatorGuidance } | null>(null)
  const key = `${crewId}|${type}|${status}`

  useEffect(() => {
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetch(`${AI_BASE_URL}/api/packets/${encodeURIComponent(crewId)}`, { signal: AbortSignal.timeout(4000) })
        if (!res.ok) return
        const packet = (await res.json()) as PacketWithGuidance
        const own = packet.aiGuidance?.indicators?.[type]
        // Only use a text written for the color the dashboard shows right now.
        if (cancelled || !own?.doNow?.length || (own.status && own.status !== status)) return
        setResult({ key, value: { whatItIs: own.whatItIs, whyInSpace: own.whyInSpace, doNow: own.doNow, escalateWhen: own.escalateWhen, source: packet.aiGuidance?.source ?? 'fallback' } })
      } catch {
        /* relay offline: the caller's own texts stay */
      }
    }
    // Now for the rule-based text, then twice more to pick up Gemini's version of the same situation.
    const timers = [0, 3500, 8000].map((ms) => window.setTimeout(() => void load(), ms))
    return () => {
      cancelled = true
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [crewId, type, status, key])

  return result?.key === key ? result.value : null
}
