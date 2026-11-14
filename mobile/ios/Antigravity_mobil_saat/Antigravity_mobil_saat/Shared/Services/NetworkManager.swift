//
//  NetworkManager.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation

class NetworkManager {
    static let shared = NetworkManager() // Singleton pattern
    
    private init() {}
    
    func sendTelemetryToWeb(data: WatchTelemetryData) async {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601 // Web standartı tarih formatı
            
            let jsonData = try encoder.encode(data)
            
            // TODO: Buraya gerçek Backend URL'in gelecek
            guard let url = URL(string: Constants.apiEndpoint) else { return }
            
            var request = URLRequest(url: url)
            request.httpMethod = "POST"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
            request.httpBody = jsonData
            
            // Simüle edilmiş ağ gecikmesi ve başarılı log
            print("🚀 [NetworkManager] Veri Web'e JSON olarak fırlatılıyor...")
            // let (_, response) = try await URLSession.shared.data(for: request)
            
        } catch {
            print("❌ [NetworkManager] JSON Çevirme Hatası: \(error)")
        }
    }
}
