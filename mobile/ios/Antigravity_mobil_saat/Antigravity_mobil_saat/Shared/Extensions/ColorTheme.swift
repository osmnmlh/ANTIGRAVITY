//
//  ColorTheme.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

enum ColorTheme {
    // Sade, temiz koyu tema paleti (Apple Dark UI uyumlu)
    static let spaceBackground = Color(red: 0.043, green: 0.055, blue: 0.078) // #0B0E14
    static let spaceSurface = Color(red: 0.082, green: 0.102, blue: 0.137)    // #151A23
    static let spaceRaised = Color(red: 0.110, green: 0.133, blue: 0.176)     // #1C222D
    static let spaceBorder = Color.white.opacity(0.12)

    // Vurgu ve durum renkleri (neon değil, doğal sistem tonları)
    static let accent = Color(red: 0.353, green: 0.784, blue: 0.980)          // Soft Sky Blue
    static let statusGreen = Color(red: 0.188, green: 0.820, blue: 0.345)     // Apple System Green
    static let statusAmber = Color(red: 1.000, green: 0.624, blue: 0.039)     // Apple System Orange
    static let statusRed = Color(red: 1.000, green: 0.271, blue: 0.227)       // Apple System Red
    static let statusMissing = Color(red: 0.557, green: 0.557, blue: 0.576)   // Secondary Gray

    // Metin renkleri
    static let textPrimary = Color.white
    static let textMuted = Color.white.opacity(0.62)

    static var spaceBackdropGradient: LinearGradient {
        LinearGradient(
            colors: [
                Color(red: 0.055, green: 0.071, blue: 0.102),
                spaceBackground
            ],
            startPoint: .top,
            endPoint: .bottom
        )
    }
}

extension HealthStatus {
    var themeColor: Color {
        switch self {
        case .green: return ColorTheme.statusGreen
        case .amber: return ColorTheme.statusAmber
        case .red: return ColorTheme.statusRed
        case .missing: return ColorTheme.statusMissing
        }
    }

    var turkishLabel: String {
        switch self {
        case .green: return "Normal"
        case .amber: return "Kontrol Gerekli"
        case .red: return "Kritik"
        case .missing: return "Veri Yok"
        }
    }
}
