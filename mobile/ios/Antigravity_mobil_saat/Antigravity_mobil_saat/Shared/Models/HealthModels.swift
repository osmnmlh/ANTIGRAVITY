import Foundation

// MARK: - Canonical Shared Data Contract (Web + iPhone + Apple Watch)

/// Supported health indicators aligned with NASA HRP hazards and the shared JSON contract.
enum HealthIndicatorType: String, Codable, CaseIterable, Sendable {
    case heartRate
    case bloodPressureSys
    case bloodPressureDia
    case spo2
    case bodyTemp
    case bloodGlucose
    case sleepHours
    case mood
    case radiationDose

    var defaultUnit: String {
        switch self {
        case .heartRate: return "bpm"
        case .bloodPressureSys, .bloodPressureDia: return "mmHg"
        case .spo2: return "%"
        case .bodyTemp: return "°C"
        case .bloodGlucose: return "mg/dL"
        case .sleepHours: return "h"
        case .mood: return "1-5"
        case .radiationDose: return "mSv"
        }
    }

    var displayName: String {
        switch self {
        case .heartRate: return "Heart Rate"
        case .bloodPressureSys: return "Blood Pressure (Sys)"
        case .bloodPressureDia: return "Blood Pressure (Dia)"
        case .spo2: return "Blood Oxygen (SpO2)"
        case .bodyTemp: return "Body Temperature"
        case .bloodGlucose: return "Blood Glucose"
        case .sleepHours: return "Sleep Hours"
        case .mood: return "Mood"
        case .radiationDose: return "Cumulative Radiation"
        }
    }
}

/// Origin of a measurement.
enum SampleSource: String, Codable, Sendable {
    case watch
    case iphone
    case manual
    case mock
}

/// Time-series measurement record matching `shared/mock/samples.json`.
struct HealthSample: Codable, Identifiable, Sendable {
    let id: String
    let crewId: String
    let type: HealthIndicatorType
    let value: Double
    let unit: String
    let timestamp: Date
    let source: SampleSource

    init(
        id: String = UUID().uuidString,
        crewId: String,
        type: HealthIndicatorType,
        value: Double,
        unit: String? = nil,
        timestamp: Date = Date(),
        source: SampleSource
    ) {
        self.id = id
        self.crewId = crewId
        self.type = type
        self.value = value
        self.unit = unit ?? type.defaultUnit
        self.timestamp = timestamp
        self.source = source
    }
}

// MARK: - Astronaut Data Packet (Astronaut ID + Full Name + Measurements + Watch Telemetry)

struct AstronautPacketBundle: Codable, Sendable {
    let schemaVersion: String
    let disclaimer: String
    let generatedAt: Date
    let nasaHazardsSource: String?
    let astronauts: [AstronautHealthPacket]
}

struct AstronautHealthPacket: Codable, Identifiable, Sendable {
    let astronautId: String
    let fullName: String
    let role: String
    let mission: MissionContext
    let activeHazardIds: [NasaHazardId]?
    let lastUpdated: Date
    let measurements: [String: MeasurementSnapshot]
    let watchTelemetry: WatchTelemetryData?
    /// AI recommendation from the backend (Gemini). Show as "AI recommendation"; may be nil.
    let aiGuidance: AiGuidance?

    var id: String { astronautId }

    /// Converts all latest measurements in the packet into canonical `HealthSample` records.
    func toHealthSamples() -> [HealthSample] {
        HealthIndicatorType.allCases.compactMap { indicator in
            guard let snapshot = measurements[indicator.rawValue] else { return nil }
            return HealthSample(
                id: "\(astronautId)-\(indicator.rawValue)-\(Int(snapshot.timestamp.timeIntervalSince1970))",
                crewId: astronautId,
                type: indicator,
                value: snapshot.value,
                unit: snapshot.unit,
                timestamp: snapshot.timestamp,
                source: snapshot.source
            )
        }
    }
}

struct MissionContext: Codable, Sendable {
    let name: String
    let environment: MissionEnvironment
    let missionDay: Int
    let commsDelayMinutes: Int
    let radiationBudgetMsv: Double
}

enum MissionEnvironment: String, Codable, Sendable {
    case spacecraft
    case iss
    case lunarBase
    case marsTransit
    case rover
}

struct MeasurementSnapshot: Codable, Sendable {
    let value: Double
    let unit: String
    let timestamp: Date
    let source: SampleSource
}

// MARK: - AI Guidance (filled by backend, displayed on iPhone)

/// AI recommendation attached to an `AstronautHealthPacket` by the backend (`POST /api/ai/guidance`).
/// `overallStatus` comes from the deterministic threshold engine; the AI never decides the color.
struct AiGuidance: Codable, Sendable {
    enum Source: String, Codable, Sendable {
        case gemini
        case fallback
    }

    let generatedAt: Date
    let source: Source
    let model: String?
    let overallStatus: HealthStatus
    let summary: String
    let actions: [String]
    let escalate: String
    let disclaimer: String
}

// MARK: - Proactive AI Alerts (SSE /api/ai/stream)

struct AiAlertAdvice: Codable, Sendable, Equatable {
    let summary: String?
    let why: String
    let doNow: [String]
    let escalate: String
    let source: String
    let model: String?
    let generatedAt: Date
}

