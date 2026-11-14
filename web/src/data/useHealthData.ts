import { useEffect, useState } from 'react'
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

const storageKey = 'antigravity.health-samples.v3'
const legacyStorageKey = 'antigravity.health-samples.v2'
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

  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(samples))
    } catch (error) {
      console.error('Could not save health samples to local storage.', error)
    }
  }, [samples])

  function addSamples(nextSamples: HealthSample[]) {
    setSamples((current) => [...current, ...nextSamples])
  }

  function addSample(type: HealthType, value: number, source: HealthSource, crewId: string) {
    addSamples([createSample(type, value, source, crewId)])
  }

  function resetSamples() {
    setSamples(initialSamples)
  }

  return { samples, addSample, addSamples, resetSamples }
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
