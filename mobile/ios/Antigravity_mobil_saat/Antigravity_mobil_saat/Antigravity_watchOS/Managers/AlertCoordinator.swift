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
    @Published private(set) var isSimulatingSpike: Bool = false
    @Published private(set) var lastSyncDate: Date?
    @Published private(set) var lastCheckInMessage: String?

    let hapticManager: HapticManager
    let notificationController: NotificationController

    private let telemetryService: TelemetryServiceProtocol
    private var cancellables = Set<AnyCancellable>()
    private var lastAlertSignature: String?
    private var lastVitalsPushDate: Date?
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
        self.notificationController = notificationController ?? NotificationController()
        self.sideEffectsEnabled = sideEffectsEnabled

        bindTelemetry()
    }

    func start() {
        guard !isRunning else { return }
        isRunning = true
        if sideEffectsEnabled {
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

    func toggleMute() {
        isMuted.toggle()
        guard sideEffectsEnabled else { return }
        if isMuted {
            hapticManager.stopContinuousAlert()
        } else if overallStatus == .amber || overallStatus == .red {
            hapticManager.startContinuousAlert(urgent: overallStatus == .red)
        }
    }

    /// Forces a red-threshold telemetry reading so alerts, ALL CAPS banner,
    /// notification, and continuous wrist haptics can be verified immediately.
    func toggleSpikeSimulation() {
        isSimulatingSpike.toggle()
        if isSimulatingSpike {
            isMuted = false
            applyReadings(heartRate: 138, spo2: 88, bodyTemp: 38.6)
        } else {
            applyReadings(heartRate: 74, spo2: 98, bodyTemp: 36.6)
        }
        if sideEffectsEnabled {
            pushCurrentVitalsToPhone()
        }
    }

    /// Sends a 5-second mood (1-5) and optional symptom check-in to the paired iPhone as `HealthSample`s.
    func sendQuickCheckIn(mood: Int, symptoms: [String]) {
        let now = Date()
        var samples = currentVitalSamples(at: now)
        samples.append(
            HealthSample(
                crewId: Constants.defaultCrewId,
                type: .mood,
                value: Double(min(max(mood, 1), 5)),
                timestamp: now,
                source: .watch
            )
        )

        if sideEffectsEnabled {
            ConnectivityManager.shared.sendSamples(samples)
        }
        lastSyncDate = now
        lastVitalsPushDate = now
        if symptoms.isEmpty {
            lastCheckInMessage = "Ruh hâli (\(mood)/5) iletildi ✓"
        } else {
            lastCheckInMessage = "\(mood)/5 • \(symptoms.count) belirti iletildi ✓"
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
                guard let self, !self.isSimulatingSpike else { return }
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

    private func applyReadings(heartRate: Int, spo2: Int?, bodyTemp: Double?) {
        self.heartRate = heartRate
        self.spo2 = spo2
        self.bodyTemp = bodyTemp

        let hrStatus = HealthThresholds.status(for: .heartRate, value: Double(heartRate))
        let o2Status = HealthThresholds.status(for: .spo2, value: spo2.map(Double.init))
        let tempStatus = HealthThresholds.status(for: .bodyTemp, value: bodyTemp)

        heartRateStatus = hrStatus
        spo2Status = o2Status
        bodyTempStatus = tempStatus

        let highest = [hrStatus, o2Status, tempStatus].filter { $0 != .missing }.max() ?? .green
        overallStatus = highest

        let breaches = buildBreachMessages(hrStatus: hrStatus, o2Status: o2Status, tempStatus: tempStatus)

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
                    signature: signature
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
            coordinator.isSimulatingSpike = true
            coordinator.applyReadings(heartRate: 138, spo2: 88, bodyTemp: 38.6)
        case .green, .missing:
            coordinator.applyReadings(heartRate: 74, spo2: 98, bodyTemp: 36.6)
        }
        return coordinator
    }
}
