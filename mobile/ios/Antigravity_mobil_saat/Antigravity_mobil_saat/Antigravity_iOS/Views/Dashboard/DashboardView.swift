//
//  DashboardView.swift
//  Antigravity_mobil_saat
//
//  Created by Emirhan Gökçe on 14.11.2026.
//

import SwiftUI

struct DashboardView: View {
    @ObservedObject var viewModel: DashboardViewModel
    var onSelectTab: (AppTab) -> Void = { _ in }

    private static let watchSyncFormatter: DateFormatter = {
        let formatter = DateFormatter()
        formatter.locale = Locale(identifier: "tr_TR")
        formatter.dateFormat = "HH:mm:ss"
        return formatter
    }()

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 12) {
                PlanetHeroHeader(
                    greeting: "Hoşgeldiniz Kaptan,",
                    statusTitle: viewModel.heroStatusTitle,
                    status: viewModel.overallStatus
                )

                ForEach(viewModel.activeAlerts) { alert in
                    proactiveAlertCard(alert)
                }

                AstronautBodyMapView(
                    values: viewModel.indicatorValues,
                    statuses: viewModel.indicatorStatuses
                )

                missionsCard

                if let guidance = viewModel.aiGuidance {
                    aiGuidanceCard(guidance)
                }

                if let syncedAt = viewModel.lastWatchSyncAt {
                    Label(
                        "Apple Watch Eşitlendi • \(Self.watchSyncFormatter.string(from: syncedAt))",
                        systemImage: "applewatch.radiowaves.left.and.right"
                    )
                    .font(.caption2.monospacedDigit())
                    .foregroundStyle(ColorTheme.accent)
                }
            }
            .padding(.horizontal, 16)
            .padding(.top, 8)
            .padding(.bottom, 16)
        }
        .refreshable {
            await viewModel.syncFromBackend()
        }
        .toolbar(.hidden, for: .navigationBar)
    }

    // MARK: - Subviews

    private var missionsCard: some View {
        Button {
            onSelectTab(.missions)
        } label: {
            GlassCardView(cornerRadius: 20, padding: 14) {
                VStack(alignment: .leading, spacing: 10) {
                    HStack(spacing: 10) {
                        Image(systemName: "checklist")
                            .font(.headline)
                            .foregroundStyle(ColorTheme.accent)

                        Text("Görevler")
                            .font(.headline)
                            .foregroundStyle(ColorTheme.textPrimary)

                        Spacer()

                        Text("%\(viewModel.missionCompletionPercent) Tamamlandı")
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(ColorTheme.textPrimary)

                        Text("\(viewModel.completedMissionsCount)/\(viewModel.totalMissionsCount)")
                            .font(.caption.weight(.semibold).monospacedDigit())
                            .foregroundStyle(ColorTheme.textMuted)
                            .padding(.horizontal, 8)
                            .padding(.vertical, 3)
                            .background(Color.white.opacity(0.08), in: Capsule())

                        Image(systemName: "chevron.right")
                            .font(.caption.weight(.semibold))
                            .foregroundStyle(ColorTheme.textMuted)
                    }

                    ProgressView(value: viewModel.missionCompletionRatio)
                        .tint(viewModel.missionCompletionPercent == 100 ? ColorTheme.statusGreen : ColorTheme.accent)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
        }
        .buttonStyle(.plain)
    }

    private func aiGuidanceCard(_ guidance: AiGuidance) -> some View {
        GlassCardView(cornerRadius: 20, padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: "sparkles")
                        .font(.headline)
                        .foregroundStyle(ColorTheme.accent)

                    Text("AI Önerisi")
                        .font(.headline)
                        .foregroundStyle(ColorTheme.textPrimary)

                    Spacer()

                    Text(viewModel.overallStatus.turkishLabel)
                        .font(.caption2.weight(.semibold))
                        .foregroundStyle(viewModel.overallStatus.themeColor)
                }

                Text(guidance.summary)
                    .font(.subheadline)
                    .foregroundStyle(ColorTheme.textPrimary)

                if !guidance.actions.isEmpty {
                    VStack(alignment: .leading, spacing: 5) {
                        ForEach(guidance.actions, id: \.self) { action in
                            HStack(alignment: .top, spacing: 8) {
                                Text("•")
                                    .foregroundStyle(ColorTheme.accent)
                                Text(action)
                                    .font(.caption)
                                    .foregroundStyle(ColorTheme.textMuted)
                            }
                        }
                    }
                }

                Divider()
                    .overlay(ColorTheme.spaceBorder)

                Text(guidance.escalate)
                    .font(.caption.weight(.medium))
                    .foregroundStyle(ColorTheme.textPrimary.opacity(0.9))
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }

    private func proactiveAlertCard(_ alert: AiAlert) -> some View {
        let severityColor = alert.severity.themeColor
        return GlassCardView(cornerRadius: 20, padding: 14) {
            VStack(alignment: .leading, spacing: 8) {
                HStack(spacing: 8) {
                    Image(systemName: alert.severity.systemIconName)
                        .font(.headline)
                        .foregroundStyle(severityColor)

                    Text(alert.title)
                        .font(.subheadline.weight(.bold))
                        .foregroundStyle(ColorTheme.textPrimary)

                    Spacer()

                    Button("Anladım") {
                        Task {
                            await viewModel.acknowledgeAlert(alert)
                        }
                    }
                    .font(.caption.weight(.semibold))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(severityColor.opacity(0.22), in: Capsule())
                    .foregroundStyle(severityColor)
                }

                if let summary = alert.advice?.summary, !summary.isEmpty {
                    Text(summary)
                        .font(.caption)
                        .foregroundStyle(ColorTheme.textPrimary)
                } else {
                    Text(alert.spokenText)
                        .font(.caption)
                        .foregroundStyle(ColorTheme.textPrimary)
                }

                if let escalate = alert.advice?.escalate, !escalate.isEmpty {
                    Text(escalate)
                        .font(.caption2.weight(.medium))
                        .foregroundStyle(severityColor)
                }
            }
            .frame(maxWidth: .infinity, alignment: .leading)
        }
    }
}

#Preview {
    NavigationStack {
        ZStack {
            ColorTheme.spaceBackdropGradient.ignoresSafeArea()
            DashboardView(viewModel: DashboardViewModel())
        }
    }
    .preferredColorScheme(.dark)
}
