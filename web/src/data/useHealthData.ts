import { useEffect, useState } from 'react'
import sharedSamples from '../../../shared/mock/samples.json'
import {
  healthTypes,
  isHealthSample,
  metricDefinitions,
  type HealthSample,
  type HealthSource,
  type HealthType,
} from '../domain/types'

const storageKey = 'antigravity.health-samples.v2'
const sharedSeedSamples = sharedSamples.filter(isHealthSample)
const baselineValues: Record<HealthType, number> = {
  heartRate: 72,
  bloodPressureSys: 118,
  bloodPressureDia: 76,
  spo2: 97,
  bodyTemp: 36.5,
  bloodGlucose: 96,
  sleepHours: 7.5,
  mood: 4,
  radiationDose: 21,
}
const baselineTimestamp = new Date().toISOString()
const initialSamples = healthTypes.flatMap((type) => {
  const seed = latestSampleFor(sharedSeedSamples, type)
  return seed
    ? [{
        ...seed,
        id: `web-demo-${type}`,
        value: baselineValues[type],
        timestamp: baselineTimestamp,
        source: 'mock' as const,
      }]
    : []
})

function readSamples(): HealthSample[] {
  try {
    const stored = window.localStorage.getItem(storageKey)
    if (!stored) return initialSamples
    const parsed: unknown = JSON.parse(stored)
    if (Array.isArray(parsed) && parsed.every(isHealthSample)) return parsed
    console.error('Saved health samples have an invalid shape; using the shared demo samples.')
    return initialSamples
  } catch (error) {
    console.error('Could not load saved health samples from local storage.', error)
    return initialSamples
  }
}

export function createSample(type: HealthType, value: number, source: HealthSource): HealthSample {
  return {
    id: crypto.randomUUID(),
    crewId: 'crew-1',
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

  function addSample(type: HealthType, value: number, source: HealthSource) {
    addSamples([createSample(type, value, source)])
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
