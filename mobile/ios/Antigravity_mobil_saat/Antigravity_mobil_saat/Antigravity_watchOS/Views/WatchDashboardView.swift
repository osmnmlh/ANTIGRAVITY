//
//  WatchDashboardView.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

/// Two-page Apple Watch companion view:
/// 1) Status glance (overall color, simulated HR/SpO2/Temp, last sync time, continuous haptics)
/// 2) 5-second mood (1-5) and symptom check-in sent to the paired iPhone via WatchConnectivity
struct WatchDashboardView: View {
    @ObservedObject var coordinator: AlertCoordinator
    @ObservedObject var hapticManager: HapticManager

    @State private var selectedMood: Int = 4
    @State private var selectedSymptoms: Set<String> = []

    private let availableSymptoms = ["Baş ağrısı", "Bulantı", "Yorgunluk", "Bel ağrısı"]

    private static let syncTimeFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "tr_TR")
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()

    init(coordinator: AlertCoordinator) {
        self.coordinator = coordinator
        self.hapticManager = coordinator.hapticManager
    }

    var body: some View {
        TabView {
            statusGlancePage
            quickCheckInPage
        }
        .tabViewStyle(.verticalPage)
    }

    // MARK: - Page 1: Status Glance

    private var statusGlancePage: some View {
        ScrollView {
            VStack(spacing: 8) {
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

                Text(lastSyncText)
                    .font(.system(size: 10).monospacedDigit())
                    .foregroundStyle(.secondary)
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
        }
        .background(backgroundTint.ignoresSafeArea())
        .animation(.snappy(duration: 0.2), value: coordinator.overallStatus)
    }

    // MARK: - Page 2: 5-Second Mood & Symptom Check-in

    private var quickCheckInPage: some View {
        ScrollView {
            VStack(spacing: 8) {
                Text("Hızlı Kontrol")
                    .font(.caption.bold())
                    .foregroundStyle(.cyan)

                Text("Ruh Hâli (1–5)")
                    .font(.caption2)
                    .foregroundStyle(.secondary)

                HStack(spacing: 4) {
                    ForEach(1...5, id: \.self) { value in
                        Button {
                            selectedMood = value
                        } label: {
                            Text("\(value)")
                                .font(.caption.bold().monospacedDigit())
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 6)
                                .background(
                                    selectedMood == value ? moodColor(value) : Color.white.opacity(0.12),
                                    in: RoundedRectangle(cornerRadius: 8)
                                )
                                .foregroundStyle(selectedMood == value ? .black : .white)
                        }
                        .buttonStyle(.plain)
                    }
                }

                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 4) {
                    ForEach(availableSymptoms, id: \.self) { symptom in
                        let isSelected = selectedSymptoms.contains(symptom)
                        Button {
                            if isSelected {
                                selectedSymptoms.remove(symptom)
                            } else {
                                selectedSymptoms.insert(symptom)
                            }
                        } label: {
                            Text(symptom)
                                .font(.system(size: 10, weight: .medium))
                                .lineLimit(1)
                                .minimumScaleFactor(0.75)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 5)
                                .padding(.horizontal, 4)
                                .background(
                                    isSelected ? Color.orange.opacity(0.35) : Color.white.opacity(0.08),
                                    in: RoundedRectangle(cornerRadius: 8)
                                )
                                .overlay {
                                    RoundedRectangle(cornerRadius: 8)
                                        .strokeBorder(isSelected ? Color.orange : Color.clear, lineWidth: 1)
                                }
                        }
                        .buttonStyle(.plain)
                    }
                }

                Button {
                    coordinator.sendQuickCheckIn(
                        mood: selectedMood,
                        symptoms: Array(selectedSymptoms).sorted()
                    )
                } label: {
                    Label("iPhone'a Gönder", systemImage: "paperplane.fill")
                        .font(.caption2.bold())
                        .frame(maxWidth: .infinity)
                }
                .buttonStyle(.borderedProminent)
                .tint(.cyan)

                if let msg = coordinator.lastCheckInMessage {
                    Text(msg)
                        .font(.system(size: 10, weight: .semibold))
                        .foregroundStyle(.green)
                        .multilineTextAlignment(.center)
                }
            }
            .padding(.horizontal, 6)
            .padding(.vertical, 4)
        }
        .background(Color.black.ignoresSafeArea())
    }

    // MARK: - Subviews

    private var normalStatusHeader: some View {
        VStack(spacing: 3) {
            HStack(spacing: 6) {
                Image(systemName: coordinator.overallStatus.systemIconName)
                    .foregroundStyle(coordinator.overallStatus.themeColor)
                Text("SİSTEMLER NORMAL")
                    .font(.caption.bold())
                    .foregroundStyle(coordinator.overallStatus.themeColor)
            }
            Text("Simüle Edilen Veri")
                .font(.system(size: 10, weight: .medium))
                .foregroundStyle(.secondary)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 7)
        .background(.ultraThinMaterial, in: RoundedRectangle(cornerRadius: 12))
    }

    private func alertCard(title: String, detail: String) -> some View {
        VStack(spacing: 5) {
            HStack(spacing: 5) {
                Image(systemName: coordinator.overallStatus == .red ? "exclamationmark.octagon.fill" : "exclamationmark.triangle.fill")
                    .font(.title3)
                Text(hapticBadgeText)
                    .font(.system(size: 11, weight: .heavy))
            }
            .foregroundStyle(.white)

            Text(title)
                .font(.system(size: 13, weight: .black))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)
                .minimumScaleFactor(0.75)

            Text(detail)
                .font(.system(size: 12, weight: .bold))
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.95))

            Text("Simüle Edilen Veri")
                .font(.system(size: 9, weight: .semibold))
                .foregroundStyle(.white.opacity(0.8))
        }
        .frame(maxWidth: .infinity)
        .padding(9)
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

    private var lastSyncText: String {
        if let date = coordinator.lastSyncDate {
            return "Son eşitleme: \(Self.syncTimeFormatter.string(from: date))"
        }
        return "Son eşitleme: Bekleniyor"
    }

    private var vitalsSummaryCard: some View {
        VStack(spacing: 6) {
            HStack(alignment: .firstTextBaseline, spacing: 4) {
                Image(systemName: "heart.fill")
                    .foregroundStyle(coordinator.heartRateStatus.themeColor)
                Text("\(coordinator.heartRate)")
                    .font(.system(size: 34, weight: .bold, design: .rounded))
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

    private func moodColor(_ value: Int) -> Color {
        switch value {
        case 4, 5: return ColorTheme.statusGreen
        case 3: return ColorTheme.statusAmber
        default: return ColorTheme.statusRed
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
