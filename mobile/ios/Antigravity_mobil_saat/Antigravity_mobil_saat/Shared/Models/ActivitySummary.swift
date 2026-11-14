//
//  ActivitySummary.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import Foundation

struct ActivitySummary: Codable {
    let stepCount: Int
    let activeCaloriesBurned: Double
    let exerciseMinutes: Int
    let standHours: Int
    let distanceMeters: Double
}
