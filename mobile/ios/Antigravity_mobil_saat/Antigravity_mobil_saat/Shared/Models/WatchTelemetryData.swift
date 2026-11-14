//
//  WatchTelemetryData.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation

struct WatchTelemetryData: Codable {
    let userId: String
    let syncTimestamp: Date
    let deviceModel: String
    let activitySummary: ActivitySummary
    let vitals: VitalsData
    let environmentalData: EnvironmentalData?
}

// Çevresel veriler (Yükseklik, basınç vb.)
struct EnvironmentalData: Codable {
    let altitudeMeters: Double
    let atmosphericPressure: Double
    let gForce: GForceData?
}

//MARK: Buna gerek olmayabilir
struct GForceData: Codable {
    let xAxis: Double
    let yAxis: Double
    let zAxis: Double
}

