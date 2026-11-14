//
//  MockTelemetryService.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation
import Combine

class MockTelemetryService: TelemetryServiceProtocol {
    // İçeride veriyi güncellediğimiz, dışarıya sadece okumalık sunduğumuz akış
    private let telemetrySubject = PassthroughSubject<WatchTelemetryData, Never>()
    
    var telemetryPublisher: AnyPublisher<WatchTelemetryData, Never> {
        telemetrySubject.eraseToAnyPublisher()
    }
    
    private var timer: Timer?
        
        func startMonitoring() {
            // Her 2 saniyede bir sahte veri üret ve sisteme pompala
            timer = Timer.scheduledTimer(withTimeInterval: 2.0, repeats: true) { [weak self] _ in
            self?.generateMockData()
        }
    }
    
    func stopMonitoring() {
        timer?.invalidate()
        timer = nil
    }
    
    private func generateMockData() {
        let mockActivity = ActivitySummary(
            stepCount: Int.random(in: 3000...12000),
            activeCaloriesBurned: Double.random(in: 200...800),
            exerciseMinutes: Int.random(in: 15...90),
            standHours: Int.random(in: 4...12),
            distanceMeters: Double.random(in: 1500...8000)
        )
        
        let mockVitals = VitalsData(
            currentHeartRate: Double.random(in: 65...115), // Nabız dalgalanıyor
            restingHeartRate: 60.0,
            bloodOxygenPercentage: Double.random(in: 92...100),
            bodyTemperature: Double.random(in: 36.1...37.5)
        )
        
        let mockEnv = EnvironmentalData(
            altitudeMeters: Double.random(in: 300000...400000), // Yörünge yüksekliği
            atmosphericPressure: Double.random(in: 0.1...1.5),
            gForce: GForceData(xAxis: 0.1, yAxis: 1.2, zAxis: 0.3)
        )
        
        let data = WatchTelemetryData(
            userId: "ASTRONAUT-001",
            syncTimestamp: Date(),
            deviceModel: "Mock-Suit-Sensors",
            activitySummary: mockActivity,
            vitals: mockVitals,
            environmentalData: mockEnv
        )
        
        telemetrySubject.send(data)
    }
}
