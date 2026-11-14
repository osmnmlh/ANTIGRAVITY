export type HealthIndicatorType =
  | 'heartRate'
  | 'bloodPressureSys'
  | 'bloodPressureDia'
  | 'spo2'
  | 'bodyTemp'
  | 'bloodGlucose'
  | 'sleepHours'
  | 'mood'
  | 'radiationDose';

export type SampleSource = 'watch' | 'iphone' | 'manual' | 'mock';

export type HealthStatus = 'green' | 'amber' | 'red' | 'missing';

export type MissionEnvironment =
  | 'spacecraft'
  | 'iss'
  | 'lunarBase'
  | 'marsTransit'
  | 'rover';

export interface HealthSample {
  id: string;
  crewId: string;
  type: HealthIndicatorType;
  value: number;
  unit: string;
  timestamp: string; // ISO-8601 UTC timestamp
  source: SampleSource;
}

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
