export const healthTypes = [
  'heartRate',
  'bloodPressureSys',
  'bloodPressureDia',
  'spo2',
  'bodyTemp',
  'bloodGlucose',
  'sleepHours',
  'mood',
  'radiationDose',
] as const

export type HealthType = (typeof healthTypes)[number]
export type HealthSource = 'watch' | 'iphone' | 'manual' | 'mock'
export type HealthStatus = 'green' | 'amber' | 'red' | 'missing'

export interface HealthSample {
  id: string
  crewId: string
  type: HealthType
  value: number
  unit: string
  timestamp: string
  source: HealthSource
}

export const metricDefinitions: Record<
  HealthType,
  { label: string; shortLabel: string; unit: string; displayUnit: string; input: string }
> = {
  heartRate: {
    label: 'Dinlenik nabız',
    shortLabel: 'Nabız',
    unit: 'bpm',
    displayUnit: 'bpm',
    input: 'Kalp atış hızı',
  },
  bloodPressureSys: {
    label: 'Sistolik tansiyon',
    shortLabel: 'SYS',
    unit: 'mmHg',
    displayUnit: 'mmHg',
    input: 'Tansiyon · büyük',
  },
  bloodPressureDia: {
    label: 'Diyastolik tansiyon',
    shortLabel: 'DIA',
    unit: 'mmHg',
    displayUnit: 'mmHg',
    input: 'Tansiyon · küçük',
  },
  spo2: {
    label: 'Kan oksijeni',
    shortLabel: 'SpO₂',
    unit: '%',
    displayUnit: '%',
    input: 'Kan oksijeni',
  },
  bodyTemp: {
    label: 'Vücut sıcaklığı',
    shortLabel: 'Sıcaklık',
    unit: '°C',
    displayUnit: '°C',
    input: 'Vücut sıcaklığı',
  },
  bloodGlucose: {
    label: 'Açlık kan şekeri',
    shortLabel: 'Glukoz',
    unit: 'mg/dL',
    displayUnit: 'mg/dL',
    input: 'Kan şekeri',
  },
  sleepHours: {
    label: 'Son 24 saatte uyku',
    shortLabel: 'Uyku',
    unit: 'h',
    displayUnit: 'saat',
    input: 'Uyku süresi',
  },
  mood: {
    label: 'Ruh hâli',
    shortLabel: 'Ruh hâli',
    unit: '1-5',
    displayUnit: '/ 5',
    input: 'Ruh hâli',
  },
  radiationDose: {
    label: 'Görev radyasyon dozu',
    shortLabel: 'Radyasyon',
    unit: 'mSv',
    displayUnit: 'mSv',
    input: 'Radyasyon dozu',
  },
}

export function isHealthSample(value: unknown): value is HealthSample {
  if (!value || typeof value !== 'object') return false
  const sample = value as Record<string, unknown>
  return (
    typeof sample.id === 'string' &&
    typeof sample.crewId === 'string' &&
    typeof sample.type === 'string' &&
    healthTypes.includes(sample.type as HealthType) &&
    typeof sample.value === 'number' &&
    Number.isFinite(sample.value) &&
    typeof sample.unit === 'string' &&
    typeof sample.timestamp === 'string' &&
    Number.isFinite(Date.parse(sample.timestamp)) &&
    ['watch', 'iphone', 'manual', 'mock'].includes(String(sample.source))
  )
}
