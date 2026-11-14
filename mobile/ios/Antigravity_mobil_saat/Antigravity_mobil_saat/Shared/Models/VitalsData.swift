//
//  VitalsData.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation

struct VitalsData: Codable {
    let currentHeartRate: Double
    let restingHeartRate: Double?
    let bloodOxygenPercentage: Double?
    let bodyTemperature: Double?
}
