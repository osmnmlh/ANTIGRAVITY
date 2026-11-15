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
    @Published var activeAlerts: [AiAlert] = [] {
        didSet { forwardActiveAlertToWatch() }
    }
    @Published private(set) var webAssignedTasks: [RemoteWebTask] = []
    @Published private(set) var hasSyncedWebTasks: Bool = false
    @Published private(set) var houstonSyncRevision: Int = 0
    /// Direct callback invoked on the main actor the moment new alerts, guidance, or web tasks arrive.
    var onMissionSyncNeeded: (() -> Void)?
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
    /// Demo scenario from the web "Senaryolar" tab that concerns this astronaut (nil when none plays).
    @Published private(set) var activeScenario: RelayScenarioState?

    // MARK: - Servisler ve Hafıza Yönetimi
    private let telemetryService: TelemetryServiceProtocol
    private var cancellables = Set<AnyCancellable>()
    private var aiStreamTask: Task<Void, Never>?
    private var relayStreamTask: Task<Void, Never>?
    private var taskPollTask: Task<Void, Never>?
    private var journalAnalysisTask: Task<Void, Never>?
    private var notifiedAlertIds = Set<String>()
    private var acknowledgedAlertKeys: Set<String> = Set(
        UserDefaults.standard.stringArray(forKey: "antigravity_acknowledged_alert_keys") ?? []
    )
    private var sampleHistory: [HealthSample] = []
    private var lastBackendPacketAt: Date?
    private var lastWatchForwardAt: Date?
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
        taskPollTask?.cancel()
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
                case .hello(let packets, let tasks, let scenario):
                    if let scenario {
                        self.applyScenario(scenario, crewId: targetCrewId)
                    }
                    if let tasks {
                        self.applyWebTaskSnapshot(tasks, crewId: targetCrewId)
                    }
                    if let mine = packets.first(where: { $0.astronautId == targetCrewId }) {
                        self.applyPacket(mine, fromBackend: true)
                    }
                case .taskChanged(let action, let task):
                    self.applyRemoteTaskChange(action: action, task: task, crewId: targetCrewId)
                case .packet(let packet):
                    if packet.astronautId == targetCrewId {
                        self.applyPacket(packet, fromBackend: true)
                    }
                case .tasks(let tasks):
                    self.applyWebTaskSnapshot(tasks, crewId: targetCrewId)
                case .scenario(let state):
                    self.applyScenario(state, crewId: targetCrewId)
                }
            }
        }
    }

    /// Shows "Simülasyon başladı" once when a web demo scenario starts for this astronaut. The live values themselves
    /// arrive through the normal `packet` events, and the scenario's alert reaches the Watch through `activeAlerts`.
    @MainActor
    private func applyScenario(_ state: RelayScenarioState, crewId targetCrewId: String) {
        let wasActive = activeScenario != nil
        activeScenario = state.concerns(crewId: targetCrewId) ? state : nil
        guard let current = activeScenario, !wasActive else { return }

        let content = UNMutableNotificationContent()
        content.title = current.bannerText
        content.body = "Değerler \(current.remainingSeconds ?? 15) saniye boyunca canlı değişecek (simüle edilmiş veri)."
        content.sound = .default
        UNUserNotificationCenter.current().add(
            UNNotificationRequest(identifier: "antigravity.scenario.\(current.id ?? "demo")", content: content, trigger: nil)
        )
    }

    /// Lightweight periodic task poll as a safety net alongside live SSE (`event: task`).
    @MainActor
    func startTaskPolling() {
        guard taskPollTask == nil else { return }
        taskPollTask = Task { [weak self] in
            while !Task.isCancelled {
                try? await Task.sleep(nanoseconds: 4_000_000_000)
                guard let self, !Task.isCancelled else { break }
                await self.refreshTasksOnly()
            }
        }
    }

    /// Re-establishes SSE sockets and pulls fresh tasks/packets when the app returns to the foreground.
    @MainActor
    func handleAppDidBecomeActive() async {
        aiStreamTask?.cancel()
        aiStreamTask = nil
        relayStreamTask?.cancel()
        relayStreamTask = nil
        startAiAlertStream()
        startRelayStream()
        startTaskPolling()
        await syncFromBackend()
    }

    @MainActor
    func refreshTasksOnly() async {
        let targetCrewId = crewId
        guard let fetchedTasks = try? await NetworkManager.shared.fetchTasks(crewId: targetCrewId) else {
            return
        }
        applyWebTaskSnapshot(fetchedTasks, crewId: targetCrewId)
    }

    @MainActor
    private func applyWebTaskSnapshot(_ tasks: [RemoteWebTask], crewId targetCrewId: String) {
        let mine = tasks.filter { $0.assigneeId == targetCrewId }
        guard !hasSyncedWebTasks || mine != webAssignedTasks else { return }
        webAssignedTasks = mine
        hasSyncedWebTasks = true
        notifyMissionSyncNeeded()
    }

    @MainActor
    private func applyRemoteTaskChange(action: String, task: RemoteWebTask, crewId targetCrewId: String) {
        if action == "delete" || task.assigneeId != targetCrewId {
            let before = webAssignedTasks.count
            webAssignedTasks.removeAll { $0.id == task.id }
            hasSyncedWebTasks = true
            if webAssignedTasks.count != before || action == "delete" {
                notifyMissionSyncNeeded()
            }
            return
        }

        if let index = webAssignedTasks.firstIndex(where: { $0.id == task.id }) {
            webAssignedTasks[index] = task
        } else {
            webAssignedTasks.insert(task, at: 0)
        }
        hasSyncedWebTasks = true
        notifyMissionSyncNeeded()
    }

    @MainActor
    private func notifyMissionSyncNeeded() {
        houstonSyncRevision &+= 1
        onMissionSyncNeeded?()
    }

    @MainActor
    func acknowledgeAlert(_ alert: AiAlert) async {
        let key = Self.alertKey(for: alert)
        let inserted = acknowledgedAlertKeys.insert(key).inserted
        if inserted {
            persistAcknowledgedAlertKeys()
        }
        let removedAny = activeAlerts.contains { $0.id == alert.id }
        activeAlerts.removeAll { $0.id == alert.id }
        if inserted || removedAny {
            reconcileGuidanceWithCurrentState()
            notifyMissionSyncNeeded()
            forwardLatestStateToWatch(force: true)
        }
        try? await NetworkManager.shared.acknowledgeAlert(alertId: alert.id, deviceId: Constants.deviceId)
    }

    private static func alertKey(for alert: AiAlert) -> String {
        "\(alert.id)|\(Int(alert.createdAt.timeIntervalSince1970))"
    }

    private func persistAcknowledgedAlertKeys() {
        let capped = Array(acknowledgedAlertKeys.suffix(200))
        UserDefaults.standard.set(capped, forKey: "antigravity_acknowledged_alert_keys")
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
            async let webTasksTask = try? NetworkManager.shared.fetchTasks(crewId: targetCrewId)
            let packet = try await packetTask
            if let fetchedSamples = await samplesTask, !fetchedSamples.isEmpty {
                sampleHistory = Array(fetchedSamples.filter { $0.crewId == targetCrewId }.suffix(500))
            }
            if let fetchedTasks = await webTasksTask {
                applyWebTaskSnapshot(fetchedTasks, crewId: targetCrewId)
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
            lastBackendPacketAt = Date()
            latestBackendGuidance = packet.aiGuidance
        } else if latestBackendGuidance == nil {
            latestBackendGuidance = packet.aiGuidance
        }
        astronautPacket = packet
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
            notifyMissionSyncNeeded()
            forwardLatestStateToWatch(force: overallStatus != .green)
        }
    }

    private func forwardLatestStateToWatch(force: Bool = false) {
        let now = Date()
        if !force, let last = lastWatchForwardAt, now.timeIntervalSince(last) < 1.5 {
            return
        }
        lastWatchForwardAt = now
        ConnectivityManager.shared.sendRemoteTelemetryToWatch(
            heartRate: heartRateValue,
            spo2: indicatorValues[.spo2] ?? latestTelemetry?.vitals.bloodOxygenPercentage,
            bodyTemp: indicatorValues[.bodyTemp] ?? latestTelemetry?.vitals.bodyTemperature,
            overallStatus: overallStatus,
            alertTitle: activeAlerts.first?.title
        )
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
                // Preserve real WatchConnectivity updates, active Web/SSE stream ticks,
                // or non-green backend incidents without letting local mock overwrite them.
                if let lastWatch = self.lastWatchSyncAt, Date().timeIntervalSince(lastWatch) < 30 {
                    return
                }
                if let lastBackend = self.lastBackendPacketAt, Date().timeIntervalSince(lastBackend) < 10 {
                    return
                }
                if self.hasSyncedFromBackend, self.overallStatus == .amber || self.overallStatus == .red {
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
            activeAlerts = alerts.filter {
                $0.state == "active" && !acknowledgedAlertKeys.contains(Self.alertKey(for: $0))
            }
        case .alert(let alert):
            upsertAlert(alert)
            if !acknowledgedAlertKeys.contains(Self.alertKey(for: alert)) {
                notifyLocalAlertIfNeeded(alert)
            }
            Task {
                try? await NetworkManager.shared.markAlertDelivered(alertId: alert.id, deviceId: deviceId)
            }
        case .alertUpdate(let alert):
            upsertAlert(alert)
        }
        reconcileGuidanceWithCurrentState()
        notifyMissionSyncNeeded()
        forwardLatestStateToWatch(force: true)
    }

    /// The most serious active alert (a backend scenario or a health alert) is mirrored to the Apple Watch;
    /// an empty list tells the watch that everything is normal again.
    private func forwardActiveAlertToWatch() {
        let top = activeAlerts.first(where: { $0.severity == .red }) ?? activeAlerts.first
        let payload = WatchAlertPayload(
            active: top != nil,
            title: top?.title ?? "",
            detail: top?.spokenText ?? "",
            severity: top.map { $0.severity == .red ? "red" : "amber" } ?? "green"
        )
        ConnectivityManager.shared.sendAlertState(payload)
    }

    @MainActor
    private func upsertAlert(_ alert: AiAlert) {
        let key = Self.alertKey(for: alert)
        if alert.state == "resolved" {
            activeAlerts.removeAll { $0.id == alert.id }
            if acknowledgedAlertKeys.remove(key) != nil {
                persistAcknowledgedAlertKeys()
            }
            return
        }
        guard !acknowledgedAlertKeys.contains(key) else {
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

        reconcileGuidanceWithCurrentState()
    }

    /// Keeps the Dashboard's AI card and per-indicator sheets consistent whenever local status
    /// (for example computed mood, Watch telemetry, or active alerts) diverges from cached backend guidance.
    private func reconcileGuidanceWithCurrentState() {
        let baseGuidance = latestBackendGuidance ?? astronautPacket?.aiGuidance
        let alertWorst = activeAlerts.map(\.severity).max() ?? .green
        let effectiveOverall = max(overallStatus, alertWorst)

        let packetStatuses: [HealthIndicatorType: HealthStatus] = Dictionary(
            uniqueKeysWithValues: HealthIndicatorType.allCases.map { type in
                let packetValue = astronautPacket?.measurements[type.rawValue]?.value
                let status = HealthThresholds.status(
                    for: type,
                    value: packetValue,
                    radiationBudgetMsv: radiationBudgetMsv
                )
                return (type, status)
            }
        )

        let hasIndicatorDivergence = HealthIndicatorType.allCases.contains { type in
            let current = indicatorStatuses[type] ?? .missing
            let packetStatus = packetStatuses[type] ?? .missing
            guard current == .amber || current == .red || packetStatus == .amber || packetStatus == .red else {
                return false
            }
            return current != packetStatus
        }

        let hasStaleClearedAlertInBackendGuidance = activeAlerts.isEmpty
            && !acknowledgedAlertKeys.isEmpty
            && (baseGuidance?.summary.localizedCaseInsensitiveContains("kabinde aktif") ?? false)

        if let baseGuidance,
           baseGuidance.overallStatus == effectiveOverall,
           !hasIndicatorDivergence,
           !hasStaleClearedAlertInBackendGuidance {
            aiGuidance = baseGuidance
            return
        }

        let flaggedTypes: [HealthIndicatorType] = HealthIndicatorType.allCases
            .filter {
                let status = indicatorStatuses[$0] ?? .missing
                return status == .amber || status == .red
            }
            .sorted { lhs, rhs in
                let lStatus = indicatorStatuses[lhs] ?? .missing
                let rStatus = indicatorStatuses[rhs] ?? .missing
                if lStatus != rStatus {
                    return lStatus > rStatus
                }
                return lhs.rawValue < rhs.rawValue
            }

        var indicatorsMap: [String: AiIndicatorGuidance] = [:]
        for type in HealthIndicatorType.allCases {
            let currentStatus = indicatorStatuses[type] ?? .missing
            let packetStatus = packetStatuses[type] ?? .missing
            if let baseGuidance,
               let backendItem = baseGuidance.indicators?[type.rawValue],
               baseGuidance.overallStatus == effectiveOverall,
               packetStatus == currentStatus {
                indicatorsMap[type.rawValue] = backendItem
                continue
            }

            let rule = HealthThresholds.guidance(for: type, status: currentStatus)
            if type == .mood,
               currentStatus == .amber || currentStatus == .red,
               let moodAssessment {
                var enrichedWhy = rule.whyInSpace
                if !moodAssessment.journalAnalysis.summary.isEmpty {
                    enrichedWhy = "\(rule.whyInSpace) \(moodAssessment.summaryLine)"
                }
                var enrichedDoNow = rule.doNow
                if !moodAssessment.symptoms.isEmpty {
                    let symptomLine = "Bildirilen belirtileri takip edin: \(moodAssessment.symptoms.joined(separator: ", "))."
                    if !enrichedDoNow.contains(symptomLine) {
                        enrichedDoNow.append(symptomLine)
                    }
                }
                indicatorsMap[type.rawValue] = AiIndicatorGuidance(
                    whatItIs: rule.whatItIs,
                    whyInSpace: enrichedWhy,
                    doNow: Array(enrichedDoNow.prefix(3)),
                    escalateWhen: rule.escalateWhen
                )
            } else {
                indicatorsMap[type.rawValue] = AiIndicatorGuidance(
                    whatItIs: rule.whatItIs,
                    whyInSpace: rule.whyInSpace,
                    doNow: Array(rule.doNow.prefix(3)),
                    escalateWhen: rule.escalateWhen
                )
            }
        }

        if flaggedTypes.isEmpty && activeAlerts.isEmpty {
            aiGuidance = AiGuidance(
                generatedAt: Date(),
                source: .fallback,
                model: nil,
                overallStatus: effectiveOverall,
                summary: "Tüm değerlerin normal aralıkta. Günlük rutinine devam et.",
                actions: [
                    "Planlanan egzersiz önlemlerine devam et.",
                    "Uyku ve sıvı alımı düzenini koru."
                ],
                escalate: "Şu an uçuş cerrahına başvurman gerekmiyor. Yeni bir belirti fark edersen haber ver.",
                disclaimer: HealthThresholds.demoDisclaimer,
                indicators: indicatorsMap
            )
            return
        }

        let flaggedDescriptions = flaggedTypes.map { type in
            let statusWord = (indicatorStatuses[type] == .red) ? "KRİTİK" : "dikkat"
            return "\(type.displayName) \(formattedGuidanceValue(for: type)) (\(statusWord))"
        }

        var summaryParts: [String] = []
        if !flaggedDescriptions.isEmpty {
            summaryParts.append("\(flaggedDescriptions.count) değer dikkat gerektiriyor: \(flaggedDescriptions.joined(separator: ", ")).")
        }
        if flaggedTypes.contains(.mood), let moodAssessment {
            summaryParts.append(moodAssessment.summaryLine)
        }
        if !activeAlerts.isEmpty {
            let titles = activeAlerts.prefix(2).map(\.title).joined(separator: "; ")
            summaryParts.append("Aktif uyarı: \(titles).")
        }

        var combinedActions: [String] = []
        for alert in activeAlerts {
            for step in alert.advice?.doNow ?? [] {
                if !combinedActions.contains(step) {
                    combinedActions.append(step)
                }
                if combinedActions.count >= 2 { break }
            }
            if combinedActions.count >= 2 { break }
        }
        for type in flaggedTypes {
            for step in indicatorsMap[type.rawValue]?.doNow ?? [] {
                if !combinedActions.contains(step) {
                    combinedActions.append(step)
                }
                if combinedActions.count >= 3 { break }
            }
            if combinedActions.count >= 3 { break }
        }
        if combinedActions.isEmpty {
            combinedActions = ["Dinlenmeye geçin ve ölçümleri 15 dakika sonra tekrarlayın."]
        }

        let escalateText: String
        if let worstType = flaggedTypes.first, let item = indicatorsMap[worstType.rawValue] {
            escalateText = item.escalateWhen
        } else if let alertEscalate = activeAlerts.first?.advice?.escalate, !alertEscalate.isEmpty {
            escalateText = alertEscalate
        } else {
            escalateText = "Durum düzelmezse mürettebat sağlık sorumlusu ve uçuş cerrahıyla iletişime geçin."
        }

        aiGuidance = AiGuidance(
            generatedAt: Date(),
            source: .fallback,
            model: nil,
            overallStatus: effectiveOverall,
            summary: summaryParts.joined(separator: " "),
            actions: Array(combinedActions.prefix(3)),
            escalate: escalateText,
            disclaimer: HealthThresholds.demoDisclaimer,
            indicators: indicatorsMap
        )
    }

    private func formattedGuidanceValue(for type: HealthIndicatorType) -> String {
        guard let value = indicatorValues[type] else { return "--" }
        switch type {
        case .heartRate:
            return "\(Int(value.rounded())) bpm"
        case .bloodPressureSys, .bloodPressureDia:
            return "\(Int(value.rounded())) mmHg"
        case .spo2:
            return "%\(Int(value.rounded()))"
        case .bodyTemp:
            return String(format: "%.1f °C", value)
        case .bloodGlucose:
            return "\(Int(value.rounded())) mg/dL"
        case .sleepHours:
            return String(format: "%.1f sa", value)
        case .mood:
            return "\(Int(value.rounded()))/5"
        case .radiationDose:
            return String(format: "%.1f mSv", value)
        }
    }
}
