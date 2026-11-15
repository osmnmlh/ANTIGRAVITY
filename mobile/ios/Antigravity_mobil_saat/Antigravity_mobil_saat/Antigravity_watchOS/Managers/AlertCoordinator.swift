//
//  AlertCoordinator.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Combine
import Foundation

/// Subscribes to the shared `MockTelemetryService`, evaluates vitals against
/// `HealthThresholds`, triggers ALL CAPS warnings + local notifications,
/// and drives continuous wrist haptics via `HapticManager`.
@MainActor
final class AlertCoordinator: ObservableObject {
    static let shared = AlertCoordinator()

    private static let turkishLocale = Locale(identifier: "tr_TR")

    @Published private(set) var heartRate: Int = 72
    @Published private(set) var spo2: Int? = 98
    @Published private(set) var bodyTemp: Double? = 36.6

    @Published private(set) var heartRateStatus: HealthStatus = .green
    @Published private(set) var spo2Status: HealthStatus = .green
    @Published private(set) var bodyTempStatus: HealthStatus = .green
    @Published private(set) var overallStatus: HealthStatus = .green

    @Published private(set) var uppercaseWarningTitle: String?
    @Published private(set) var uppercaseWarningDetail: String?
    @Published private(set) var isMuted: Bool = false
    @Published private(set) var lastSyncDate: Date?
    @Published private(set) var lastCheckInMessage: String?

    /// Alert mirrored from the iPhone (a backend scenario played from the web).
    @Published private(set) var remoteAlertTitle: String?
    @Published private(set) var remoteAlertDetail: String?
    @Published private(set) var remoteAlertSeverity: HealthStatus = .green

    let hapticManager: HapticManager
    let notificationController: NotificationController

    private let telemetryService: TelemetryServiceProtocol
    private var cancellables = Set<AnyCancellable>()
    private var lastAlertSignature: String?
    private var lastVitalsPushDate: Date?
    private var lastRemoteSyncDate: Date?
    private var remoteOverallStatus: HealthStatus = .green
    private var remoteTelemetryAlertTitle: String?
    private var isRunning = false
    private let sideEffectsEnabled: Bool

    init(
        telemetryService: TelemetryServiceProtocol? = nil,
        hapticManager: HapticManager? = nil,
        notificationController: NotificationController? = nil,
        sideEffectsEnabled: Bool = true
    ) {
        self.telemetryService = telemetryService ?? MockTelemetryService()
        self.hapticManager = hapticManager ?? HapticManager()
        self.notificationController = notificationController ?? NotificationController.shared
        self.sideEffectsEnabled = sideEffectsEnabled

        bindTelemetry()
    }

    func start() {
        guard !isRunning else { return }
        isRunning = true
        if sideEffectsEnabled {
            ConnectivityManager.shared.onRemoteTelemetryReceived = { [weak self] payload in
                guard let self else { return }
                self.lastRemoteSyncDate = payload.timestamp
                self.remoteOverallStatus = payload.overallStatus
                self.remoteTelemetryAlertTitle = payload.alertTitle
                self.lastSyncDate = Date()
                self.applyReadings(
                    heartRate: payload.heartRate,
                    spo2: payload.spo2,
                    bodyTemp: payload.bodyTemp,
                    remoteStatus: payload.overallStatus,
                    remoteAlertTitle: payload.alertTitle
                )
            }
            ConnectivityManager.shared.onAlertReceived = { [weak self] alert in
                Task { @MainActor [weak self] in
                    self?.applyRemoteAlert(alert)
                }
            }
            ConnectivityManager.shared.onTaskReceived = { [weak self] task in
                Task { @MainActor [weak self] in
                    self?.applyRemoteTask(task)
                }
            }
            ConnectivityManager.shared.activate()
            notificationController.requestAuthorization()
        }
        telemetryService.startMonitoring()
        if sideEffectsEnabled {
            pushCurrentVitalsToPhone()
        }
    }

    func stop() {
        guard isRunning else { return }
        isRunning = false
        telemetryService.stopMonitoring()
        hapticManager.stopContinuousAlert()
    }

