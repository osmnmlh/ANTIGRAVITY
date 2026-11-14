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

// ---------------------------------------------------------------------------
// Packet, Watch telemetry, NASA hazard and AI guidance types (shared contract,
// mirrored in mobile/ios/Antigravity_mobil_saat/Antigravity_mobil_saat/Shared/Models/HealthModels.swift; used by backend/server.mjs).
// ---------------------------------------------------------------------------

/** Alias used by the packet / backend code; same union as `HealthType`. */
export type HealthIndicatorType = HealthType
/** Alias used by the packet / backend code; same union as `HealthSource`. */
export type SampleSource = HealthSource

export type MissionEnvironment =
  | 'spacecraft'
  | 'iss'
  | 'lunarBase'
  | 'marsTransit'
  | 'rover';

export interface MeasurementSnapshot {
  value: number;
  unit: string;
  timestamp: string;
  source: SampleSource;
}

export interface MissionContext {
  name: string;
  environment: MissionEnvironment;
  missionDay: number;
  commsDelayMinutes: number;
  radiationBudgetMsv: number;
}

export interface ActivitySummary {
  stepCount: number;
  activeCaloriesBurned: number;
  exerciseMinutes: number;
  standHours: number;
  distanceMeters: number;
}

export interface VitalsData {
  currentHeartRate: number;
  restingHeartRate?: number | null;
  bloodOxygenPercentage?: number | null;
  bodyTemperature?: number | null;
}

export interface GForceData {
  xAxis: number;
  yAxis: number;
  zAxis: number;
}

export interface EnvironmentalData {
  altitudeMeters: number;
  atmosphericPressure: number;
  gForce?: GForceData | null;
}

export interface WatchTelemetryData {
  userId: string;
  syncTimestamp: string;
  deviceModel: string;
  activitySummary: ActivitySummary;
  vitals: VitalsData;
  environmentalData?: EnvironmentalData | null;
}

export type NasaHazardId =
  | 'spaceRadiation'
  | 'isolationConfinement'
  | 'distanceFromEarth'
  | 'gravityFields'
  | 'hostileClosedEnvironments';

export interface AstronautHealthPacket {
  astronautId: string;
  fullName: string;
  role: string;
  mission: MissionContext;
  activeHazardIds?: NasaHazardId[];
  lastUpdated: string;
  measurements: Partial<Record<HealthIndicatorType, MeasurementSnapshot>>;
  watchTelemetry?: WatchTelemetryData | null;
  /** AI recommendation produced by the backend (Gemini) and shown on iPhone/Web. */
  aiGuidance?: AiGuidance | null;
}

/**
 * AI recommendation attached to an AstronautHealthPacket.
 * Created only by the backend (`POST /api/ai/guidance`), which keeps the Gemini key server-side.
 * `overallStatus` is copied from the deterministic threshold engine; the AI never decides the color.
 */
export interface AiGuidance {
  generatedAt: string; // ISO-8601 UTC
  source: 'gemini' | 'fallback';
  model?: string | null;
  overallStatus: HealthStatus;
  summary: string;
  actions: string[];
  escalate: string;
  disclaimer: string;
}

export interface AstronautPacketBundle {
  schemaVersion: string;
  disclaimer: string;
  generatedAt: string;
  nasaHazardsSource?: string;
  astronauts: AstronautHealthPacket[];
}

export interface NasaHazardReferenceMetrics {
  issDailyDoseMsv?: string;
  marsTransitDailyDoseMsv?: string;
  nasaCareerLimitMsv?: number;
  targetSleepHours?: string;
  targetMoodScale?: string;
  marsAverageDistanceMiles?: number;
  marsMissionDurationYears?: number;
  lunarTripDays?: number;
  maxOneWayCommsDelayMinutes?: number;
  boneLossPerMonthPercent?: string;
  marsGravityFractionEarth?: string;
  lunarGravityFractionEarth?: string;
  habitabilityFactors?: string[];
}

export interface NasaHazard {
  id: NasaHazardId;
  order: number;
  title: string;
  url: string;
  videoUrl: string;
  summary: string;
  healthEffects: string[];
  mitigations: string[];
  referenceMetrics: NasaHazardReferenceMetrics;
  relatedIndicators: HealthIndicatorType[];
  relatedWatchMetrics: string[];
}

export interface NasaHazardsCatalog {
  schemaVersion: string;
  sourceName: string;
  sourceUrl: string;
  sourceLastUpdated: string;
  hazards: NasaHazard[];
}

export interface IndicatorGuidance {
  whatItIs: string;
  whyInSpace: string;
  doNow: string[];
  escalateWhen: string;
}

export type TrendDirection = 'rising' | 'falling' | 'stable';

export interface TrendAssessment {
  type: HealthIndicatorType;
  pointStatus: HealthStatus;
  trendStatus: HealthStatus;
  effectiveStatus: HealthStatus;
  direction: TrendDirection;
  reason: string | null;
}
