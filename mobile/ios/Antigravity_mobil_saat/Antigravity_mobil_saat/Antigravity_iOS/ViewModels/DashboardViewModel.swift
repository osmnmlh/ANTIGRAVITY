//
//  DashboardViewModel.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation
import Combine

struct MissionTask: Identifiable, Equatable {
    let id: UUID
    var title: String
    var detail: String
    var isCompleted: Bool

    init(id: UUID = UUID(), title: String, detail: String = "Günlük Protokol", isCompleted: Bool = false) {
        self.id = id
        self.title = title
        self.detail = detail
        self.isCompleted = isCompleted
    }
}

class DashboardViewModel: ObservableObject {

    // MARK: - @Published Değişkenler
    @Published var latestTelemetry: WatchTelemetryData?
    @Published var connectionStatus: String = "SİSTEMLER NORMAL"
    @Published var isCriticalAlert: Bool = false

    @Published var overallStatus: HealthStatus = .green
    @Published var heartRateStatus: HealthStatus = .green
    @Published var spo2Status: HealthStatus = .green
    @Published var bodyTempStatus: HealthStatus = .green

    // All 9 canonical health indicators (matching web ThreeBodyMap + shared/mock/astronaut-packets.json)
    @Published var indicatorValues: [HealthIndicatorType: Double] = [:]
    @Published var indicatorStatuses: [HealthIndicatorType: HealthStatus] = [:]
    @Published var radiationBudgetMsv: Double = 100.0

    // Interactive TODO missions shared between MissionListView and DashboardView
    @Published var missionTasks: [MissionTask] = [
        MissionTask(title: "Sabah Apple Watch SpO2 & Nabız Ölçümü", detail: "Vital Kontrol • 08:00", isCompleted: true),
        MissionTask(title: "Kabin CO2 ve Radyasyon Dozu Kontrolü", detail: "Çevresel Güvenlik • 10:30", isCompleted: true),
        MissionTask(title: "Günlük Direnç / Kardiyo Egzersizi (30 dk)", detail: "Mikro-yerçekimi Önlemi • 13:00", isCompleted: true),
        MissionTask(title: "Akşam Uyku & Ruh Hali Kaydı", detail: "Davranışsal Sağlık • 21:00", isCompleted: false)
    ]

    // MARK: - Servisler ve Hafıza Yönetimi
    private let telemetryService: TelemetryServiceProtocol
    private var cancellables = Set<AnyCancellable>()

    // MARK: - Computed Helpers
    var completedMissionsCount: Int {
        missionTasks.filter(\.isCompleted).count
    }

    var totalMissionsCount: Int {
        missionTasks.count
    }

    var missionCompletionRatio: Double {
        guard totalMissionsCount > 0 else { return 0 }
        return Double(completedMissionsCount) / Double(totalMissionsCount)
    }

    var missionCompletionPercent: Int {
        Int((missionCompletionRatio * 100).rounded())
    }

    var heartRateValue: Double {
        indicatorValues[.heartRate] ?? latestTelemetry?.vitals.currentHeartRate ?? 72
    }

    var spo2Value: Double {
        indicatorValues[.spo2] ?? latestTelemetry?.vitals.bloodOxygenPercentage ?? 98
    }

    var bodyTempValue: Double {
        indicatorValues[.bodyTemp] ?? latestTelemetry?.vitals.bodyTemperature ?? 36.6
    }

    var heartRateText: String {
        guard let hr = indicatorValues[.heartRate] ?? latestTelemetry?.vitals.currentHeartRate else { return "--" }
        return "\(Int(hr.rounded()))"
    }

    var spo2Text: String {
        guard let spo2 = indicatorValues[.spo2] ?? latestTelemetry?.vitals.bloodOxygenPercentage else { return "--" }
        return "\(Int(spo2.rounded()))%"
    }

    var bodyTempText: String {
        guard let temp = indicatorValues[.bodyTemp] ?? latestTelemetry?.vitals.bodyTemperature else { return "--" }
        return String(format: "%.1f °C", temp)
    }

    var bloodPressureText: String {
        guard let sys = indicatorValues[.bloodPressureSys],
              let dia = indicatorValues[.bloodPressureDia] else { return "--/--" }
        return "\(Int(sys.rounded()))/\(Int(dia.rounded()))"
    }

    var bloodPressureStatus: HealthStatus {
        let sysStatus = indicatorStatuses[.bloodPressureSys] ?? .missing
        let diaStatus = indicatorStatuses[.bloodPressureDia] ?? .missing
        return max(sysStatus, diaStatus)
    }

    var activeCalories: Double {
        latestTelemetry?.activitySummary.activeCaloriesBurned ?? 410
    }

    var exerciseMinutes: Int {
        latestTelemetry?.activitySummary.exerciseMinutes ?? 42
    }

    var standHours: Int {
        latestTelemetry?.activitySummary.standHours ?? 8
    }

    var stepCount: Int {
        latestTelemetry?.activitySummary.stepCount ?? 6420
    }

    var distanceKmText: String {
        let meters = latestTelemetry?.activitySummary.distanceMeters ?? 4650
        return String(format: "%.2f km", meters / 1000.0)
    }