    /// Shows (and vibrates for) the alert the paired iPhone is playing; clears it when the iPhone says it is over.
    func applyRemoteAlert(_ alert: WatchAlertPayload) {
        if alert.active {
            let newSeverity: HealthStatus = (alert.severity == "red") ? .red : .amber
            let upperTitle = alert.title.uppercased(with: Self.turkishLocale)
            let isNewAlert = (remoteAlertTitle != upperTitle || remoteAlertSeverity != newSeverity)

            remoteAlertTitle = upperTitle
            remoteAlertDetail = alert.detail
            remoteAlertSeverity = newSeverity

            if isNewAlert {
                isMuted = false
            }

            if sideEffectsEnabled {
                notificationController.sendThresholdWarning(
                    title: upperTitle,
                    body: alert.detail,
                    signature: "remote|\(alert.severity)|\(upperTitle.prefix(24))",
                    isCritical: newSeverity == .red
                )
                if !isMuted {
                    hapticManager.startContinuousAlert(urgent: newSeverity == .red)
                }
            }
        } else {
            remoteAlertTitle = nil
            remoteAlertDetail = nil
            remoteAlertSeverity = .green
            // The watch's own vitals alert keeps vibrating if it is still active.
            if sideEffectsEnabled && overallStatus != .amber && overallStatus != .red {
                hapticManager.stopContinuousAlert()
                notificationController.clearAlertState()
            }
        }
    }

    /// Notifies and vibrates Apple Watch when iPhone forwards a new Houston web task.
    func applyRemoteTask(_ task: WatchTaskNotificationPayload) {
        lastSyncDate = Date()
        guard sideEffectsEnabled else { return }
        notificationController.sendTaskNotification(
            id: task.id,
            title: task.title,
            details: task.details,
            urgent: task.urgent
        )
        hapticManager.playTaskAlert(urgent: task.urgent)
    }

    func toggleMute() {
        isMuted.toggle()
        guard sideEffectsEnabled else { return }
        let hasActiveAlert = (overallStatus == .amber || overallStatus == .red || remoteAlertTitle != nil)
        let isUrgent = (overallStatus == .red || remoteAlertSeverity == .red)
        if isMuted {
            hapticManager.stopContinuousAlert()
        } else if hasActiveAlert {
            hapticManager.startContinuousAlert(urgent: isUrgent)
        }
    }

    /// Sends current Watch vitals and optional symptom check-in to the paired iPhone
    /// so the algorithmic mood engine factors symptoms into mood calculation.
    func sendSymptomCheckIn(symptoms: [String]) {
        let now = Date()
        let samples = currentVitalSamples(at: now)

        if sideEffectsEnabled {
            ConnectivityManager.shared.sendQuickCheckIn(samples: samples, symptoms: symptoms)
        }
        lastSyncDate = now
        lastVitalsPushDate = now
        if symptoms.isEmpty {
            lastCheckInMessage = "Vitaller iletildi (belirti yok) ✓"
        } else {
            lastCheckInMessage = "\(symptoms.count) belirti & vitaller iletildi ✓"
        }
    }

    private func pushCurrentVitalsToPhone() {
        let now = Date()
        lastVitalsPushDate = now
        lastSyncDate = now
        ConnectivityManager.shared.sendSamples(currentVitalSamples(at: now))
    }

    private func currentVitalSamples(at date: Date) -> [HealthSample] {
        var samples: [HealthSample] = [
            HealthSample(
                crewId: Constants.defaultCrewId,
                type: .heartRate,
                value: Double(heartRate),
                timestamp: date,
                source: .watch
            )
        ]
        if let spo2 {
            samples.append(
                HealthSample(
                    crewId: Constants.defaultCrewId,
                    type: .spo2,
                    value: Double(spo2),
                    timestamp: date,
                    source: .watch
                )
            )
        }
        if let bodyTemp {
            samples.append(
                HealthSample(
                    crewId: Constants.defaultCrewId,
                    type: .bodyTemp,
                    value: bodyTemp,
                    timestamp: date,
                    source: .watch
                )
            )
        }
        return samples
    }

