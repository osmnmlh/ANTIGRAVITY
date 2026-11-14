//
//  LogbookView.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

struct LogbookView: View {
    @ObservedObject var dashboardViewModel: DashboardViewModel

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(alignment: .leading, spacing: 14) {
                GlassCardView(cornerRadius: 20, padding: 16) {
                    VStack(alignment: .leading, spacing: 8) {
                        Label("Son Telemetri", systemImage: "clock")
                            .font(.headline)
                            .foregroundStyle(ColorTheme.textPrimary)

                        if let telemetry = dashboardViewModel.latestTelemetry {
                            Text(telemetry.syncTimestamp.toStardateString())
                                .font(.caption.monospaced())
                                .foregroundStyle(ColorTheme.textMuted)
                            Text("Kaynak: \(telemetry.deviceModel)")
                                .font(.caption)
                                .foregroundStyle(ColorTheme.textMuted)
                        } else {
                            Text("Henüz telemetri kaydı yok.")
                                .font(.caption)
                                .foregroundStyle(ColorTheme.textMuted)
                        }
                    }
                    .frame(maxWidth: .infinity, alignment: .leading)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 12)
            .padding(.bottom, 24)
        }
        .navigationTitle("Kayıtlar")
        .navigationBarTitleDisplayMode(.large)
    }
}

#Preview {
    NavigationStack {
        ZStack {
            ColorTheme.spaceBackdropGradient.ignoresSafeArea()
            LogbookView(dashboardViewModel: DashboardViewModel())
        }
    }
    .preferredColorScheme(.dark)
}
