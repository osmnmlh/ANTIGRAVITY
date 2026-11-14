//
//  MockTelemetryService.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation
import Combine

class MockTelemetryService: TelemetryServiceProtocol {
    private let telemetrySubject = PassthroughSubject<WatchTelemetryData, Never>()
    
    var telemetryPublisher: AnyPublisher<WatchTelemetryData, Never> {
        telemetrySubject.eraseToAnyPublisher()
    }
    
    private var backgroundTimer: DispatchSourceTimer?
    
    func startMonitoring() {
        let queue = DispatchQueue.global(qos: .background)
        backgroundTimer = DispatchSource.makeTimerSource(queue: queue)
        backgroundTimer?.schedule(deadline: .now(), repeating: 2.0)
        backgroundTimer?.setEventHandler { [weak self] in
            self?.generateMockData()
        }
        backgroundTimer?.resume()
    }
    
    func stopMonitoring() {
        backgroundTimer?.cancel()
        backgroundTimer = nil
    }
    
    private func generateMockData() {
        // Keeps baseline within green bounds (team decision: all crew start green; spikes are triggered explicitly).
        let mockActivity = ActivitySummary(
            stepCount: Int.random(in: 6600...7200),
            activeCaloriesBurned: Double.random(in: 470...510),
            exerciseMinutes: Int.random(in: 42...48),
            standHours: 10,
            distanceMeters: Double.random(in: 5050...5400)
        )
        let mockVitals = VitalsData(
            currentHeartRate: Double.random(in: 58...84),
            restingHeartRate: 62.0,
            bloodOxygenPercentage: Double.random(in: 96...99),
            bodyTemperature: Double.random(in: 36.3...36.9)
        )
        let mockEnv = EnvironmentalData(
            altitudeMeters: 408_000,
            atmosphericPressure: 1013.5,
            gForce: GForceData(xAxis: 0.0, yAxis: 0.01, zAxis: 0.02)
        )
        
        let data = WatchTelemetryData(
            userId: Constants.defaultCrewId,
            syncTimestamp: Date(),
            deviceModel: "Apple Watch (Simüle)",
            activitySummary: mockActivity,
            vitals: mockVitals,
            environmentalData: mockEnv
        )
        
        telemetrySubject.send(data)
    }
}