    var heroStatusTitle: String {
        switch overallStatus {
        case .green:
            return "Sistemler Normal"
        case .amber:
            return "Kontrol Gerekli"
        case .red:
            return "Kritik Uyarı"
        case .missing:
            return "Veri Bekleniyor"
        }
    }

    // MARK: - Init (Başlatıcı)
    init(telemetryService: TelemetryServiceProtocol = MockTelemetryService()) {
        self.telemetryService = telemetryService
        seedMockPacketAndInitialTelemetry()
        setupBindings()
        self.telemetryService.startMonitoring()
    }

    deinit {
        telemetryService.stopMonitoring()
    }

    // MARK: - Actions
    func refreshTelemetry() {
        telemetryService.stopMonitoring()
        telemetryService.startMonitoring()
    }

    func toggleMission(_ task: MissionTask) {
        guard let index = missionTasks.firstIndex(where: { $0.id == task.id }) else { return }
        missionTasks[index].isCompleted.toggle()
    }

    func addMission(title: String, detail: String = "Özel Protokol") {
        let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }
        missionTasks.append(MissionTask(title: trimmed, detail: detail, isCompleted: false))
    }

    func deleteMission(_ task: MissionTask) {
        missionTasks.removeAll { $0.id == task.id }
    }

    // MARK: - Private
    private func seedMockPacketAndInitialTelemetry() {
        // Mirrors crew-2 nominal mock values from shared/mock/astronaut-packets.json
        radiationBudgetMsv = 100.0
        indicatorValues = [
            .heartRate: 64,
            .bloodPressureSys: 116,
            .bloodPressureDia: 74,
            .spo2: 98,
            .bodyTemp: 36.6,
            .bloodGlucose: 92,
            .sleepHours: 7.8,
            .mood: 5,
            .radiationDose: 19.4
        ]

        if let bundled = loadBundledNominalPacket() {
            radiationBudgetMsv = bundled.mission.radiationBudgetMsv
            for type in HealthIndicatorType.allCases {
                if let snap = bundled.measurements[type.rawValue] {
                    indicatorValues[type] = snap.value
                }
            }
        }

        let initial = WatchTelemetryData(
            userId: "crew-2",
            syncTimestamp: Date(),
            deviceModel: "Apple Watch Ultra 2",
            activitySummary: ActivitySummary(
                stepCount: 6840,
                activeCaloriesBurned: 485,
                exerciseMinutes: 45,
                standHours: 10,
                distanceMeters: 5210
            ),
            vitals: VitalsData(
                currentHeartRate: indicatorValues[.heartRate] ?? 64,
                restingHeartRate: 60,
                bloodOxygenPercentage: indicatorValues[.spo2] ?? 98,
                bodyTemperature: indicatorValues[.bodyTemp] ?? 36.6
            ),
            environmentalData: EnvironmentalData(
                altitudeMeters: 408_000,
                atmosphericPressure: 1013.5,
                gForce: GForceData(xAxis: 0.0, yAxis: 0.01, zAxis: 0.02)
            )
        )
        applyTelemetry(initial)
    }

    private func loadBundledNominalPacket() -> AstronautHealthPacket? {
        guard let url = Bundle.main.url(forResource: "astronaut-packets", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let bundle = try? HealthJSONCodec.decoder.decode(AstronautPacketBundle.self, from: data) else {
            return nil
        }
        return bundle.astronauts.first(where: { $0.astronautId == "crew-2" }) ?? bundle.astronauts.first
    }

    private func setupBindings() {
        telemetryService.telemetryPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                self?.applyTelemetry(data)
            }
            .store(in: &cancellables)
    }

    private func applyTelemetry(_ data: WatchTelemetryData) {
        latestTelemetry = data

        // Update live watch metrics into the shared indicator map
        indicatorValues[.heartRate] = data.vitals.currentHeartRate
        if let spo2 = data.vitals.bloodOxygenPercentage {
            indicatorValues[.spo2] = spo2
        }
        if let temp = data.vitals.bodyTemperature {
            indicatorValues[.bodyTemp] = temp
        }

        evaluateStatuses()
    }

    // Alarm ve durum renkleri tek kaynaktan gelir: HealthThresholds (Thresholds.swift).
    private func evaluateStatuses() {
        var computed: [HealthIndicatorType: HealthStatus] = [:]
        for type in HealthIndicatorType.allCases {
            computed[type] = HealthThresholds.status(
                for: type,
                value: indicatorValues[type],
                radiationBudgetMsv: radiationBudgetMsv
            )
        }
        indicatorStatuses = computed

        heartRateStatus = computed[.heartRate] ?? .missing
        spo2Status = computed[.spo2] ?? .missing
        bodyTempStatus = computed[.bodyTemp] ?? .missing

        let worst = computed.values.max() ?? .missing
        overallStatus = worst
        isCriticalAlert = (worst == .red)

        switch worst {
        case .green:
            connectionStatus = "SİSTEMLER NORMAL"
        case .amber:
            connectionStatus = "KONTROL GEREKLİ"
        case .red:
            connectionStatus = "KRİTİK UYARI"
        case .missing:
            connectionStatus = "VERİ BEKLENİYOR"
        }
    }
}
