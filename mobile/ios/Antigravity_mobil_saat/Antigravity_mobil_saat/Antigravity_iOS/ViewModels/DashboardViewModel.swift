//
//  DashboardViewModel.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation
import Combine // Sürekli akan veri akışlarını (Publisher/Subscriber) yönetmek için Apple'ın kütüphanesi

class DashboardViewModel: ObservableObject {
    
    // MARK: - @Published Değişkenler
    // @Published: Bu değişkenlerin değeri değiştiği anda, SwiftUI ekranı (View) otomatik olarak kendini baştan çizer.
    @Published var latestTelemetry: WatchTelemetryData?
    @Published var connectionStatus: String = "SİSTEM BAĞLANIYOR..."
    @Published var isCriticalAlert: Bool = false // Kırmızı alarm durumunu UI'a bildirmek için
    
    // MARK: - Servisler ve Hafıza Yönetimi
    private let telemetryService: TelemetryServiceProtocol // Veriyi çekeceğimiz motor
    private var cancellables = Set<AnyCancellable>() // Combine akışlarını (abonelikleri) hafızada tutmak ve sayfa kapanınca çöpe atmak için gereken torba.
    
    // MARK: - Init (Başlatıcı)
    // Dependency Injection: Servisi dışarıdan parametre olarak alıyoruz. Böylece yarın gerçek Apple Watch servisini bağlamak istersek bu kodu hiç değiştirmeyeceğiz.
    init(telemetryService: TelemetryServiceProtocol = MockTelemetryService()) {
        self.telemetryService = telemetryService
        setupBindings() // Veri dinleme kanalını aç
        self.telemetryService.startMonitoring() // Motoru çalıştır ve sahte veri üretmeye başla
    }
    
    // MARK: - Fonksiyonlar
    private func setupBindings() {
        // Servisteki 'telemetryPublisher' isimli yayını (kanalı) dinlemeye başlıyoruz
        telemetryService.telemetryPublisher
            // Arayüz (UI) güncellemeleri Swift'te HER ZAMAN Ana İş Parçacığında (Main Thread) yapılmalıdır. Bu kod onu sağlar.
            .receive(on: DispatchQueue.main)
            // .sink: Gelen veriyi yakaladığımız yerdir. 'data' ismiyle kullanırız.
            .sink { [weak self] data in
                // Hafıza sızıntısı olmasın diye 'weak self' kullanıyoruz
                guard let self = self else { return }
                
                // Gelen veriyi @Published değişkenimize atıyoruz, bu da ekranın güncellenmesini tetikliyor.
                self.latestTelemetry = data
                self.connectionStatus = "SİSTEMLER NORMAL"
                
                // Veri her geldiğinde kritik bir durum var mı diye kontrol ediyoruz
                self.checkCriticalAlerts(vitals: data.vitals)
            }
            .store(in: &cancellables) // Bu aboneliği hafıza torbamıza ekle
    }
    
    // Alarm rengi tek kaynaktan gelir: HealthThresholds (Thresholds.swift). Burada kendi eşiğimiz yok.
    private func checkCriticalAlerts(vitals: VitalsData) {
        let hrStatus = HealthThresholds.status(for: .heartRate, value: vitals.currentHeartRate)
        let spo2Status = HealthThresholds.status(for: .spo2, value: vitals.bloodOxygenPercentage)
        isCriticalAlert = (hrStatus == .red || spo2Status == .red)
    }
}
