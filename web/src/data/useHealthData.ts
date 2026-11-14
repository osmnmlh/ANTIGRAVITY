import { useEffect, useRef, useState } from 'react'
import astronautPacketData from '../../../shared/mock/astronaut-packets.json'
import sharedSamples from '../../../shared/mock/samples.json'
import {
  healthTypes,
  isHealthSample,
  metricDefinitions,
  type HealthSample,
  type HealthSource,
  type HealthType,
} from '../domain/types'

const storageKey = 'antigravity.health-samples.v4'
const legacyStorageKey = 'antigravity.health-samples.v3'
const apiBaseUrl = (import.meta.env.VITE_API_URL ?? 'http://localhost:8787').replace(/\/$/, '')
export type HealthDataConnection = 'connecting' | 'connected' | 'offline'
export interface SimulationStatus {
  mode: string
  running: boolean
  crewId: string | null
}
const sharedSeedSamples = sharedSamples.filter(isHealthSample)
const packetSamples = astronautPacketData.astronauts.flatMap((astronaut) =>
  healthTypes.flatMap((type) => {
    const measurement = astronaut.measurements[type]
    if (!measurement) return []

    const sample = {
      id: `${astronaut.astronautId}-${type}-${measurement.timestamp}`,
      crewId: astronaut.astronautId,
      type,
      value: measurement.value,
      unit: measurement.unit,
      timestamp: measurement.timestamp,
      source: measurement.source,
    }
    if (!isHealthSample(sample)) {
      console.error(`Invalid ${type} measurement in the ${astronaut.astronautId} packet.`)
      return []
    }
    return [sample]
  }),
)
const packetSampleKeys = new Set(
  packetSamples.map(({ crewId, type, timestamp }) => `${crewId}:${type}:${timestamp}`),
)
const initialSamples = [
  ...sharedSeedSamples.filter(
    ({ crewId, type, timestamp }) => !packetSampleKeys.has(`${crewId}:${type}:${timestamp}`),
  ),
  ...packetSamples,
]

function mergeSamples(current: HealthSample[], incoming: HealthSample[]) {
  const samplesByKey = new Map(
    current.map((sample) => [`${sample.crewId}:${sample.type}:${sample.timestamp}`, sample]),
  )
  for (const sample of incoming) {
    samplesByKey.set(`${sample.crewId}:${sample.type}:${sample.timestamp}`, sample)
  }
  return Array.from(samplesByKey.values())
}

export const astronautProfiles = astronautPacketData.astronauts.map((astronaut, index) => ({
  id: astronaut.astronautId,
  name: astronaut.fullName,
  role: astronaut.role,
  missionName: astronaut.mission.name,
  radiationBudgetMsv: astronaut.mission.radiationBudgetMsv,
  code: `AST-${String(index + 1).padStart(2, '0')}`,
}))

function mergeWithInitialSamples(savedSamples: HealthSample[]) {
  const initialKeys = new Set(
    initialSamples.map(({ crewId, type, timestamp }) => `${crewId}:${type}:${timestamp}`),
  )
  const additionalSamples = savedSamples.filter(
    (sample) =>
      !sample.id.startsWith('web-demo-') &&
      !initialKeys.has(`${sample.crewId}:${sample.type}:${sample.timestamp}`),
  )
  return [...initialSamples, ...additionalSamples]
}

function readSamples(): HealthSample[] {
  try {
    const stored = window.localStorage.getItem(storageKey) ?? window.localStorage.getItem(legacyStorageKey)
    if (!stored) return initialSamples
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed) && parsed.every(isHealthSample)) return mergeWithInitialSamples(parsed)
    console.error('Saved health samples have an invalid shape; using the shared demo samples.')
    return initialSamples
  } catch (error) {
    console.error('Could not load saved health samples from local storage.', error)
    return initialSamples
  }
}

export function createSample(
  type: HealthType,
  value: number,
  source: HealthSource,
  crewId: string,
): HealthSample {
  return {
    id: crypto.randomUUID(),
    crewId,
    type,
    value,
    unit: metricDefinitions[type].unit,
    timestamp: new Date().toISOString(),
    source,
  }
}

