//
//  PlanetHeroHeader.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

struct PlanetHeroHeader: View {
    let greeting: String
    var subtitle: String? = nil
    let statusTitle: String
    let status: HealthStatus

    var body: some View {
        GlassCardView(cornerRadius: 22, padding: 20) {
            HStack(spacing: 16) {
                VStack(alignment: .leading, spacing: 6) {
                    Text(greeting)
                        .font(.title2.weight(.bold))
                        .foregroundStyle(ColorTheme.textPrimary)
                        .lineLimit(1)
                        .minimumScaleFactor(0.75)

                    if let subtitle, !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.caption.weight(.medium))
                            .foregroundStyle(ColorTheme.textMuted)
                            .lineLimit(1)
                    }

                    Text(statusTitle)
                        .font(.headline.weight(.semibold))
                        .foregroundStyle(status.themeColor)
                }

                Spacer(minLength: 8)

                Image(systemName: status.systemIconName)
                    .font(.system(size: 32, weight: .semibold))
                    .foregroundStyle(status.themeColor)
            }
        }
    }
}

#Preview {
    ZStack {
        ColorTheme.spaceBackdropGradient.ignoresSafeArea()
        VStack(spacing: 16) {
            PlanetHeroHeader(
                greeting: "Hoşgeldiniz, Dr. Elena Vance",
                subtitle: "ISS Expedition 74 • Gün 42",
                statusTitle: "Sistemler Normal",
                status: .green
            )
            PlanetHeroHeader(
                greeting: "Hoşgeldiniz, Dr. Elena Vance",
                subtitle: "ISS Expedition 74 • Gün 42",
                statusTitle: "Kontrol Gerekli",
                status: .amber
            )
        }
        .padding()
    }
    .preferredColorScheme(.dark)
}
