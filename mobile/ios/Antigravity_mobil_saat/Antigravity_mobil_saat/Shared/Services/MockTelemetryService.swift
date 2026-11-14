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
    
    // Timer sınıfı yerine, arka planda çalışan DispatchSourceTimer kullanıyoruz
    private var backgroundTimer: DispatchSourceTimer?
    
    func startMonitoring() {
        // 1. İşlemi tamamen arkaplan (Background) işlemcisine devret
        let queue = DispatchQueue.global(qos: .background)
        backgroundTimer = DispatchSource.makeTimerSource(queue: queue)
        
        // 2. Her 2 saniyede bir tetiklenecek şekilde kur
        backgroundTimer?.schedule(deadline: .now(), repeating: 2.0)
        
        // 3. Arka planda ağır veri üretme işlemini (veya ileride sensör okumayı) yap
        backgroundTimer?.setEventHandler { [weak self] in
            self?.generateMockData() // Bu artık UI'ı asla meşgul etmez
        }
        
        backgroundTimer?.resume()
    }
    
    func stopMonitoring() {
        backgroundTimer?.cancel()
        backgroundTimer = nil
    }
    
    private func generateMockData() {
        // (Bu kısımdaki eski sahte veri üretme kodları tamamen aynı kalacak, dokunmana gerek yok)
        let mockActivity = ActivitySummary(stepCount: Int.random(in: 3000...12000), activeCaloriesBurned: Double.random(in: 200...800), exerciseMinutes: Int.random(in: 15...90), standHours: Int.random(in: 4...12), distanceMeters: Double.random(in: 1500...8000))
        let mockVitals = VitalsData(currentHeartRate: Double.random(in: 65...115), restingHeartRate: 60.0, bloodOxygenPercentage: Double.random(in: 92...100), bodyTemperature: Double.random(in: 36.1...37.5))
        let mockEnv = EnvironmentalData(altitudeMeters: Double.random(in: 300000...400000), atmosphericPressure: Double.random(in: 0.1...1.5), gForce: GForceData(xAxis: 0.1, yAxis: 1.2, zAxis: 0.3))
        
        let data = WatchTelemetryData(userId: "ASTRONAUT-001", syncTimestamp: Date(), deviceModel: "Mock-Suit-Sensors", activitySummary: mockActivity, vitals: mockVitals, environmentalData: mockEnv)
        
        // Combine'ın 'send' işlemi arka plandan tetiklenebilir, ViewModel onu Main Thread'e çekecek.
        telemetrySubject.send(data)
    }
}