    private func bindTelemetry() {
        telemetryService.telemetryPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                guard let self else { return }
                // Let live Web/iPhone stream drive Watch values while active,
                // unless offline/idle so standalone Watch simulation stays responsive.
                if let lastRemote = self.lastRemoteSyncDate, Date().timeIntervalSince(lastRemote) < 10 {
                    return
                }
                if self.remoteOverallStatus == .amber || self.remoteOverallStatus == .red {
                    return
                }
                self.applyReadings(
                    heartRate: Int(data.vitals.currentHeartRate),
                    spo2: data.vitals.bloodOxygenPercentage.map { Int($0) },
                    bodyTemp: data.vitals.bodyTemperature
                )
                if self.sideEffectsEnabled {
                    let now = Date()
                    if self.lastVitalsPushDate == nil || now.timeIntervalSince(self.lastVitalsPushDate!) >= 10 {
                        self.pushCurrentVitalsToPhone()
                    }
                }
            }
            .store(in: &cancellables)
    }

    private func applyReadings(
        heartRate: Int,
        spo2: Int?,
        bodyTemp: Double?,
        remoteStatus: HealthStatus = .green,
        remoteAlertTitle: String? = nil
    ) {
        self.heartRate = heartRate
        self.spo2 = spo2
        self.bodyTemp = bodyTemp

        let hrStatus = HealthThresholds.status(for: .heartRate, value: Double(heartRate))
        let o2Status = HealthThresholds.status(for: .spo2, value: spo2.map(Double.init))
        let tempStatus = HealthThresholds.status(for: .bodyTemp, value: bodyTemp)

        heartRateStatus = hrStatus
        spo2Status = o2Status
        bodyTempStatus = tempStatus

        let localHighest = [hrStatus, o2Status, tempStatus].filter { $0 != .missing }.max() ?? .green
        let highest = max(localHighest, remoteStatus)
        overallStatus = highest

        var breaches = buildBreachMessages(hrStatus: hrStatus, o2Status: o2Status, tempStatus: tempStatus)
        if breaches.isEmpty, let remoteTelemetryAlertTitle, !remoteTelemetryAlertTitle.isEmpty, highest == .amber || highest == .red {
            breaches.append(remoteTelemetryAlertTitle)
        }

        if highest == .amber || highest == .red, !breaches.isEmpty {
            let title = (highest == .red
                ? "ACİL EŞİK AŞILDI! UÇUŞ CERRAHINA ULAŞ"
                : "DİKKAT! EŞİK DEĞERİ AŞILDI"
            ).uppercased(with: Self.turkishLocale)
            let detail = breaches.joined(separator: " • ").uppercased(with: Self.turkishLocale)
            let signature = "\(highest)|\(breaches.map { $0.prefix(10) }.joined(separator: ","))"

            if signature != lastAlertSignature {
                isMuted = false
                lastAlertSignature = signature
            }

            uppercaseWarningTitle = title
            uppercaseWarningDetail = detail

            if sideEffectsEnabled {
                notificationController.sendThresholdWarning(
                    title: title,
                    body: detail,
                    signature: signature,
                    isCritical: highest == .red
                )

                if !isMuted {
                    hapticManager.startContinuousAlert(urgent: highest == .red)
                }
            }
        } else {
            lastAlertSignature = nil
            isMuted = false
            uppercaseWarningTitle = nil
            uppercaseWarningDetail = nil
            if sideEffectsEnabled {
                hapticManager.stopContinuousAlert()
                notificationController.clearAlertState()
            }
        }
    }

    private func buildBreachMessages(
        hrStatus: HealthStatus,
        o2Status: HealthStatus,
        tempStatus: HealthStatus
    ) -> [String] {
        var messages: [String] = []
        if hrStatus == .amber || hrStatus == .red {
            messages.append("NABIZ \(heartRate) BPM")
        }
        if (o2Status == .amber || o2Status == .red), let spo2 {
            messages.append("SPO2 %\(spo2)")
        }
        if (tempStatus == .amber || tempStatus == .red), let bodyTemp {
            messages.append(String(format: "ATEŞ %.1f °C", bodyTemp))
        }
        return messages
    }

    /// Lightweight side-effect-free instance for SwiftUI `#Preview` rendering.
    static func preview(status: HealthStatus) -> AlertCoordinator {
        let coordinator = AlertCoordinator(sideEffectsEnabled: false)
        switch status {
        case .amber:
            coordinator.applyReadings(heartRate: 112, spo2: 93, bodyTemp: 37.2)
        case .red:
            coordinator.applyReadings(heartRate: 138, spo2: 88, bodyTemp: 38.6)
        case .green, .missing:
            coordinator.applyReadings(heartRate: 74, spo2: 98, bodyTemp: 36.6)
        }
        return coordinator
    }
}
