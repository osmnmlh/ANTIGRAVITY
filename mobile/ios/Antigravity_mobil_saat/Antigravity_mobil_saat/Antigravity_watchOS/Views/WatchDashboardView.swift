//
//  WatchDashboardView.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI
 
/// Simple Apple Watch screen showing live mock vitals and, whenever any threshold
/// is breached, a bold ALL CAPS alert banner backed by continuous wrist haptics.
struct WatchDashboardView: View {
    @ObservedObject var coordinator: AlertCoordinator
    @ObservedObject var hapticManager: HapticManager

    init(coordinator: AlertCoordinator) {
        self.coordinator = coordinator
        self.hapticManager = coordinator.hapticManager
    }

    var body: some View {
        ScrollView {
            VStack(spacing: 10) {
                if let title = coordinator.uppercaseWarningTitle,
                   let detail = coordinator.uppercaseWarningDetail {
                    alertCard(title: title, detail: detail)
                } else {
                    normalStatusHeader
                }

                vitalsSummaryCard

                if coordinator.overallStatus == .amber || coordinator.overallStatus == .red {
                    Button {
                        coordinator.toggleMute()
                    } label: {
                        Label(
                            coordinator.isMuted ? "TİTREŞİMİ AÇ" : "TİTREŞİMİ SUSTUR",
                            systemImage: coordinator.isMuted ? "bell.fill" : "bell.slash.fill"
                        )
                        .font(.caption.bold())
                        .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(coordinator.isMuted ? .orange : .red)
                }

                Button {
                    coordinator.toggleSpikeSimulation()
                } label: {
                    Text(coordinator.isSimulatingSpike ? "Normale Dön" : "Eşik Testi Yap")
                        .font(.caption2.weight(.semibold))
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.bordered)
                .tint(.secondary)

                Text(HealthThresholds.demoDisclaimer)
                    .font(.system(size: 10))
                    .foregroundStyle(.secondary)
                    .multilineTextAlignment(.center)
                    .padding(.top, 2)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
        }
        .background(backgroundTint.ignoresSafeArea())
        .animation(.snappy(duration: 0.2), value: coordinator.overallStatus)
    }

    private var normalStatusHeader: some View {
        VStack(spacing: 4) {
            HStack(spacing: 6) {
                Image(systemName: coordinator.overallStatus.systemIconName)
                    .foregroundStyle(coordinator.overallStatus.themeColor)
                Text("SİSTEMLER NORMAL")
                    .font(.caption.bold())
                    .foregroundStyle(coordinator.overallStatus.themeColor)
            }
            Text("Canlı Mock Veri")
                .font(.caption2)
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private func alertCard(title: String, detail: String) -> some View {
        VStack(spacing: 6) {
            HStack(spacing: 5) {
                Image(systemName: coordinator.overallStatus == .red ? "exclamationmark.octagon.fill" : "exclamationmark.triangle.fill")
                    .font(.title3)
                Text(hapticBadgeText)
                    .font(.system(size: 11, weight: .heavy))
            }
            .foregroundStyle(.white)

            Text(title)
                .font(.system(size: 14, weight: .black))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .minimumScaleFactor(0.75)

            Text(detail)
                .font(.system(size: 13, weight: .bold))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.95))
        }
        .frame(maxWidth: .infinity)
        .padding(10)
        .background(
            coordinator.overallStatus == .red ? Color.red : Color.orange,
            in: RoundedRectangle(cornerRadius: 14)
        )
    }

    private var hapticBadgeText: String {
        if coordinator.isMuted {
            return "SUSTURULDU"
        }
        return hapticManager.isVibrating ? "TİTRİYOR" : "UYARI AKTİF"
    }

    private var vitalsSummaryCard: some View {
        VStack(spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Image(systemName: "heart.fill")
                    .foregroundStyle(coordinator.heartRateStatus.themeColor)
                Text("\(coordinator.heartRate)")
                    .font(.system(size: 36, weight: .bold, design: .rounded))
                    .monospacedDigit()
                    .foregroundStyle(coordinator.heartRateStatus.themeColor)
                Text("BPM")
                    .font(.caption2.bold())
                    .foregroundStyle(.secondary)
            }

            HStack(spacing: 12) {
                Label(coordinator.spo2.map { "%\($0)" } ?? "--", systemImage: "lungs.fill")
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(coordinator.spo2Status.themeColor)

                Label(
                    coordinator.bodyTemp.map { String(format: "%.1f°C", $0) } ?? "--",
                    systemImage: "thermometer.medium"
                )
                    .font(.caption2.weight(.semibold))
                    .foregroundStyle(coordinator.bodyTempStatus.themeColor)
            }
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 8)
        .background(Color.white.opacity(0.08), in: RoundedRectangle(cornerRadius: 12))
    }

    private var backgroundTint: Color {
        switch coordinator.overallStatus {
        case .red:
            return Color.red.opacity(0.22)
        case .amber:
            return Color.orange.opacity(0.16)
        case .green, .missing:
            return Color.black
        }
    }
}

#Preview("Normal") {
    WatchDashboardView(coordinator: .preview(status: .green))
}

#Preview("Dikkat - Amber") {
    WatchDashboardView(coordinator: .preview(status: .amber))
}

#Preview("Acil - Kırmızı") {
    WatchDashboardView(coordinator: .preview(status: .red))
}
