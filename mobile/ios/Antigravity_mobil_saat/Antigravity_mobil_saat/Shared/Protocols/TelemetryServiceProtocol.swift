//
//  Protocols.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation
import Combine

// Saat, Telefon veya Web fark etmez; veri sağlayacak her motor bu kurallara uymak zorunda.
protocol TelemetryServiceProtocol {
    // Arayüzlerin dinleyeceği sürekli veri akışı (Combine Framework ile)
    var telemetryPublisher: AnyPublisher<WatchTelemetryData, Never> { get }
    
    func startMonitoring()
    func stopMonitoring()
}
