// Shapes from shared/contracts/ai.md. Field names stay English; text values are Turkish.

export type AiStatus = 'green' | 'amber' | 'red'
export type Escalation = 'none' | 'cmo' | 'flightSurgeon'

export interface CabinReading {
  metric: string
  value: number | string
  unit: string
  status: AiStatus
  timestamp: string
  label?: string
}

export interface CabinSnapshot {
  module: string
  crewIds: string[]
  overallStatus: AiStatus
  readings: CabinReading[]
  updatedAt: string
}

export interface AlertMetric {
  kind: 'cabin' | 'vital'
  crewId?: string
  type: string
  value: number | string
  unit: string
  status: AiStatus
}

export interface AlertAdvice {
  why: string
  doNow: string[]
  escalate: string
  source: 'gemini' | 'fallback'
  model: string | null
  generatedAt: string
}

export interface AlertDelivery {
  deviceId: string
  crewId: string
  deliveredAt: string | null
  ackedAt: string | null
}

export interface Alert {
  id: string
  scope: 'cabin' | 'crew'
  crewIds: string[]
  severity: 'amber' | 'red'
  scenarioId: string
  hazardId: string
  title: string
  spokenText: string
  metrics: AlertMetric[]
  advice: AlertAdvice | null
  deliveries: AlertDelivery[]
  cockpitAckedAt: string | null
  state: 'active' | 'resolved'
  createdAt: string
  updatedAt: string
  disclaimer: string
}

export interface ChatMessage {
  role: 'user' | 'model'
  text: string
  /** Extra fields kept only in the browser for display. */
  meta?: Omit<ChatResponse, 'reply'>
}

export interface ChatResponse {
  reply: string
  source: 'gemini' | 'fallback'
  model?: string | null
  escalation?: Escalation
  indicators?: string[]
  suggestions?: string[]
  disclaimer?: string
}

export type ChatContext = { scope: 'cabin'; crewId?: undefined } | { scope: 'crew'; crewId: string }
