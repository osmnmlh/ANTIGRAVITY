//
//  VitalsViewModel.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation
import Combine

class VitalsViewModel: ObservableObject {
    
    // MARK: - @Published Değişkenler
    // Dashboard'un aksine burada tüm paketi değil, UI'ın kolayca okuyabileceği şekilde değişkenleri parçalıyoruz.
    @Published var currentHeartRate: Double = 0
    @Published var oxygenLevel: Double = 100.0
    @Published var bodyTemp: Double = 36.5
    @Published var altitude: Double = 0.0
    
    private let telemetryService: TelemetryServiceProtocol
    private var cancellables = Set<AnyCancellable>()
    
    init(telemetryService: TelemetryServiceProtocol = MockTelemetryService()) {
        self.telemetryService = telemetryService
        setupBindings()
    }
    
    private func setupBindings() {
        // Ortak servisimizi burada da dinliyoruz.
        telemetryService.telemetryPublisher
            .receive(on: DispatchQueue.main)
            .sink { [weak self] data in
                // Gelen karmaşık JSON / Model paketinin içindeki spesifik değerleri cımbızla çekip, ekranda göstereceğimiz değişkenlere atıyoruz.
                self?.currentHeartRate = data.vitals.currentHeartRate
                self?.oxygenLevel = data.vitals.bloodOxygenPercentage ?? 100.0
                self?.bodyTemp = data.vitals.bodyTemperature ?? 36.5
                self?.altitude = data.environmentalData?.altitudeMeters ?? 0.0
            }
            .store(in: &cancellables)
    }
}