export function useHealthData() {
  const [samples, setSamples] = useState<HealthSample[]>(readSamples)
  const [connection, setConnection] = useState<HealthDataConnection>('connecting')
  const [simulation, setSimulation] = useState<SimulationStatus>({
    mode: 'idle',
    running: false,
    crewId: null,
  })
  const apiConnected = useRef(false)

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(samples))
    } catch (error) {
      console.error('Could not save health samples to local storage.', error)
    }
  }, [samples])

  useEffect(() => {
    let active = true
    const controller = new AbortController()
    let stream: EventSource | null = null

    const updateSimulation = (payload: unknown) => {
      if (!active) return
      if (
        !payload ||
        typeof payload !== 'object' ||
        typeof (payload as Record<string, unknown>).mode !== 'string' ||
        typeof (payload as Record<string, unknown>).running !== 'boolean'
      ) {
        return
      }
      const status = payload as Record<string, unknown>
      setSimulation({
        mode: status.mode as string,
        running: status.running as boolean,
        crewId: typeof status.crewId === 'string' ? status.crewId : null,
      })
    }

    async function connect() {
      try {
        const healthRes = await fetch(`${apiBaseUrl}/api/health`, { signal: controller.signal })
        if (!healthRes.ok) throw new Error(`Health check returned HTTP ${healthRes.status}`)

        const samplesRes = await fetch(`${apiBaseUrl}/api/samples`, { signal: controller.signal })
        if (!samplesRes.ok) throw new Error(`Telemetry API returned HTTP ${samplesRes.status}`)
        const payload: unknown = await samplesRes.json()
        if (!Array.isArray(payload) || !payload.every(isHealthSample)) {
          throw new Error('Telemetry API returned an invalid health sample list.')
        }

        if (!active) return
        setSamples((current) => mergeSamples(current, payload))
        apiConnected.current = true
        setConnection('connected')

        stream = new EventSource(`${apiBaseUrl}/api/stream`)

        stream.addEventListener('hello', (event) => {
          if (!active) return
          apiConnected.current = true
          setConnection('connected')
          try {
            const data: unknown = JSON.parse((event as MessageEvent<string>).data)
            if (data && typeof data === 'object') {
              updateSimulation((data as Record<string, unknown>).simulation)
            }
          } catch {
            // silent fallback
          }
        })

        stream.addEventListener('sample', (event) => {
          if (!active) return
          try {
            const sample: unknown = JSON.parse((event as MessageEvent<string>).data)
            if (!isHealthSample(sample)) return
            apiConnected.current = true
            setConnection('connected')
            setSamples((current) => mergeSamples(current, [sample]))
          } catch {
            // silent fallback
          }
        })

        stream.addEventListener('simulation', (event) => {
          if (!active) return
          try {
            const data: unknown = JSON.parse((event as MessageEvent<string>).data)
            updateSimulation(data)
          } catch {
            // silent fallback
          }
        })

        stream.addEventListener('error', () => {
          if (!active) return
          apiConnected.current = false
          setConnection('offline')
          stream?.close()
          stream = null
        })
      } catch {
        if (!active) return
        apiConnected.current = false
        setConnection('offline')
      }
    }

    void connect()

    return () => {
      active = false
      apiConnected.current = false
      controller.abort()
      stream?.close()
      stream = null
    }
  }, [])

  function addSamples(nextSamples: HealthSample[]) {
    setSamples((current) => mergeSamples(current, nextSamples))
    if (!apiConnected.current) return
    fetch(`${apiBaseUrl}/api/samples`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(nextSamples),
    }).then((response) => {
      if (!response.ok) throw new Error(`Telemetry API returned HTTP ${response.status}.`)
    }).catch(() => {
      apiConnected.current = false
      setConnection('offline')
    })
  }

  function addSample(type: HealthType, value: number, source: HealthSource, crewId: string) {
    addSamples([createSample(type, value, source, crewId)])
  }

  function resetSamples() {
    setSamples(initialSamples)
    if (!apiConnected.current) return
    fetch(`${apiBaseUrl}/api/simulation/reset`, { method: 'POST' }).then(async (response) => {
      if (!response.ok) throw new Error(`Telemetry API returned HTTP ${response.status}.`)
      const samplesResponse = await fetch(`${apiBaseUrl}/api/samples`)
      if (!samplesResponse.ok) throw new Error(`Telemetry API returned HTTP ${samplesResponse.status}.`)
      const payload: unknown = await samplesResponse.json()
      if (!Array.isArray(payload) || !payload.every(isHealthSample)) {
        throw new Error('Telemetry API returned an invalid health sample list.')
      }
      setSamples(payload)
    }).catch(() => {
      apiConnected.current = false
      setConnection('offline')
    })
  }

  async function startLiveSimulation(crewId: string) {
    const response = await fetch(`${apiBaseUrl}/api/simulation/live/start`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ crewId }),
    })
    if (!response.ok) throw new Error(`Could not start live telemetry (HTTP ${response.status}).`)
  }

  async function stopLiveSimulation() {
    const response = await fetch(`${apiBaseUrl}/api/simulation/stop`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ reset: true }),
    })
    if (!response.ok) throw new Error(`Could not stop live telemetry (HTTP ${response.status}).`)
    const samplesResponse = await fetch(`${apiBaseUrl}/api/samples`)
    if (!samplesResponse.ok) throw new Error(`Telemetry API returned HTTP ${samplesResponse.status}.`)
    const payload: unknown = await samplesResponse.json()
    if (!Array.isArray(payload) || !payload.every(isHealthSample)) {
      throw new Error('Telemetry API returned an invalid health sample list.')
    }
    setSamples(payload)
  }

  return {
    samples,
    addSample,
    addSamples,
    resetSamples,
    connection,
    simulation,
    startLiveSimulation,
    stopLiveSimulation,
  }
}

export function latestSampleFor(samples: HealthSample[], type: HealthType) {
  return samples
    .filter((sample) => sample.type === type)
    .reduce<HealthSample | undefined>(
      (latest, sample) =>
        !latest || Date.parse(sample.timestamp) > Date.parse(latest.timestamp) ? sample : latest,
      undefined,
    )
}
