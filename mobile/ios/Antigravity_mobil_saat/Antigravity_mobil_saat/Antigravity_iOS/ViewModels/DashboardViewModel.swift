//
//  DashboardViewModel.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation
import Combine
import UserNotifications

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
    @Published var crewId: String = Constants.defaultCrewId
    @Published var astronautPacket: AstronautHealthPacket?
    @Published var aiGuidance: AiGuidance?
    @Published private(set) var latestBackendGuidance: AiGuidance?
    @Published var activeAlerts: [AiAlert] = []
    @Published private(set) var houstonSyncRevision: Int = 0
    @Published var lastWatchSyncAt: Date?
    @Published var isSyncingBackend: Bool = false
    @Published var lastSampleSyncMessage: String?

    @Published var indicatorValues: [HealthIndicatorType: Double] = [:]
    @Published var indicatorStatuses: [HealthIndicatorType: HealthStatus] = [:]
    @Published var indicatorTrends: [HealthIndicatorType: TrendAssessment] = [:]
    @Published var moodAssessment: AlgorithmicMoodAssessment?
    @Published private(set) var latestWatchSymptoms: [String] = []
    @Published private(set) var hasSyncedFromBackend: Bool = false
    @Published var radiationBudgetMsv: Double = 100.0

    // MARK: - Servisler ve Hafıza Yönetimi
    private let telemetryService: TelemetryServiceProtocol
    private var cancellables = Set<AnyCancellable>()
    private var aiStreamTask: Task<Void, Never>?
    private var relayStreamTask: Task<Void, Never>?
    private var journalAnalysisTask: Task<Void, Never>?
    private var notifiedAlertIds = Set<String>()
    private var sampleHistory: [HealthSample] = []
    private var latestJournalInputs: [JournalNoteInput] = []
    private var cachedJournalSentiment: JournalSentimentResult = JournalSentimentAnalyzer.evaluateLocally([])
    private var lastAnalyzedJournalDigest: String = ""

    // MARK: - Computed Helpers
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

    var heroGreeting: String {
        guard let fullName = astronautPacket?.fullName.trimmingCharacters(in: .whitespacesAndNewlines),
              !fullName.isEmpty else {
            return "Hoşgeldiniz,"
        }
        return "Hoşgeldiniz, \(fullName)"
    }

    var heroSubtitle: String? {
        guard let mission = astronautPacket?.mission else { return nil }
        return "\(mission.name) • Gün \(mission.missionDay)"
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
        setupWatchConnectivity()
        self.telemetryService.startMonitoring()
    }

    deinit {
        telemetryService.stopMonitoring()
        aiStreamTask?.cancel()
        relayStreamTask?.cancel()
        journalAnalysisTask?.cancel()
    }

    // MARK: - Actions
    func refreshTelemetry() {
        telemetryService.stopMonitoring()
        telemetryService.startMonitoring()
    }

    @MainActor
    func startAiAlertStream() {
        guard aiStreamTask == nil else { return }
        UNUserNotificationCenter.current().requestAuthorization(options: [.alert, .sound, .badge]) { _, _ in }

        let targetCrewId = crewId
        let deviceId = Constants.deviceId

        aiStreamTask = Task { [weak self] in
            for await event in NetworkManager.shared.streamAiEvents(deviceId: deviceId, crewId: targetCrewId) {
                guard let self, !Task.isCancelled else { break }
                self.handleAiStreamEvent(event, deviceId: deviceId)
            }
        }
    }

    @MainActor
    func startRelayStream() {
        guard relayStreamTask == nil else { return }

        let targetCrewId = crewId
        relayStreamTask = Task { [weak self] in
            for await event in NetworkManager.shared.streamRelayEvents() {
                guard let self, !Task.isCancelled else { break }
                switch event {
                case .hello(let packets):
                    if let mine = packets.first(where: { $0.astronautId == targetCrewId }) {
                        self.applyPacket(mine, fromBackend: true)
                    }
                case .packet(let packet):
                    if packet.astronautId == targetCrewId {
                        self.applyPacket(packet, fromBackend: true)
                    }
                }
            }
        }
    }

    @MainActor
    func acknowledgeAlert(_ alert: AiAlert) async {
        activeAlerts.removeAll { $0.id == alert.id }
        try? await NetworkManager.shared.acknowledgeAlert(alertId: alert.id, deviceId: Constants.deviceId)
    }

    @MainActor
    func syncFromBackend() async {
        guard !isSyncingBackend else { return }
        isSyncingBackend = true
        defer { isSyncingBackend = false }

        let targetCrewId = crewId
        do {
            async let packetTask = NetworkManager.shared.fetchPacket(crewId: targetCrewId)
            async let samplesTask = try? NetworkManager.shared.fetchSamples(crewId: targetCrewId)
            let packet = try await packetTask
            if let fetchedSamples = await samplesTask, !fetchedSamples.isEmpty {
                sampleHistory = Array(fetchedSamples.filter { $0.crewId == targetCrewId }.suffix(500))
            }
            applyPacket(packet, fromBackend: true)
        } catch {
            // Silent fallback to bundled/mock data per ADR-0002 (no offline badge or error banner).
        }
    }

    @MainActor
    func sendCurrentVitalsToBackend() async {
        let now = Date()
        var samples: [HealthSample] = [
            HealthSample(crewId: crewId, type: .heartRate, value: heartRateValue.rounded(), timestamp: now, source: .iphone),
            HealthSample(crewId: crewId, type: .spo2, value: spo2Value.rounded(), timestamp: now, source: .iphone),
            HealthSample(crewId: crewId, type: .bodyTemp, value: (bodyTempValue * 10).rounded() / 10, timestamp: now, source: .iphone)
        ]

        if let sys = indicatorValues[.bloodPressureSys] {
            samples.append(HealthSample(crewId: crewId, type: .bloodPressureSys, value: sys.rounded(), timestamp: now, source: .iphone))
        }
        if let dia = indicatorValues[.bloodPressureDia] {
            samples.append(HealthSample(crewId: crewId, type: .bloodPressureDia, value: dia.rounded(), timestamp: now, source: .iphone))
        }
        if let mood = indicatorValues[.mood] {
            samples.append(HealthSample(crewId: crewId, type: .mood, value: mood.rounded(), timestamp: now, source: .iphone))
        }

        await sendSamplesToBackend(samples)
    }

    @MainActor
    func updateJournalEntries(_ entries: [JournalEntry], syncToBackend: Bool = false) {
        let inputs = entries.map {
            JournalNoteInput(title: $0.title, body: $0.body, createdAt: $0.createdAt)
        }
        latestJournalInputs = inputs

        let localResult = JournalSentimentAnalyzer.evaluateLocally(inputs)
        cachedJournalSentiment = localResult
        let previousScore = moodAssessment?.score
        recomputeAlgorithmicMood(syncMoodSampleToBackend: false)

        if syncToBackend && previousScore != moodAssessment?.score {
            syncComputedMoodSampleToBackend()
        }

        guard !inputs.isEmpty else {
            journalAnalysisTask?.cancel()
            lastAnalyzedJournalDigest = ""
            return
        }

        let digest = localResult.digest
        guard digest != lastAnalyzedJournalDigest else { return }

        journalAnalysisTask?.cancel()
        guard let promptMessage = JournalSentimentAnalyzer.buildPromptMessage(for: inputs) else {
            lastAnalyzedJournalDigest = ""
            return
        }
        let targetCrewId = crewId

        journalAnalysisTask = Task { [weak self] in
            do {
                let response = try await NetworkManager.shared.analyzeJournalSentiment(
                    crewId: targetCrewId,
                    excerpt: promptMessage
                )
                guard let self, !Task.isCancelled else { return }
                guard self.cachedJournalSentiment.digest == digest else { return }

                if response.source == "gemini",
                   let aiResult = JournalSentimentAnalyzer.parseGeminiReply(response.reply, digest: digest) {
                    self.lastAnalyzedJournalDigest = digest
                    self.cachedJournalSentiment = aiResult
                    let scoreBeforeAi = self.moodAssessment?.score
                    self.recomputeAlgorithmicMood(syncMoodSampleToBackend: false)
                    if syncToBackend && scoreBeforeAi != self.moodAssessment?.score {
                        self.syncComputedMoodSampleToBackend()
                    }
                }
            } catch {
                // Offline or backend unavailable: keep local deterministic NLP sentiment result.
            }
        }
    }

    @MainActor
    func sendSamplesToBackend(_ samples: [HealthSample]) async {
        guard !samples.isEmpty else { return }
        isSyncingBackend = true
        defer { isSyncingBackend = false }

        do {
            let updatedPackets = try await NetworkManager.shared.sendSamples(samples)
            if let matching = updatedPackets.first(where: { $0.astronautId == crewId }) ?? updatedPackets.first {
                applyPacket(matching, fromBackend: true)
            }
            lastSampleSyncMessage = "Ölçümler sunucuya iletildi."
        } catch {
            lastSampleSyncMessage = "Yerel veri korundu (sunucuya ulaşılamadı)."
        }
    }

    // MARK: - Private
    private func seedMockPacketAndInitialTelemetry() {
        // Mirrors crew-1 nominal mock values from shared/mock/astronaut-packets.json
        radiationBudgetMsv = 100.0
        indicatorValues = [
            .heartRate: 72,
            .bloodPressureSys: 118,
            .bloodPressureDia: 70,
            .spo2: 97,
            .bodyTemp: 36.5,
            .bloodGlucose: 96,
            .sleepHours: 7.5,
            .mood: 4,
            .radiationDose: 21.0
        ]

        if let bundled = loadBundledNominalPacket() {
            applyPacket(bundled, fromBackend: false)
        }

        let initial = WatchTelemetryData(
            userId: crewId,
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

    private func applyPacket(_ packet: AstronautHealthPacket, fromBackend: Bool = false) {
        if fromBackend {
            hasSyncedFromBackend = true
            latestBackendGuidance = packet.aiGuidance
        }
        astronautPacket = packet
        aiGuidance = packet.aiGuidance
        radiationBudgetMsv = packet.mission.radiationBudgetMsv
        for type in HealthIndicatorType.allCases where type != .mood {
            if let snap = packet.measurements[type.rawValue] {
                indicatorValues[type] = snap.value
            }
        }
        if let watch = packet.watchTelemetry {
            latestTelemetry = watch
        }
        recomputeAlgorithmicMood(syncMoodSampleToBackend: false)
        if fromBackend {
            houstonSyncRevision &+= 1
        }
    }

    private func loadBundledNominalPacket() -> AstronautHealthPacket? {
        guard let url = Bundle.main.url(forResource: "astronaut-packets", withExtension: "json"),
              let data = try? Data(contentsOf: url),
              let bundle = try? HealthJSONCodec.decoder.decode(AstronautPacketBundle.self, from: data) else {
            return nil
        }
        return bundle.astronauts.first(where: { $0.astronautId == crewId }) ?? bundle.astronauts.first
    }

    private func setupBindings() {
        telemetryService.telemetryPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self else { return }
                // Preserve real backend web telemetry or recent WatchConnectivity updates without local mock overwriting them.
                if self.hasSyncedFromBackend {
                    return
                }
                if let lastWatch = self.lastWatchSyncAt, Date().timeIntervalSince(lastWatch) < 30 {
                    return
                }
                self.applyTelemetry(data)
            }
            .store(in: &cancellables)
    }

    private func setupWatchConnectivity() {
        ConnectivityManager.shared.onSamplesReceived = { [weak self] samples in
            Task { @MainActor [weak self] in
                await self?.handleWatchSamples(samples)
            }
        }
        ConnectivityManager.shared.onSymptomsReceived = { [weak self] symptoms in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let previousScore = self.moodAssessment?.score
                self.latestWatchSymptoms = symptoms
                self.recomputeAlgorithmicMood(syncMoodSampleToBackend: false)
                if previousScore != self.moodAssessment?.score {
                    self.syncComputedMoodSampleToBackend()
                }
            }
        }
        ConnectivityManager.shared.activate()
    }

    @MainActor
    private func handleWatchSamples(_ samples: [HealthSample]) async {
        guard !samples.isEmpty else { return }
        lastWatchSyncAt = Date()

        let physicalSamples = samples.filter { $0.type != .mood }
        for sample in physicalSamples {
            indicatorValues[sample.type] = sample.value
        }
        latestWatchSymptoms = ConnectivityManager.shared.latestSymptoms
        recomputeAlgorithmicMood(syncMoodSampleToBackend: false)

        let now = Date()
        var normalized = physicalSamples.map { sample in
            HealthSample(
                id: sample.id,
                crewId: crewId,
                type: sample.type,
                value: sample.value,
                unit: sample.unit,
                timestamp: sample.timestamp,
                source: sample.source
            )
        }
        if let computedMood = indicatorValues[.mood] {
            normalized.append(
                HealthSample(
                    crewId: crewId,
                    type: .mood,
                    value: computedMood.rounded(),
                    timestamp: now,
                    source: .iphone
                )
            )
        }
        appendToSampleHistory(normalized)
        await sendSamplesToBackend(normalized)
    }

    @MainActor
    private func handleAiStreamEvent(_ event: AiStreamEvent, deviceId: String) {
        switch event {
        case .hello(let alerts):
            activeAlerts = alerts.filter { $0.state == "active" }
        case .alert(let alert):
            upsertAlert(alert)
            notifyLocalAlertIfNeeded(alert)
            Task {
                try? await NetworkManager.shared.markAlertDelivered(alertId: alert.id, deviceId: deviceId)
            }
        case .alertUpdate(let alert):
            upsertAlert(alert)
        }
        houstonSyncRevision &+= 1
    }

    @MainActor
    private func upsertAlert(_ alert: AiAlert) {
        if alert.state == "resolved" {
            activeAlerts.removeAll { $0.id == alert.id }
            return
        }
        if let index = activeAlerts.firstIndex(where: { $0.id == alert.id }) {
            activeAlerts[index] = alert
        } else {
            activeAlerts.insert(alert, at: 0)
        }
    }

    private func notifyLocalAlertIfNeeded(_ alert: AiAlert) {
        guard notifiedAlertIds.insert(alert.id).inserted else { return }
        let content = UNMutableNotificationContent()
        content.title = alert.title
        content.body = alert.spokenText
        content.sound = .default

        let request = UNNotificationRequest(
            identifier: "antigravity.ai.alert.\(alert.id)",
            content: content,
            trigger: nil
        )
        UNUserNotificationCenter.current().add(request)
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

        recomputeAlgorithmicMood(syncMoodSampleToBackend: false)
    }

    private func recomputeAlgorithmicMood(syncMoodSampleToBackend: Bool) {
        let assessment = BehavioralMoodEngine.assess(
            sleepHours: indicatorValues[.sleepHours],
            bloodPressureSys: indicatorValues[.bloodPressureSys],
            bloodPressureDia: indicatorValues[.bloodPressureDia],
            radiationDose: indicatorValues[.radiationDose],
            radiationBudgetMsv: radiationBudgetMsv,
            heartRate: indicatorValues[.heartRate],
            spo2: indicatorValues[.spo2],
            exerciseMinutes: latestTelemetry?.activitySummary.exerciseMinutes,
            symptoms: latestWatchSymptoms,
            journal: cachedJournalSentiment
        )
        moodAssessment = assessment
        indicatorValues[.mood] = Double(assessment.score)
        evaluateStatuses()

        if syncMoodSampleToBackend {
            syncComputedMoodSampleToBackend()
        }
    }

    @MainActor
    private func syncComputedMoodSampleToBackend() {
        let computed = Double(moodAssessment?.score ?? Int((indicatorValues[.mood] ?? 4).rounded()))
        let moodSample = HealthSample(
            crewId: crewId,
            type: .mood,
            value: computed,
            timestamp: Date(),
            source: .iphone
        )
        Task { [weak self] in
            await self?.sendSamplesToBackend([moodSample])
        }
    }

    private func appendToSampleHistory(_ newSamples: [HealthSample]) {
        let matching = newSamples.filter { $0.crewId == crewId }
        guard !matching.isEmpty else { return }
        sampleHistory.append(contentsOf: matching)
        if sampleHistory.count > 500 {
            sampleHistory = Array(sampleHistory.suffix(500))
        }
    }

    // Alarm, çok günlük eğilim ve durum renkleri tek kaynaktan gelir: HealthThresholds (Thresholds.swift).
    private func evaluateStatuses() {
        let now = Date()
        let grouped = Dictionary(grouping: sampleHistory, by: \.type)
        var trends: [HealthIndicatorType: TrendAssessment] = [:]
        var computed: [HealthIndicatorType: HealthStatus] = [:]

        for type in HealthIndicatorType.allCases {
            var series = (grouped[type] ?? []).sorted { $0.timestamp < $1.timestamp }
            if let current = indicatorValues[type] {
                if let last = series.last, abs(last.timestamp.timeIntervalSince(now)) < 60 {
                    series[series.count - 1] = HealthSample(
                        id: last.id,
                        crewId: crewId,
                        type: type,
                        value: current,
                        timestamp: now,
                        source: last.source
                    )
                } else {
                    series.append(
                        HealthSample(
                            crewId: crewId,
                            type: type,
                            value: current,
                            timestamp: now,
                            source: .iphone
                        )
                    )
                }
            }

            let assessment = HealthThresholds.assessTrend(
                for: type,
                samples: series,
                radiationBudgetMsv: radiationBudgetMsv
            )
            trends[type] = assessment
            computed[type] = assessment.effectiveStatus
        }

        indicatorTrends = trends
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
