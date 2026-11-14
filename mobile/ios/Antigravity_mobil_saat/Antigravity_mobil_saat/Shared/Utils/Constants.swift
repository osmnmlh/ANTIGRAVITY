//
//  Constants.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation

struct Constants {
    //MARK: WEBSITENIN APISI OLACAK. NetworkManager.swift içerisinde kullanılacak
    
    ///Mantığı Ne: Telefon MockTelemetryService üzerinden sahte nabız ve adım verisini ürettiğinde, bu veriyi NetworkManager'a verir. NetworkManager da bu API adresine (Web sunucuna) veriyi POST isteği olarak fırlatır. Böylece sen bilgisayarından web sitene (React/Vue vb.) girdiğinde telefondaki verileri canlı olarak görebilirsin.
    
    ///Not: Eğer şu an hazırda bir web backend'in yoksa sorun değil. Kod çökmez, sadece Xcode konsoluna "Veri Web'e JSON olarak fırlatılıyor..." yazar ve işine devam eder.
    static let apiEndpoint = "https://api.uzayuygulaman.com/v1/telemetry"
    
    // Sağlık ve Uyarı Eşikleri
    static let criticalHeartRate: Double = 120.0
    static let criticalLowOxygen: Double = 90.0
    
    // UI Metinleri
    static let welcomeMessage = "Sistemler Normal, Kaptan."
}