struct AiAlert: Codable, Identifiable, Sendable, Equatable {
    let id: String
    let scope: String
    let crewIds: [String]
    let severity: HealthStatus
    let scenarioId: String
    let hazardId: String
    let title: String
    let spokenText: String
    let advice: AiAlertAdvice?
    let state: String
    let createdAt: Date
    let updatedAt: Date
    let disclaimer: String
}

struct AiHelloPayload: Codable, Sendable {
    let alerts: [AiAlert]
}

// MARK: - Apple Watch Telemetry Package

/// Primary telemetry packet sent from Apple Watch to iPhone and Web.
struct WatchTelemetryData: Codable, Sendable {
    let userId: String
    let syncTimestamp: Date
    let deviceModel: String
    let activitySummary: ActivitySummary
    let vitals: VitalsData
    let environmentalData: EnvironmentalData?

    /// Converts Apple Watch sensor readings into canonical `HealthSample` entries
    /// so iPhone and Web dashboards evaluate them with the same threshold engine.
    func toHealthSamples() -> [HealthSample] {
        var samples: [HealthSample] = [
            HealthSample(
                crewId: userId,
                type: .heartRate,
                // Thresholds are for resting HR; live HR during exercise would raise false alarms.
                value: vitals.restingHeartRate ?? vitals.currentHeartRate,
                timestamp: syncTimestamp,
                source: .watch
            )
        ]

        if let spo2 = vitals.bloodOxygenPercentage {
            samples.append(
                HealthSample(
                    crewId: userId,
                    type: .spo2,
                    value: spo2,
                    timestamp: syncTimestamp,
                    source: .watch
                )
            )
        }

        if let bodyTemp = vitals.bodyTemperature {
            samples.append(
                HealthSample(
                    crewId: userId,
                    type: .bodyTemp,
                    value: bodyTemp,
                    timestamp: syncTimestamp,
                    source: .watch
                )
            )
        }

        return samples
    }
}

/// Activity rings and movement metrics captured by Apple Watch.
struct ActivitySummary: Codable, Sendable {
    let stepCount: Int
    let activeCaloriesBurned: Double
    let exerciseMinutes: Int
    let standHours: Int
    let distanceMeters: Double
}

/// Core physiological vitals measured or synced on Apple Watch.
struct VitalsData: Codable, Sendable {
    let currentHeartRate: Double
    let restingHeartRate: Double?
    let bloodOxygenPercentage: Double?
    let bodyTemperature: Double?
}

/// Cabin/surface environmental context alongside accelerometer G-force.
struct EnvironmentalData: Codable, Sendable {
    let altitudeMeters: Double
    let atmosphericPressure: Double
    let gForce: GForceData?
}

/// 3-axis acceleration in G units.
struct GForceData: Codable, Sendable {
    let xAxis: Double
    let yAxis: Double
    let zAxis: Double
}

// MARK: - NASA HRP 5 Hazards Catalog (https://www.nasa.gov/hrp/hazards/)

enum NasaHazardId: String, Codable, CaseIterable, Sendable {
    case spaceRadiation
    case isolationConfinement
    case distanceFromEarth
    case gravityFields
    case hostileClosedEnvironments
}

struct NasaHazardsCatalog: Codable, Sendable {
    let schemaVersion: String
    let sourceName: String
    let sourceUrl: String
    let sourceLastUpdated: String
    let hazards: [NasaHazard]
}

struct NasaHazard: Codable, Identifiable, Sendable {
    let id: NasaHazardId
    let order: Int
    let title: String
    let url: String
    let videoUrl: String
    let summary: String
    let healthEffects: [String]
    let mitigations: [String]
    let referenceMetrics: NasaHazardReferenceMetrics
    let relatedIndicators: [HealthIndicatorType]
    let relatedWatchMetrics: [String]
}

struct NasaHazardReferenceMetrics: Codable, Sendable {
    let issDailyDoseMsv: String?
    let marsTransitDailyDoseMsv: String?
    let nasaCareerLimitMsv: Double?
    let targetSleepHours: String?
    let targetMoodScale: String?
    let marsAverageDistanceMiles: Int?
    let marsMissionDurationYears: Int?
    let lunarTripDays: Int?
    let maxOneWayCommsDelayMinutes: Int?
    let boneLossPerMonthPercent: String?
    let marsGravityFractionEarth: String?
    let lunarGravityFractionEarth: String?
    let habitabilityFactors: [String]?
}

// MARK: - Shared JSON Coding Helpers

enum HealthJSONCodec {
    private static let isoWithFractionalSeconds: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        return formatter
    }()

    private static let isoStandard: ISO8601DateFormatter = {
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime]
        return formatter
    }()

    static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .custom { decoder in
            let container = try decoder.singleValueContainer()
            let string = try container.decode(String.self)
            if let date = isoWithFractionalSeconds.date(from: string) ?? isoStandard.date(from: string) {
                return date
            }
            throw DecodingError.dataCorruptedError(
                in: container,
                debugDescription: "Invalid ISO-8601 date: \(string)"
            )
        }
        return decoder
    }()

    static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        encoder.outputFormatting = [.prettyPrinted, .sortedKeys]
        return encoder
    }()
}
